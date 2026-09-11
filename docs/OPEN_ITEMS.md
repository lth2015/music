# Open items

What is unfinished, what is blocked, and on whom. `PROJECT_TASK.md` §13.

Two kinds of entry:

- **Blocked** — the code exists and the boundary is defined; an external
  prerequisite is missing.
- **Incomplete** — engineering work still to do inside this repository.

---

## 1. Blocked on a signed music-provider agreement

The single largest dependency. Nothing about real music generation has been
verified, and the platform is built so that this cannot be accidentally
forgotten: `MUSIC_COMMERCIAL_DELIVERY=true` is **rejected at start-up** while
the demo adapter is in use.

| Item | State | Owner | Unblocks |
| --- | --- | --- | --- |
| Enterprise API agreement | Not obtained | Business + legal | AI-01, AI-04, AI-08, PAY-03 |
| Whether we may operate a paid consumer service on the API | Unknown | Legal | Everything commercial |
| Delivering MP3/WAV to end users; storing and re-downloading | Unknown | Legal | UI-06, UI-07, SEC-09 |
| Per-download fees or revenue share | Unknown | Business | Unit economics |
| Downstream user rights: personal SNS video, monetisation, global visibility | Unknown | Legal | UI-09, the licence record contents |
| Whether rights **survive** cancellation | Unknown | Legal | PAY-10, our terms §7 |
| Real pricing: per call, per download, minimum commitment, failure billing | Unknown | Business | AI-06, all cost reporting |
| Model version pinning, concurrency, idempotency, cancel, webhook support | Unknown | Engineering + supplier | AI-04, AI-05, the http adapter config |
| Data processing region and sub-processors | Unknown | Legal | SEC-12, the privacy page |
| Benchmarking / evaluation permission | Not obtained | Business | Any quality claim at all |

Two contract findings already on record and unresolved:

- **SOUNDRAW** — the public API Pro agreement (`spec/API Pro Plan …md`) §3.8 sets
  an Extended Licence with **70% / 50% revenue share** on downloads, and §3.12
  restricts resale. §3.17 deletes generated songs after **72 hours**, so we must
  copy to our own storage inside that window (the current pipeline does store
  the master immediately, which is compatible). How §3.8 interacts with the
  US$300 / 1,000-song base fee needs written clarification — a per-call price
  cannot be assumed to cover it.
- **ElevenLabs** — self-serve API access is explicitly **not** a resale right;
  enterprise authorisation plus possible co-branding would be required.

Until one of these (or another provider) is signed, the correct engineering
state is exactly what ships today: demo audio, commercial delivery off, and
licence records that say so.

---

## 2. Blocked on credentials or accounts

| Item | Missing | Consequence |
| --- | --- | --- |
| TokenStars | Base URL, API key, **exact model id**, chat path, request-id header; whether structured outputs, refusal states, usage and request ids pass through | AI-01 unverified. The adapter refuses to start rather than guessing any of these. |
| Stripe | Account, test-mode keys, webhook secret, versioned price ids | PAY-03 and PAY-12 blocked. 3DS and the failure/authentication matrix unexercised. |
| Cognito | User pool, app client, SES sender + verified domain | Real token verification and the email-OTP UI unverified. |
| AWS | An authorised account | Terraform `validate`s and Helm renders, but **nothing has been applied**. No deployment, S3, SQS, monitoring, rollback or recovery has been exercised. |

---

## 3. Incomplete engineering work

