import type { MusicIntent } from '@loopscene/contracts';

export interface TextUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** Modelled cost in JPY minor units; flagged as an estimate unless the vendor returns one. */
  costMinor: number;
  costIsEstimate: boolean;
}

export type IntentResult =
  | { status: 'ok'; intent: MusicIntent; requestId: string | null; usage: TextUsage; repaired: boolean }
  /** The model itself declined (safety filter). Not a technical failure. */
  | { status: 'refused'; requestId: string | null; usage: TextUsage; reason: string }
  | { status: 'failed'; requestId: string | null; usage: TextUsage; code: string; message: string };

export interface IntentRequest {
  scene: string;
  /** Untrusted user text. Adapters must treat it as data, never as instructions (AI-03). */
  prompt: string;
  energy: number;
  durationSeconds: number;
}

export interface TextProvider {
  readonly providerId: string;
  readonly model: string;
  extractIntent(req: IntentRequest): Promise<IntentResult>;
}
