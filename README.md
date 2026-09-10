# LOOPSCENE

30秒のインスト（歌詞・ボーカルなし）BGMを生成する、日本のショート動画クリエイター向けWebサービスの MVP 実装です。

Implementation of `PROJECT_TASK.md`. Read that first — it is the acceptance
specification, and this README only explains how to run and verify what was built.

> **This is not ready to charge anyone.** No music-provider agreement is signed,
> no legal review has happened, and no AWS account has been provisioned. Demo
> mode uses synthesised audio and simulated payments, and says so continuously in
> the interface. See [`docs/LAUNCH_READINESS.md`](docs/LAUNCH_READINESS.md) for
> the full list of what is still missing.

---

## Quick start

Requirements: **Node ≥ 22.13**, **pnpm 11**, **Docker** (for MySQL), **ffmpeg**.

```bash
cp .env.example .env
# Fill in the two secrets the demo needs:
#   DEV_AUTH_SECRET       — openssl rand -hex 32
#   STORAGE_SIGNING_SECRET — openssl rand -hex 32

pnpm bootstrap    # install, synthesise audio fixtures, start MySQL, migrate, seed
pnpm dev          # API :4000, worker, web :5173
```

Then open <http://localhost:5173> and sign in with one of the seeded demo
accounts:

| Account | Purpose |
| --- | --- |
| `creator@example.jp` | ordinary creator with 5 credits |
| `empty@example.jp` | creator with no credits (tests the top-up path) |
| `support@example.jp` | support role — read-only console plus compensation |
| `admin@example.jp` | administrator — rights cases and feature switches |

These are **development identities**. `loadConfig` refuses to start in
production mode if the dev auth adapter is selected, so they cannot exist there.

### Commands