| Item | Why it matters | Effort |
| --- | --- | --- |
| **Unintended-vocal detection** (AI-07) | The launch promise is instrumental-only. Current checks cover decodability, duration, silence and integrity — none of which detects a voice. Needs a classifier plus the human review AI-07 requires. Until then "instrumental" rests on the provider's parameter, not on our verification. | Medium |
| **CloudWatch metric publication** | `monitoring.tf` alarms on `UpstreamFailureRate`, `DailyBudgetConsumedRatio`, `WebhookBacklog`, `LedgerDiscrepancies`, `UngrantedPaidOrders`, `StaleUnknownJobs`. The worker computes all of these but does **not yet publish** them. They are set `treat_missing_data = "breaching"` so they fail loudly rather than looking healthy. | Small |
| **Daily budget enforcement** | `DAILY_BUDGET_MINOR` is configured and recorded in cost events, but no code refuses a generation when the cap is reached. §12.3 wants generation paused while order lookup and downloads continue. | Small |
| **Colour contrast measurement** (UI-14) | The palette is the specified one, but 4.5:1 has not been **measured**. `--text-muted #A9AFBE` on `--panel #1A1C22` is the case to check first. **Blocking for the `docs/UI_DESIGN.md` redesign**, which adds an ambient gradient — any text sitting on the mesh rather than on a panel must be measured against the gradient's lightest point, not the base colour. | Small |
| **Screen reader and real-device testing** (UI-13, UI-14) | Verified at three widths in a desktop browser only. VoiceOver, TalkBack and physical mobile playback are untested. | Small |
| **OpenAI-style OpenAPI document** | `docs/API.md` is complete and accurate but hand-written. §10 accepts "OpenAPI or equivalent"; a generated document from the zod schemas would stay in sync automatically. | Medium |
| **Account deletion execution** (SEC-11) | The request is recorded with a correct retention statement, but no job actually deletes the account and its audio after identity confirmation. | Medium |
| **Track retention sweep** | Soft-deleted tracks keep their S3 objects; nothing removes them on a schedule. | Small |
| **Analytics `preview_10s` event** | The player detects 10 seconds of real listening and the activation metric queries it, but the client does not yet POST it. Day-1 activation will therefore report as not computable. | Small |
| **Subscription checkout end-to-end** | Subscription grants, renewals, failures and cancellation are all tested at the service layer. The full Stripe subscription checkout has not been walked because subscriptions are off by default (§7). | Small, once Stripe exists |
| **Load testing** | §12.3 targets (P95 <1s create, <120s generation, ≥95% success) cannot be meaningfully measured against a synthesised fixture that returns instantly. | Blocked on a real provider |

---

## 4. Decisions that need a human

| Question | Why it is not an engineering call |
| --- | --- |
| Refund policy | The proposed "unused, within 7 days" rule is a **draft**. It must be reconciled with 資金決済法, 特商法 and consumer law before it is presented as binding. The code applies whatever is configured; it does not decide. |
| Whether prepaid credits are 前払式支払手段 | Depends on the actual function of the credits, not on what they are called or on a 90-day expiry. Needs a lawyer's determination; the answer may change the product. |
| Expired-credit compensation policy | `EXPIRED_BATCH_COMPENSATION_DAYS` defaults to 30. §6.2 requires this to be decided **before** charging. |
| Duration tolerance and loudness target | Currently ±750ms and −14 LUFS. Reasonable defaults, but they should be confirmed against the real provider's output characteristics. |
| Which failures the supplier bills for | Configured conservatively as "failures are billable" (`MUSIC_BILL_FAILED_REQUESTS=true`) because assuming the opposite would understate cost. The contract decides. |
| Legal entity, terms, privacy policy | All placeholder. Production refuses to start without real values, but refusing to start is not the same as having them. |

---

## 5. Explicitly out of scope

Not oversights — §1.2 excludes them, and none is reachable through a hidden
entry point or a provider default:

lyrics · vocals · voice imitation · cover versions · reference-audio or humming
upload · music distribution (Spotify etc.) · royalty splitting · Content ID
registration · a marketplace · public community, follows, rankings or remixing ·
annual and unlimited plans · auto top-up · transferable or withdrawable credit
balances · native iOS/Android apps · video upload or cloud video composition ·
self-trained models and GPU clusters.

`vocalMode` is re-imposed server-side on every request regardless of what the
client or the text model returns, and the input screen rejects lyric, vocal and
voice-imitation prompts before any spend occurs.

---

## 6. Assumptions that are not facts

Carried through from the unit-economics workbook and clearly marked as estimates
in code (`is_estimate = true` on every modelled cost event):

| Assumption | Value | Reality |
| --- | --- | --- |
| Music cost per request | 45 JPY | Derived from US$0.3/track at a **budget** rate of 150 JPY/USD. Not a quote, not a current exchange rate. |
| Technical success rate | 90% | A planning figure. The real rate is unmeasured. |
| Failure billing | 100% billable | Conservative default, not a contract term. |
| GPT cost per request | 0.5 JPY | TokenStars internal assumption, not OpenAI pricing. |
| Revenue share | 0% | The **target** contract condition. SOUNDRAW's public agreement says 70%/50% for downloads. |
| Monthly minimum commitment | 45,000 JPY | A budget placeholder. |
| Stripe fees | 3.6% + 0.7% | Public JP rates; the actual merchant agreement governs. |

The reporting layer keeps modelled and invoiced cost in **separate fields** and
never sums them, so a simulation cannot be read as a supplier bill.
