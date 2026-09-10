/**
 * Seeds the price catalogue, the landing-page samples and demo accounts.
 *
 * The product rows here are the *baseline test prices* from PROJECT_TASK.md
 * §1.1. They are versioned, and §11 requires them to be re-derived from signed
 * supplier rates and a legal review before anything is actually sold — seeding
 * them is not approval to charge.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  closeDb,
  migrate,
  setRole,
  upsertProduct,
  upsertUser,
  confirmAgeAndTerms,
  grantUnits,
  withTx,
} from '@loopscene/db';
import { loadConfig } from './config.js';
import { resolveFromRoot } from './paths.js';
import { createContext } from './context.js';

const config = loadConfig();
const ctx = createContext(config);

await migrate();

// ---------------------------------------------------------------- catalogue

await upsertProduct({
  price_key: 'drop_5',
  version: 1,
  kind: 'one_time',
  display_name: 'DROP（5回パック）',
  amount_jpy: 980,
  currency: 'jpy',
  tax_included: true,
  units: 5,
  validity_days: 90,
  auto_renew: false,
  stripe_price_id: config.STRIPE_PRICE_ID_DROP_5 ?? null,
  active: true,
});

await upsertProduct({
  price_key: 'creator_monthly',
  version: 1,
  kind: 'subscription',
  display_name: 'CREATOR（月額20回）',
  amount_jpy: 1980,
  currency: 'jpy',
  tax_included: true,
  units: 20,
  validity_days: null,
  auto_renew: true,
  stripe_price_id: config.STRIPE_PRICE_ID_CREATOR_MONTHLY ?? null,
  active: true,
});

console.log('✓ product catalogue seeded (drop_5 v1, creator_monthly v1)');

// ------------------------------------------------------- landing page samples

if (config.adapters.music === 'demo') {
  const dir = resolveFromRoot(config.DEMO_FIXTURES_DIR ?? './assets/fixtures/audio');
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.mp3'));
    for (const file of files) {
      const body = await readFile(join(dir, file));
      await ctx.storage.put({
        zone: 'delivery',
        key: `samples/${file}`,
        body,
        contentType: 'audio/mpeg',
      });
    }
    console.log(`✓ ${files.length} landing-page samples published to the delivery zone`);
  } catch (err) {
    console.warn(`! could not publish samples: ${(err as Error).message}`);
    console.warn('  run "pnpm fixtures:audio" first');
  }
}

// ------------------------------------------------------------ demo accounts

if (config.mode !== 'production') {
  const accounts = [
    { email: 'creator@example.jp', role: 'user' as const, credits: 5, label: 'a creator with a DROP pack' },
    { email: 'empty@example.jp', role: 'user' as const, credits: 0, label: 'a creator with no credits' },
    { email: 'support@example.jp', role: 'support' as const, credits: 0, label: 'support staff' },
    { email: 'admin@example.jp', role: 'admin' as const, credits: 0, label: 'an administrator' },
  ];

  for (const acct of accounts) {
    const externalId = `dev-${Buffer.from(acct.email).toString('hex').slice(0, 24)}`;
    const user = await upsertUser({ authProvider: 'dev', externalId, email: acct.email });
    await confirmAgeAndTerms({ userId: user.id, marketingOptIn: false });
    if (acct.role !== 'user') await setRole({ userId: user.id, role: acct.role });
    if (acct.credits > 0) {
      await withTx(async (tx) => {
        await grantUnits(
          {
            userId: user.id,
            source: 'manual_adjustment',
            sourceRef: `seed:${user.id}`,
            units: acct.credits,
            productKey: 'drop_5',
            priceVersion: 1,
            expiresAt: new Date(Date.now() + 90 * 86400_000),
            reason: 'seed_demo_credits',
          },
          tx,
        );
      });
    }
    console.log(`✓ ${acct.email.padEnd(22)} ${acct.label} (${acct.credits} credits)`);
  }
  console.log('\n  Sign in from the web app with any of the addresses above.');
  console.log('  These are development identities and exist only outside production.');
}

await closeDb();
