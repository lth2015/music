import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type {
  MusicCapabilities,
  MusicPollResult,
  MusicProvider,
  MusicSubmitRequest,
  MusicSubmitResult,
} from './types.js';

export interface DemoProviderOptions {
  /** Directory of our own synthesised fixture audio (scripts/make-audio-fixtures.mjs). */
  fixturesDir: string;
  /** Simulated upstream latency before a submitted request completes. */
  latencyMs?: number;
  /**
   * Deterministic fault injection for the GEN-* tests. Keyed by a marker the
   * test puts in the brief, so production-shaped code paths get exercised
   * without a special test-only branch in the worker.
   */
  faults?: {
    failOnBriefContaining?: string;
    rejectOnBriefContaining?: string;
    unknownOnBriefContaining?: string;
    hangOnBriefContaining?: string;
  };
}

interface PendingRequest {
  requestKey: string;
  providerRequestId: string;
  readyAt: number;
  fixture: string;
  hang: boolean;
}

/**
 * Demo music provider.
 *
 * Serves audio we synthesised ourselves, so nothing here depends on an
 * unsigned upstream agreement. §3.1 requires the demo path to be impossible to
 * confuse with a real one, so `commercialDeliveryPermitted` is false and the
 * provider id is literally "demo-local" — it appears in every licence record.
 *
 * Passing tests against this adapter says the engineering flow works. It says
 * nothing about model quality, originality or commercial viability (§8).
 */
export class DemoMusicProvider implements MusicProvider {
  static readonly PROVIDER_ID = 'demo-local';

  private readonly opts: DemoProviderOptions;
  private readonly inflight = new Map<string, PendingRequest>();
  private fixtures: string[] = [];

  constructor(opts: DemoProviderOptions) {
    this.opts = opts;
  }

  capabilities(): MusicCapabilities {
    return {
      providerId: DemoMusicProvider.PROVIDER_ID,
      model: 'demo-synth-v1',
      contractVersion: 'demo-no-contract',
      supportedDurationsSeconds: [30],
      supportedFormats: ['mp3'],
      supportsInstrumentalOnly: true,
      supportsIdempotencyKey: true,
      supportsCancel: true,
      supportsWebhook: false,
      supportsStatusQuery: true,
      // No signed agreement exists, so demo output is never presented as
      // commercially licensed (SEC-09).
      commercialDeliveryPermitted: false,
      maxConcurrency: 8,
      dataRegion: 'local',
      licenseVersion: 'demo-preview-only',
      territory: 'JP',
      allowedUses: ['動作確認・社内デモのみ'],
      prohibitedUses: [
        '一般公開・SNS投稿',
        '収益化',
        '商用利用',
        '第三者への再配布',
      ],
      // Budget assumption from the unit-economics workbook (45 JPY / request),
      // explicitly flagged as an estimate — not a supplier quote.
      costPerRequestMinor: 45,
      billFailedRequests: true,
      costIsEstimate: true,
    };
  }

  private async listFixtures(): Promise<string[]> {
    if (this.fixtures.length) return this.fixtures;
    const entries = await readdir(this.opts.fixturesDir);
    this.fixtures = entries.filter((f) => f.endsWith('.mp3')).sort();
    if (!this.fixtures.length) {
      throw new Error(
        `no demo audio fixtures in ${this.opts.fixturesDir}. Run "pnpm fixtures:audio" first.`,
      );
    }
    return this.fixtures;
  }

  /** Same intent always maps to the same fixture, so re-runs are reproducible. */
  private pickFixture(req: MusicSubmitRequest, fixtures: string[]): string {
    const seed = createHash('sha256')
      .update(`${req.intent.scene}:${req.intent.mood}:${req.requestKey}`)
      .digest();
    const idx = seed.readUInt32BE(0) % fixtures.length;
    return fixtures[idx]!;
  }

  async submit(req: MusicSubmitRequest): Promise<MusicSubmitResult> {
    const faults = this.opts.faults ?? {};
    const brief = req.intent.brief;
    const providerRequestId = `demo_${createHash('sha1').update(req.requestKey).digest('hex').slice(0, 16)}`;

    if (faults.failOnBriefContaining && brief.includes(faults.failOnBriefContaining)) {
      return { status: 'failed', providerRequestId, code: 'demo_injected_failure', message: 'injected failure' };
    }
    if (faults.rejectOnBriefContaining && brief.includes(faults.rejectOnBriefContaining)) {
      return { status: 'rejected', providerRequestId, code: 'demo_injected_rejection', message: 'injected rejection' };
    }
    if (faults.unknownOnBriefContaining && brief.includes(faults.unknownOnBriefContaining)) {
      // Record the request anyway: the point of UNKNOWN is that the upstream
      // may well have accepted it, which is exactly what poll() must discover.
      const fixtures = await this.listFixtures();
      this.inflight.set(req.requestKey, {
        requestKey: req.requestKey,
        providerRequestId,
        readyAt: Date.now() + (this.opts.latencyMs ?? 800),
        fixture: this.pickFixture(req, fixtures),
        hang: false,
      });
      return { status: 'unknown', providerRequestId: null, code: 'demo_injected_unknown', message: 'timeout' };
    }

    const fixtures = await this.listFixtures();
    const hang = !!faults.hangOnBriefContaining && brief.includes(faults.hangOnBriefContaining);
    // Idempotent by request key: a duplicate submit returns the same id and
    // does not start a second upstream job (GEN-01/GEN-04).
    const existing = this.inflight.get(req.requestKey);
    if (existing) return { status: 'submitted', providerRequestId: existing.providerRequestId };

    this.inflight.set(req.requestKey, {
      requestKey: req.requestKey,
      providerRequestId,
      readyAt: Date.now() + (this.opts.latencyMs ?? 800),
      fixture: this.pickFixture(req, fixtures),
      hang,
    });
    return { status: 'submitted', providerRequestId };
  }

  async poll(params: { requestKey: string }): Promise<MusicPollResult> {
    const pending = this.inflight.get(params.requestKey);
    if (!pending) return { status: 'not_found' };
    if (pending.hang || Date.now() < pending.readyAt) return { status: 'pending' };

    const buffer = await readFile(join(this.opts.fixturesDir, pending.fixture));
    return {
      status: 'completed',
      audio: {
        kind: 'buffer',
        buffer,
        format: 'mp3',
        declaredDurationSeconds: 30,
        providerRequestId: pending.providerRequestId,
      },
    };
  }

  async cancel(params: { requestKey: string }): Promise<boolean> {
    return this.inflight.delete(params.requestKey);
  }
}
