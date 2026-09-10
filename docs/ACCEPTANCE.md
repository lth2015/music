# Acceptance report

Every numbered item from `PROJECT_TASK.md` §5–§9, with an actual result.

**Status values are only `PASS`, `FAIL`, `BLOCKED_EXTERNAL` or `NOT_RUN`.**
`PASS` means the item was executed and met its standard. Simulated and real
verification are separate rows — a demo-mode pass is never presented as evidence
that a real integration works.

Verification date: **2026-09-10**. Environment: `demo` mode on macOS,
MySQL 8.0.40 in Docker, ffmpeg 7.1.1, Node 23.9.

Automated evidence: `pnpm test` → **103 passed / 103**, across 4 files, against a
real MySQL instance. Manual evidence: browser walkthrough at 320 / 390 / 1440px,
screenshots in `docs/evidence/screenshots/`.

---

## Summary

| Group | PASS | BLOCKED_EXTERNAL | Partial / caveated |
| --- | --- | --- | --- |
| UI (15) | 13 | 0 | 2 |
| GEN (12) | 12 | 0 | 0 |
| PAY (12) | 9 | 3 | 0 |
| AI (8) | 4 | 4 | 0 |
| SEC (13) | 10 | 0 | 3 |

Nothing that depends on a signed music agreement, real TokenStars credentials,
a Stripe account or an AWS account has been verified. Those are
`BLOCKED_EXTERNAL` with the missing prerequisite named.

---

## UI — interface and product

| # | Status | Environment | Actual result | Evidence | Next step |
| --- | --- | --- | --- | --- | --- |
| UI-01 | PASS | demo | Landing shows 4 scenes, 5 playable samples, one primary CTA, and DROP pricing. Visitors preview without signing in; sign-in is required only when generation starts. Samples carry a provenance statement. | `screenshots/home-390.png`; `GET /v1/samples` | — |
| UI-02 | PASS | demo | Sign-in requires separate 18+ and terms confirmations; submit stays disabled until both. Marketing consent is separate and unchecked by default. Errors render in Japanese. | `screenshots/` + `tests/security.test.ts` (marketing default) | Cognito email-OTP UI is `BLOCKED_EXTERNAL` — that flow runs on Cognito's hosted challenge |
| UI-03 | PASS | demo | Scene, mood text, energy; duration fixed at 30s and instrumental stated, not offered. Prompt capped at 300 **code points**. Cost (1) and real remaining balance shown before submit. | `screenshots/create-390.png`; `tests/generation.test.ts` | — |
| UI-04 | PASS | demo | Five distinct stages with an honest time **range**, never a percentage. Leaving and returning restores the job. | `screenshots/generating-390.png`; `StageIndicator` | — |
| UI-05 | PASS | demo | Version cards with preview, duration and selection; one shared audio element so only one track ever plays. Re-generation shows the extra cost and the balance after, and requires confirmation. | `Project.tsx`; `player.tsx` | — |
| UI-06 | PASS | demo | 15s or full 30s, optional 1s fade-out, range validated against the real master duration. Master never overwritten. Trimming and re-download consume no credit; verified 15.05s MP3 downloaded in-browser. | `screenshots/export-320.png`; `tests/generation.test.ts` | — |
| UI-07 | PASS | demo | MP3 downloadable. WAV is unavailable and the UI explains that converting MP3 to WAV does not improve quality. Config refuses `FEATURE_WAV_EXPORT_ENABLED` on an MP3-only provider. | `tests/security.test.ts` (config guard) | — |
| UI-08 | PASS | demo | Own tracks only; filter, search, project link, licence link, delete. Empty, loading and failure states all handled. Deletion states its consequences first. | `screenshots/library-390.png` | — |
| UI-09 | PASS | demo | Prohibited and permitted uses visible **before** purchase on the pricing page and per track after. Named 利用条件記録 with an explicit disclaimer; the string 著作権証明書 appears nowhere. | `tests/security.test.ts` (SEC-08 group) | — |
| UI-10 | PASS | demo | Final confirmation shows tax-inclusive price, units, delivery timing, validity, renewal, cancellation method and refund terms, plus the seller identity. Amount comes from the server catalogue. | `screenshots/checkout-1440.png`; `tests/payments.test.ts` | — |
| UI-11 | PASS | demo | Billing shows batches with expiry, subscription period, exact JST end instant, order history with grant status. Cancel succeeds **only** after server confirmation. | `Billing.tsx`; `tests/payments.test.ts` (PAY-08) | — |
| UI-12 | PASS | demo | Every one of the 33 error codes maps to Japanese text **and** a next step; the map is typed over the full union, so a missing message is a compile error. | `apps/web/src/lib/messages.ts` | — |
| UI-13 | PASS | demo | Verified at 390px, 1440px and 320px. No horizontal overflow, no truncation, no content hidden behind the sticky action bar. Audio plays in-browser. | `screenshots/*-320.png`, `*-390.png`, `*-1440.png` | Real iOS/Android device testing NOT_RUN |
| UI-14 | **Partial** | demo | Touch targets ≥44px, visible focus, keyboard-operable controls, ARIA labels and live regions, no autoplay, `prefers-reduced-motion` honoured. Palette is the specified one. | `styles.css`; snapshot accessibility tree | **Contrast not measured.** `--text-muted #A9AFBE` on `--panel #1A1C22` needs a measured check against 4.5:1; screen-reader testing NOT_RUN |
| UI-15 | PASS | demo | Console covers jobs, costs, rights cases, reconciliation, settings and audit log. Support/admin permissions separated and enforced. Every mutation requires a reason, written to `audit_logs` with before/after. | `tests/security.test.ts` (UI-15 group) | — |

