import { z } from 'zod';
import { AudioFormat, JobPhase, JobState, Mood, Scene, TempoHint, TrackState, VocalMode } from './enums.js';

/** UI-03: 300 Unicode code points, counted by code point rather than UTF-16 unit. */
export const PROMPT_MAX_CODEPOINTS = 300;

export const promptSchema = z
  .string()
  .trim()
  .refine((v) => [...v].length <= PROMPT_MAX_CODEPOINTS, {
    message: `prompt must be at most ${PROMPT_MAX_CODEPOINTS} Unicode code points`,
  });

/** Launch scope is a fixed 30s instrumental (§1.1). */
export const FIXED_DURATION_SECONDS = 30;

export const createGenerationRequest = z.object({
  projectId: z.string().uuid().optional(),
  scene: Scene,
  prompt: promptSchema.default(''),
  /** 0..1, coarse energy slider. */
  energy: z.number().min(0).max(1).default(0.5),
  durationSeconds: z.literal(FIXED_DURATION_SECONDS).default(FIXED_DURATION_SECONDS),
  vocalMode: VocalMode.default('instrumental'),
});
export type CreateGenerationRequest = z.infer<typeof createGenerationRequest>;

/**
 * The 202 body is the full job view plus `deduplicated`, so the client can
 * render the progress screen immediately without a second round trip.
 */
export const createGenerationResponse = z.object({
  jobId: z.string().uuid(),
  projectId: z.string().uuid(),
  state: JobState,
  phase: JobPhase,
  /** true when an existing job was returned for a replayed idempotency key. */
  deduplicated: z.boolean(),
});
export type CreateGenerationResponse = z.infer<typeof createGenerationResponse>;

/**
 * Structured intent produced by the text model and then re-validated server
 * side. AI-03: the model never decides billing, entitlement or licence state,
 * so nothing money-related appears in this schema.
 */
export const musicIntent = z.object({
  scene: Scene,
  mood: Mood,
  energy: z.number().min(0).max(1),
  tempoHint: TempoHint,
  instruments: z.array(z.string().min(1).max(32)).min(1).max(6),
  durationSeconds: z.literal(FIXED_DURATION_SECONDS),
  vocalMode: VocalMode,
  /** Short English brief handed to the music provider. Never the raw user text. */
  brief: z.string().min(1).max(400),
});
export type MusicIntent = z.infer<typeof musicIntent>;

export const jobEstimate = z.object({
  /** Inclusive range in seconds. UI-04 forbids a fabricated precise percentage. */
  minSeconds: z.number().int().nonnegative(),
  maxSeconds: z.number().int().nonnegative(),
  delayed: z.boolean(),
});

export const jobView = z.object({
  jobId: z.string().uuid(),
  projectId: z.string().uuid(),
  state: JobState,
  phase: JobPhase,
  scene: Scene,
  prompt: z.string(),
  energy: z.number(),
  trackId: z.string().uuid().nullable(),
  errorCode: z.string().nullable(),
  estimate: jobEstimate,
  createdAt: z.string(),
  updatedAt: z.string(),
  /** true while the run mode is demo, so the UI can keep the banner visible. */
  demo: z.boolean(),
});
export type JobView = z.infer<typeof jobView>;

export const trackView = z.object({
  trackId: z.string().uuid(),
  projectId: z.string().uuid(),
  jobId: z.string().uuid(),
  title: z.string(),
  state: TrackState,
  scene: Scene,
  mood: Mood.nullable(),
  durationSeconds: z.number(),
  createdAt: z.string(),
  /** Short-lived preview URL; re-issued on each read (SEC-04). */
  previewUrl: z.string().nullable(),
  demo: z.boolean(),
});
export type TrackView = z.infer<typeof trackView>;

export const listTracksQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  state: TrackState.optional(),
  q: z.string().max(100).optional(),
  projectId: z.string().uuid().optional(),
});

export const listTracksResponse = z.object({
  items: z.array(trackView),
  nextCursor: z.string().nullable(),
});

/** UI-06: 15s or the full 30s, optional 1s fade-out. Trimming never costs a credit. */
export const EXPORT_CLIP_DURATIONS = [15, 30] as const;

export const createExportRequest = z.object({
  clipStartSeconds: z.number().min(0).max(FIXED_DURATION_SECONDS),
  clipDurationSeconds: z.union([z.literal(15), z.literal(30)]),
  fadeOut: z.boolean().default(false),
  format: AudioFormat.default('mp3'),
});
export type CreateExportRequest = z.infer<typeof createExportRequest>;

export const exportView = z.object({
  exportId: z.string().uuid(),
  trackId: z.string().uuid(),
  format: AudioFormat,
  clipStartSeconds: z.number(),
  clipDurationSeconds: z.number(),
  fadeOut: z.boolean(),
  byteSize: z.number().int(),
  sha256: z.string(),
  downloadUrl: z.string(),
  downloadUrlExpiresAt: z.string(),
  /** true when an identical export already existed and was reused. */
  reused: z.boolean(),
});
export type ExportView = z.infer<typeof exportView>;

export const cancelJobResponse = z.object({
  jobId: z.string().uuid(),
  state: JobState,
  cancelled: z.boolean(),
  /** Explains the outcome when cancellation lost the race to the worker. */
  reason: z.string().nullable(),
});
