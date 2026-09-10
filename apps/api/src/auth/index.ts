import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppError, type UserRole } from '@loopscene/contracts';
import { findByExternalId, upsertUser, type UserRow } from '@loopscene/db';
import type { AppConfig } from '../config.js';

export interface AuthPrincipal {
  userId: string;
  email: string;
  role: UserRole;
  ageConfirmed: boolean;
  /** Which adapter authenticated this request; recorded in audit entries. */
  authProvider: string;
}

export interface AuthAdapter {
  readonly kind: string;
  /** Verifies a bearer token and returns the local user, creating it on first sight. */
  verify(token: string): Promise<UserRow>;
}

/**
 * Cognito adapter (SEC-02).
 *
 * Checks the signature against the pool's JWKS, plus issuer, audience/client
 * binding, expiry and token *use*: an access token is not accepted where an id
 * token is expected. Role is never read from the token — it comes from our own
 * users table, so an IdP attribute cannot escalate privilege.
 */
export class CognitoAuthAdapter implements AuthAdapter {
  readonly kind = 'cognito';
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly clientId: string;

  constructor(params: { region: string; userPoolId: string; appClientId: string }) {
    this.issuer = `https://cognito-idp.${params.region}.amazonaws.com/${params.userPoolId}`;
    this.clientId = params.appClientId;
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
  }

  async verify(token: string): Promise<UserRow> {
    let payload;
    try {
      ({ payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        algorithms: ['RS256'],
        clockTolerance: 30,
      }));
    } catch (err) {
      throw new AppError('UNAUTHENTICATED', `token verification failed: ${(err as Error).message}`);
    }

    if (payload['token_use'] !== 'id') {
      throw new AppError('UNAUTHENTICATED', 'an id token is required for this API');
    }
    // Application binding: the token must have been issued for our app client.
    const aud = payload.aud;
    const audOk = Array.isArray(aud) ? aud.includes(this.clientId) : aud === this.clientId;
    if (!audOk) throw new AppError('UNAUTHENTICATED', 'token audience does not match the app client');

    const sub = payload.sub;
    const email = payload['email'];
    if (typeof sub !== 'string' || typeof email !== 'string') {
      throw new AppError('UNAUTHENTICATED', 'token is missing sub or email');
    }
    if (payload['email_verified'] === false) {
      throw new AppError('UNAUTHENTICATED', 'email address is not verified');
    }
    return upsertUser({ authProvider: 'cognito', externalId: sub, email });
  }
}

/**
 * Development identity for demo mode.
 *
 * Issues an HMAC-signed opaque token so the local flow exercises real bearer
 * auth rather than a "pretend I am user X" header. `loadConfig` refuses to
 * construct this in production mode (SEC-03), and every user it creates is
 * stored with auth_provider = 'dev', keeping the two identity spaces
 * permanently distinguishable.
 */
export class DevAuthAdapter implements AuthAdapter {
  readonly kind = 'dev';
  private readonly secret: string;
  private readonly ttlSeconds: number;

  constructor(params: { secret: string; ttlSeconds?: number }) {
    this.secret = params.secret;
    this.ttlSeconds = params.ttlSeconds ?? 7 * 24 * 3600;
  }

  issue(params: { externalId: string; email: string }): { token: string; expiresAt: Date } {
    const exp = Math.floor(Date.now() / 1000) + this.ttlSeconds;
    const body = Buffer.from(
      JSON.stringify({ sub: params.externalId, email: params.email, exp, nonce: randomBytes(8).toString('hex') }),
      'utf8',
    ).toString('base64url');
    const sig = createHmac('sha256', this.secret).update(body).digest('base64url');
    return { token: `${body}.${sig}`, expiresAt: new Date(exp * 1000) };
  }

  async verify(token: string): Promise<UserRow> {
    const [body, sig] = token.split('.');
    if (!body || !sig) throw new AppError('UNAUTHENTICATED', 'malformed dev token');
    const expected = createHmac('sha256', this.secret).update(body).digest('base64url');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(sig, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new AppError('UNAUTHENTICATED', 'invalid dev token signature');
    }
    let payload: { sub?: string; email?: string; exp?: number };
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      throw new AppError('UNAUTHENTICATED', 'malformed dev token payload');
    }
    if (!payload.sub || !payload.email) throw new AppError('UNAUTHENTICATED', 'dev token is missing sub or email');
    if (!payload.exp || payload.exp * 1000 < Date.now()) throw new AppError('UNAUTHENTICATED', 'dev token expired');

    const existing = await findByExternalId('dev', payload.sub);
    if (existing) return existing;
    return upsertUser({ authProvider: 'dev', externalId: payload.sub, email: payload.email });
  }
}

export function createAuthAdapter(cfg: AppConfig): AuthAdapter {
  if (cfg.adapters.auth === 'cognito') {
    return new CognitoAuthAdapter({
      region: cfg.COGNITO_REGION!,
      userPoolId: cfg.COGNITO_USER_POOL_ID!,
      appClientId: cfg.COGNITO_APP_CLIENT_ID!,
    });
  }
  return new DevAuthAdapter({ secret: cfg.DEV_AUTH_SECRET! });
}