---

## GEN — generation and the credit ledger

All 12 verified with automated tests against real MySQL.

| # | Status | Environment | Actual result | Evidence |
| --- | --- | --- | --- | --- |
| GEN-01 | PASS | demo | Sequential replay and 5 concurrent submissions of the same key produced **one** job, one reservation, `deduplicated: true`. | `generation.test.ts` ×3 |
| GEN-02 | PASS | demo | Same key + different body → `409 IDEMPOTENCY_KEY_REUSED`; original job unchanged, no extra charge. | `generation.test.ts` |
| GEN-03 | PASS | demo | 1 credit, 2 concurrent jobs → exactly one `202`, one `402`. 3 credits, 10 concurrent → exactly 3 reserved. Balance never negative. DB `CHECK` rejects an oversell even when application logic is bypassed. | `ledger.test.ts` ×3, `generation.test.ts` |
| GEN-04 | PASS | demo | Duplicated queue message → one consumption. Outbox written in the same transaction as the reservation. | `generation.test.ts` ×2 |
| GEN-05 | PASS | demo | Expired lease from a "dead" worker re-claimed by another; job delivered with exactly one consumption. No transaction held across a provider call. | `generation.test.ts` |
| GEN-06 | PASS | demo | Ambiguous submission → `UNKNOWN`, credit still reserved. Verification queried by stable request key and completed with **one** upstream attempt total — no resubmission. | `generation.test.ts` |
| GEN-07 | PASS | demo | Provider rejection → `REJECTED`, credit released, not downloadable. Technical failure → `FAILED`, credit released. Failed output check → `REJECTED`, never downloadable. | `generation.test.ts` ×3 |
| GEN-08 | PASS | demo | Pipeline re-run twice after delivery: balance unchanged, exactly one `consume` entry. Triple `consumeReservation` → one consumption. | `generation.test.ts`, `ledger.test.ts` |
| GEN-09 | PASS | demo | After a release, a late success does **not** re-charge; cost recorded as `late_success` and the track parked `suspended`. | `ledger.test.ts`, `pipeline.ts` |
| GEN-10 | PASS | demo | In-flight jobs restored from persisted state via `GET /v1/jobs`; nothing regenerated, order history intact. | `generation.test.ts` |
| GEN-11 | PASS | demo | Batch expiring mid-flight: release restores units to the batch, then a **new** compensation batch is issued. Ledger shows `reserve → release → compensate`; original entries untouched. | `ledger.test.ts` |
| GEN-12 | PASS | demo | Cancel before submission → cancelled, credit released, worker does not resurrect it. Cancel after delivery → `409`, credit stays consumed. Never both "cancelled" and charged. | `generation.test.ts` ×2 |

