import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, type MeView } from '@loopscene/contracts';
import { confirmAgeAndTerms, setMarketingOptIn, trackEvent, upsertUser } from '@loopscene/db';
import type { AppContext } from '../context.js';
import { DevAuthAdapter, type AuthAdapter } from '../auth/index.js';
import { grantTrialIfEligible } from '../services/billing.js';

const devLoginSchema = z.object({
  email: z.string().email(),
  /** UI-02: 18+ confirmation is explicit and separate from the terms checkbox. */
  ageConfirmed: z.literal(true),
  termsAccepted: z.literal(true),
  /** Defaults to false; the UI must never pre-check it. */
  marketingOptIn: z.boolean().default(false),
});

function toMeView(u: {
  id: string;
  email: string;
  display_name: string | null;
  role: MeView['role'];
  age_confirmed_at: Date | null;
  marketing_opt_in: boolean;
  created_at: Date;
}): MeView {
  return {
    userId: u.id,
    email: u.email,
    displayName: u.display_name,
    role: u.role,
    ageConfirmed: u.age_confirmed_at !== null,
    marketingOptIn: u.marketing_opt_in,
    createdAt: u.created_at.toISOString(),
  };
}

export default async function authRoutes(
  app: FastifyInstance,
  opts: { ctx: AppContext; adapter: AuthAdapter },
) {
  const { ctx, adapter } = opts;

  app.get('/v1/me', { preHandler: app.requireAuth }, async (req) => toMeView(req.user!));

  /** UI-02: age and terms confirmation, with marketing consent kept separate. */
  app.post('/v1/me/consent', { preHandler: app.requireAuth }, async (req) => {
    const body = z
      .object({
        ageConfirmed: z.literal(true),
        termsAccepted: z.literal(true),
        marketingOptIn: z.boolean().default(false),
      })
      .parse(req.body);

    const updated = await confirmAgeAndTerms({
      userId: req.user!.id,
      marketingOptIn: body.marketingOptIn,
    });
    if (!updated) throw new AppError('NOT_FOUND', 'user not found');
    await grantTrialIfEligible(ctx, updated.id);
    return toMeView(updated);
  });

  /** SEC-11: unsubscribing from marketing is its own action, unrelated to billing. */
  app.post('/v1/me/marketing', { preHandler: app.requireAuth }, async (req) => {
    const body = z.object({ optIn: z.boolean() }).parse(req.body);
    await setMarketingOptIn({ userId: req.user!.id, optIn: body.optIn });
    return { marketingOptIn: body.optIn };
  });

  /**
   * Development login. Registered only when the dev auth adapter is active,
   * which `loadConfig` forbids in production (SEC-03). It still issues a real
   * signed bearer token so the client-side auth path is genuinely exercised.
   */
  if (adapter instanceof DevAuthAdapter) {
    const dev = adapter;
    app.post('/v1/auth/dev-login', async (req) => {
      if (ctx.config.mode === 'production') {
        throw new AppError('FORBIDDEN', 'development login does not exist in production');
      }
      const body = devLoginSchema.parse(req.body);
      const externalId = `dev-${Buffer.from(body.email.toLowerCase()).toString('hex').slice(0, 24)}`;
      const user = await upsertUser({
        authProvider: 'dev',
        externalId,
        email: body.email,
      });
      const confirmed = await confirmAgeAndTerms({
        userId: user.id,
        marketingOptIn: body.marketingOptIn,
      });
      await grantTrialIfEligible(ctx, user.id);
      await trackEvent({
        name: 'signup_completed',
        userRef: user.id,
        runMode: ctx.config.mode,
        isInternal: true,
      });
      const token = dev.issue({ externalId, email: body.email });
      return {
        token: token.token,
        expiresAt: token.expiresAt.toISOString(),
        user: toMeView(confirmed ?? user),
        // The web app keeps the demo banner up while this is true.
        demo: ctx.config.isDemo,
      };
    });
  }

  /**
   * Cognito is the identity provider in integration/production: the email OTP
   * flow runs against Cognito's own hosted challenge, and this API only ever
   * validates the resulting id token. There is deliberately no endpoint here
   * that sends codes or accepts passwords.
   */
  app.get('/v1/auth/config', async () => {
    if (ctx.config.adapters.auth === 'cognito') {
      return {
        adapter: 'cognito' as const,
        region: ctx.config.COGNITO_REGION,
        userPoolId: ctx.config.COGNITO_USER_POOL_ID,
        appClientId: ctx.config.COGNITO_APP_CLIENT_ID,
      };
    }
    return { adapter: 'dev' as const, note: 'development identity — demo mode only' };
  });

  /**
   * SEC-11: account deletion is distinct from cancelling a subscription and
   * from unsubscribing marketing, and the response states what is retained.
   */
  app.post('/v1/me/deletion-request', { preHandler: app.requireAuth }, async (req) => {
    const body = z.object({ reason: z.string().max(1000).optional() }).parse(req.body ?? {});
    const ticket = randomUUID();
    await trackEvent({
      name: 'account_deletion_requested',
      userRef: req.user!.id,
      props: { ticket, has_reason: !!body.reason },
      runMode: ctx.config.mode,
      isInternal: ctx.config.isDemo,
    });
    return {
      ticket,
      status: 'received',
      // Retention scope and periods are configured and disclosed separately in
      // the privacy page; they are not decided here.
      retained: [
        '取引記録（注文・支払・返金）: 法令上の保存義務のため',
        '権利申立の対象となっている楽曲および証拠: 調査終了まで',
      ],
      removed: ['アカウント情報', '生成した楽曲と書き出しファイル', 'マーケティング配信先'],
      note: '停止・削除・配信停止はそれぞれ別の操作です。実際の削除は本人確認後に実行されます。',
    };
  });
}