| Command | What it does |
| --- | --- |
| `pnpm bootstrap` | One-shot local setup (install → fixtures → database → migrate → seed) |
| `pnpm dev` | API, worker and web together |
| `pnpm build` | Build every package and app |
| `pnpm typecheck` | Typecheck the whole workspace |
| `pnpm test` | Full test suite against a real MySQL |
| `pnpm db:up` / `db:down` | Start / stop the MySQL containers |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:reset` | Drop and recreate (refuses anything not named dev/test/local) |
| `pnpm seed` | Price catalogue, landing samples, demo accounts |
| `pnpm fixtures:audio` | Re-synthesise the demo audio fixtures |

---

## Run modes

The mode is one explicit value, and the adapter selection has to be consistent
with it. An illegal combination fails at start-up rather than producing a
half-real service (`PROJECT_TASK.md` §3.1).

| Mode | Identity | Audio | Payments | Notes |
| --- | --- | --- | --- | --- |
| `demo` | dev login | synthesised fixtures | simulated | Local development. Banner always visible. |
| `integration` | Cognito or dev | real provider as credentials allow | Stripe **test** mode | Record which dependencies are real per run. |
| `production` | Cognito only | licensed provider only | Stripe live | Refuses to boot without real legal-entity details. |

Production refuses, at start-up, to run with: the development login, the demo
music adapter, simulated payments, local storage, a test Stripe key, a
`DEV_AUTH_SECRET`, `DATABASE_SSL=false`, or placeholder 特定商取引法 details.
Those refusals are covered by tests in `tests/security.test.ts`.

Two further guards apply in every mode:

- `MUSIC_COMMERCIAL_DELIVERY=true` is rejected while the demo adapter is in use.
  A synthesised tone has no agreement behind it and can never carry a commercial
  licence (SEC-09).
- `FEATURE_WAV_EXPORT_ENABLED=true` is rejected unless the provider actually
  delivers lossless audio. Transcoding MP3 to WAV is not a quality upgrade and
  is not offered as one (UI-07).

---

## Architecture at a glance

```
apps/web        React SPA (Japanese, mobile-first) → S3 + CloudFront
apps/api        Fastify modular monolith           → ALB → EKS
apps/worker     Outbox dispatch, provider calls, audio processing, webhooks
packages/contracts   zod schemas, error codes, business enums
packages/providers   TokenStars, music, storage, queue, payments adapters
packages/db          Migrations, repositories, the credit ledger
infra/terraform      AWS (Tokyo): EKS, RDS MySQL, S3, SQS, Cognito, CloudFront
infra/helm           API + worker deployment, digest-pinned
```

Request path: the API creates the job, reserves a credit and writes an outbox
row **in one transaction**; the worker dispatches to SQS, calls the providers,
verifies the audio and delivers. The browser polls with backoff — no request is
ever held open waiting for audio.

`docs/ARCHITECTURE.md` has the full picture, including the state machine and the
ledger design.

### Database: MySQL, not PostgreSQL

`PROJECT_TASK.md` §1.1 and §4 say "RDS PostgreSQL". The actual deployment target
is a **MySQL-compatible RDS**, so `packages/db` targets **MySQL 8.0 / Aurora
MySQL 3.x**. 8.0 is a hard floor — three of its features carry the ledger's
correctness guarantees:

| Feature | Used for |
| --- | --- |
| `SELECT … FOR UPDATE SKIP LOCKED` | Job, outbox and queue claiming without two workers colliding |
| Enforced `CHECK` constraints | The anti-oversell invariant on `entitlement_batches` |
| `STORED` generated columns | Standing in for PostgreSQL partial unique indexes (a unique index ignores NULLs) |

One operational consequence: creating the licence-immutability trigger (SEC-08)
requires `log_bin_trust_function_creators=1`. It is set in `docker-compose.yml`
locally and in the RDS parameter group in `infra/terraform/data.tf`. The
migration fails with an explicit message rather than skipping the trigger.

---

## Testing

```bash
pnpm db:up          # the test database runs on :53307, separate from dev
pnpm test
```

103 tests run against a **real MySQL instance**, never an in-memory stand-in —
§12.1 requires the ledger transactions, concurrency and unique constraints to be
verified against the engine that actually enforces them.

| File | Covers |
| --- | --- |
| `tests/ledger.test.ts` | GEN-01/03/08/09/11, PAY-05/09, reconciliation, concurrent contention |
| `tests/generation.test.ts` | The HTTP surface and the real worker pipeline: GEN-01…12, AI-03/05/06 |
| `tests/payments.test.ts` | PAY-01…11 through the real webhook pipeline |
| `tests/security.test.ts` | SEC-01…13, SSRF guards, run-mode boundaries, audit logging |

Fault injection uses markers (`__FAULT_FAIL__`, `__FAULT_REJECT__`,
`__FAULT_UNKNOWN__`) carried in the generation brief, so failure tests drive the
same production code path rather than a test-only branch inside the worker.

---

## Demo audio

Every fixture in `assets/fixtures/audio/` is synthesised from scratch by
`scripts/make-audio-fixtures.mjs` using ffmpeg oscillators and noise sources.
There is no third-party recording, sample or model output in any of them, so the
demo path carries no licensing question at all.

They are synthetic tones, not music. Per §8 they demonstrate that the
engineering pipeline works; they are not evidence of model quality, originality
or commercial value.

---

## Deployment

Terraform and Helm are written to be reviewable and are validated in CI
(`terraform validate`, `helm lint`, `helm template`). **Nothing has been
applied** — no AWS account has been authorised for this project, so every AWS
acceptance item is recorded as `BLOCKED_EXTERNAL` in `docs/ACCEPTANCE.md`.

```bash
docker build -t loopscene:local .    # one image, both workloads
terraform -chdir=infra/terraform init -backend=false && terraform -chdir=infra/terraform validate
helm template loopscene infra/helm/loopscene --set image.api.digest=sha256:… --set image.worker.digest=sha256:…
```

The Helm chart **refuses to render** without digest-pinned images: a mutable tag
would make "roll back to the previous release" ambiguous.

`docs/OPERATIONS.md` covers deployment, refunds, compensation, reconciliation,
alerts, rollback and recovery.

---

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Modules, data flow, state machine, schema, design trade-offs |
| [`docs/API.md`](docs/API.md) | Endpoints, error codes, idempotency rules |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | Deploy, refund, compensate, reconcile, alert, roll back, recover |
| [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) | Every UI/GEN/PAY/AI/SEC item with a result and evidence |
| [`docs/OPEN_ITEMS.md`](docs/OPEN_ITEMS.md) | What is unfinished, what is blocked, and on whom |
| [`docs/LAUNCH_READINESS.md`](docs/LAUNCH_READINESS.md) | What must be true before charging anyone |

---

## Scope

Built: scene-based 30s instrumental generation, async job pipeline, credit
ledger, Stripe payments and subscriptions, private library, trimming and export,
per-track usage records, rights-complaint handling, operations console.

Deliberately **not** built (`PROJECT_TASK.md` §1.2): lyrics, vocals, voice
imitation, cover versions, reference-audio upload, music distribution, royalty
splitting, Content ID registration, a public community, remixing, annual or
unlimited plans, auto top-up, transferable credit balances, native apps, and
video upload or composition.

None of these are reachable through a hidden entry point or a provider default —
`vocalMode` is re-imposed server-side on every request, and the input screen
rejects lyric, vocal and voice-imitation prompts before any spend occurs.