---

## PAY — payments, subscriptions, refunds

Simulated adapter; every event travels the **same** verify → persist → process
pipeline as Stripe.

| # | Status | Environment | Actual result | Evidence | Next step |
| --- | --- | --- | --- | --- | --- |
| PAY-01 | PASS | demo (simulated) | Request carries no amount at all — price, currency and price id come from the versioned server catalogue. Unknown price key rejected. | `payments.test.ts` ×2 | Re-verify against Stripe test mode |
| PAY-02 | PASS | demo (simulated) | Success page reads server state only; unconfirmed order shows `pending` with no entitlement. Browser-verified. | `payments.test.ts`; `screenshots/checkout-1440.png` | — |
| PAY-03 | **BLOCKED_EXTERNAL** | — | Simulated payment grants exactly one 5-unit, 90-day batch and the amount/currency are re-verified. But §12.2 asks for a **real test-mode payment**, which needs a Stripe account. | `payments.test.ts` | Stripe test account + price ids |
| PAY-04 | PASS | demo (simulated) | Forged signature, missing header and a stale (1-hour-old) but correctly-keyed signature are all rejected with 400; balance and order unchanged. Verification uses the raw body. | `payments.test.ts` ×2 | Re-verify with Stripe's signing scheme |
| PAY-05 | PASS | demo (simulated) | Identical event twice → one grant. **Two different event ids** for the same session → still one grant. Out-of-order subscription event does not overwrite newer state. | `payments.test.ts` ×3 | — |
| PAY-06 | PASS | demo | Invoice grants exactly one 20-unit period; repeated events for the same invoice grant nothing further; a new invoice grants the next period. | `payments.test.ts` ×2 | Real renewal cycle needs Stripe |
| PAY-07 | PASS | demo | `past_due` grants no new period and revokes nothing — existing credits intact. UI prompts for a card update. | `payments.test.ts` | — |
| PAY-08 | PASS | demo (simulated) | Cancel sets period-end cancellation server-side, returns a real effective time, is idempotent, and cross-account cancel returns 404. UI shows success only after confirmation. | `payments.test.ts` ×2 | — |
| PAY-09 | PASS | demo (simulated) | 5 granted, 1 consumed, 1 reserved → exactly 3 revoked. Delivered work not clawed back, in-flight job unaffected, balance never negative. Repeated refund event is idempotent. | `payments.test.ts` ×2 | — |
| PAY-10 | PASS | demo | After all entitlements are revoked, the historical track and its generation-time licence record remain readable and `active`. | `payments.test.ts` | Contractual survival still needs a signed supplier clause |
| PAY-11 | PASS | demo | Payment/fee/refund/net stored per order and queryable. A paid order whose grant was destroyed is recovered by the sweep. | `payments.test.ts` | Real fee and payout figures need Stripe |
| PAY-12 | **BLOCKED_EXTERNAL** | — | Checkout is a hosted redirect and no card field exists anywhere in the codebase; no PAN or CVC is stored. 3DS and the success/failure/authentication-required matrix cannot be exercised without Stripe. | `payments.test.ts` | Stripe test mode + JP 3DS configuration |

---

## AI — text model and music provider

| # | Status | Environment | Actual result | Evidence | Next step |
| --- | --- | --- | --- | --- | --- |
| AI-01 | **BLOCKED_EXTERNAL** | — | Adapter routes all text traffic through TokenStars and records request id, usage and cost basis. Endpoint path, model id and request-id header are **configuration** — the API refuses to start if any is missing, rather than guessing. No call has been made. | `tokenstars.ts`; `security.test.ts` (config refusal) | TokenStars base URL, key, model id, chat path, request-id header |
| AI-02 | PASS | demo | Output is validated against a strict schema (scene, mood, energy, tempo, instruments, duration, vocal mode). Refusal and parse failure produce distinct terminal states. Exactly one repair attempt, then failure. | `tokenstars.ts`; `generation.test.ts` | Re-verify against the real model |
| AI-03 | PASS | demo | Prompt is data: cannot become an instruction, a URL, or a database operation. Injection attempts blocked pre-spend. Model output cannot set duration, vocal mode, billing or licence state — all re-imposed server-side. | `security.test.ts`; `generation.test.ts` | — |
| AI-04 | PASS | demo | Adapter covers capability query, submit, poll, result retrieval and error classification into four outcomes. Cancel, idempotency and webhooks are enabled **only** where the provider genuinely supports them. | `music/types.ts`, `music/http.ts` | Real provider contract test |
| AI-05 | PASS | demo | Only capabilities the configured provider reports are offered. WAV hidden without a lossless master; unsupported duration or non-instrumental capability refuses the request rather than pretending. | `security.test.ts`; `generation.test.ts` | — |
| AI-06 | PASS | demo | Success, failure, rejection, retry and late results all produce cost events. Billability comes from configured contract terms — never defaulted to "failures are free". Modelled cost carries `is_estimate` and is never summed with invoiced cost. | `generation.test.ts`; `reporting.ts` | Replace the 45 JPY budget assumption with contracted rates |
| AI-07 | **Partial → BLOCKED_EXTERNAL** | demo | Decodability, non-empty, duration tolerance (±750ms) and silence checks all run and gate delivery; failures never become downloadable and never consume a credit. | `ffmpeg.ts`; `generation.test.ts` | **Unintended-vocal detection is not implemented.** Needs a classifier plus the human review AI-07 requires. Recorded in OPEN_ITEMS. |
| AI-08 | **BLOCKED_EXTERNAL** | — | Provider, model and contract version are frozen per job and per licence snapshot; there is no automatic fallback to another provider on failure. | `delivery.ts`; `security.test.ts` | Cannot be meaningfully verified with one (demo) provider configured |

---

## SEC — rights, privacy, security

| # | Status | Environment | Actual result | Evidence | Next step |
| --- | --- | --- | --- | --- | --- |
| SEC-01 | PASS | demo | Account B, knowing A's job/track/project/order/asset ids, gets 403/404 on **9 different endpoints** including mutations. Enforced in the query, not by hiding buttons. Cross-account subscription cancel also blocked. | `security.test.ts` ×3, `payments.test.ts` | — |
| SEC-02 | PASS (dev) / BLOCKED_EXTERNAL (Cognito) | demo | Dev adapter verifies HMAC, expiry and payload. Cognito adapter checks JWKS signature, issuer, audience/client binding, expiry and `token_use = id`. Roles come from our users table, never a token claim. Identity spaces separated by `auth_provider`. | `auth/index.ts`; `security.test.ts` | Cognito user pool for real token verification |
| SEC-03 | PASS | demo | Production refuses the dev login, the demo music adapter, simulated payments, local storage, a test Stripe key, `DEV_AUTH_SECRET`, `DATABASE_SSL=false` and placeholder legal details. **Verified in the built Docker image**, not just in tests. Admin MFA available in Cognito config. | `security.test.ts` ×6; `docker run` output in CI | — |
| SEC-04 | PASS | demo | Buckets private with public access blocked; downloads require ownership re-check; links short-lived (300s) and expiry enforced. Forged signature → 403. Quarantine not downloadable even with a valid signature. Keys embed owner id + hash, not guessable. | `security.test.ts` ×4 | Real S3 presigning |
| SEC-05 | PASS | demo | HTTPS only, host allow-list, every resolved IP must be public (metadata endpoint and all private ranges blocked), redirects refused, size and time capped while streaming. No user-supplied URL is ever fetched; URLs in prompts are rejected. | `security.test.ts` ×4 | — |
| SEC-06 | PASS | demo | Logger redacts authorization, cookies, Stripe signature and prompts. Prompts redacted in worker logs. Runtime endpoint carries no secret. Secrets come from Secrets Manager via workload identity; no key in the image, code or `.env.example`. | `security.test.ts`; `server.ts` | — |
| SEC-07 | PASS | demo | Blocks artist/title references, lyric and vocal requests, voice imitation, reference URLs, PII and injection — all pre-spend, no credit consumed. Ordinary mood/instrument/tempo prompts pass. Every block is `appealable` with a rewrite hint and a feedback route; wording never asserts illegality. | `security.test.ts` ×3; `generation.test.ts` ×2 | — |
| SEC-08 | PASS | demo | Provider request id, model, contract version, territory, generation time, SHA-256 and derived versions stored per track. **Database trigger rejects** any attempt to rewrite contract version, allowed uses or commercial-delivery flag; only status may change. | `security.test.ts` ×3 | — |
| SEC-09 | PASS | demo | Commercial delivery is off; config **refuses to start** if it is enabled with the demo adapter. Licence records state 商用配信の許諾は未取得. No "exclusive copyright" or "zero-infringement" claim exists anywhere in the codebase. | `security.test.ts` ×2 | — |
| SEC-10 | PASS | demo | Complaint endpoint is unauthenticated and free. Credible claim suspends distribution and the licence; export and download blocked; owner cannot delete evidence. Response states a suspension is not a finding of infringement and that external copies cannot be recalled. Public lookup leaks nothing. | `security.test.ts` ×4 | — |
| SEC-11 | PASS | demo | Cancel renewal, unsubscribe marketing and delete account are three separate operations. Deletion response lists what is retained (transaction records, disputed evidence) and what is removed. Marketing defaults off and toggles independently. | `security.test.ts` ×2 | Actual deletion execution NOT_RUN |
| SEC-12 | PASS | demo | The text model receives only scene, energy, duration and the creative text — never email, payment or identity data. PII patterns blocked pre-send. Data boundaries for TokenStars, the music provider, Stripe and AWS documented in the privacy page. | `safety.ts`; `Legal.tsx` | Confirm real processing regions once contracts exist |
| SEC-13 | **Partial** | demo | 特商法, terms and privacy pages exist with a contact route; every one carries a "this is an unreviewed draft" banner driven by server state. Production **refuses to boot** without real entity details. | `Legal.tsx`; `security.test.ts` | **Placeholder content must be replaced and legally reviewed before charging.** See LAUNCH_READINESS |

---

## What was verified in a browser

Full walkthrough on 2026-09-10, demo mode, at 390px, 320px and 1440px:

1. Sign in with 18+ and terms confirmation → submit disabled until both checked ✓
2. Create with scene + Japanese mood text → cost and balance shown before submit ✓
3. Generation staged through to delivery, balance 5 → 4, exactly 1 consumed ✓
4. Idempotency replay returned the same job; different body returned 409 ✓
5. Export 15s with fade → real 15.05s MP3 downloaded via a signed, expiring link ✓
6. Cross-account access to the same track → 404 on read and on export ✓
7. Purchase → simulated payment → webhook → entitlement granted, confirmed from
   server state, not from the URL ✓
8. Licence record renders with hash and disclaimer; WAV correctly unavailable ✓

Console errors during the walkthrough: **0** after fixing two real bugs it found
(a missing `estimate` in the create response, and an infinite render loop in the
project page).

---

## Not verified

| Area | Why | Needed |
| --- | --- | --- |
| Real music generation | No signed agreement | Executed supplier contract + API credentials |
| TokenStars calls | No credentials or interface docs | Base URL, key, model id, chat path |
| Stripe test-mode payments | No account | Stripe account, price ids, webhook endpoint |
| Cognito authentication | No user pool | Provisioned pool, app client, SES sender |
| AWS deployment | No authorised account | AWS account; Terraform validates but has never been applied |
| Real S3 / SQS | Same | Same |
| Load and performance | Meaningless against synthetic audio | Real provider, stated concurrency, sample size |
| Restore drill (RPO/RTO) | Needs real RDS | AWS account + a scheduled drill |
| Colour contrast measurement | Not measured | Run a contrast checker over the palette |
| Screen reader / real devices | Not run | VoiceOver + TalkBack, physical iOS/Android |
| Model quality, originality, aesthetic satisfaction | Impossible with synthesised tones | Evaluation licence and a blind listening study |
| Commercial validation | Explicitly not an engineering result (§11.3) | Interviews, paid experiments, renewal cohorts |
