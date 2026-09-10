import { z } from 'zod';

/**
 * Per-track usage record. UI-09 / SEC-08: this is a platform contract and
 * provenance record — deliberately NOT called a copyright certificate, and it
 * asserts nothing about exclusivity or non-infringement.
 */
export const licenseSnapshotView = z.object({
  trackId: z.string().uuid(),
  /** Human-facing licence document version, e.g. "jp-launch-2026-09". */
  licenseVersion: z.string(),
  /** Provider identity is shown; commercial contract terms are not exposed. */
  providerId: z.string(),
  providerModel: z.string(),
  generatedAt: z.string(),
  territory: z.string(),
  allowedUses: z.array(z.string()),
  prohibitedUses: z.array(z.string()),
  sourceSha256: z.string(),
  derivedVersions: z.array(
    z.object({
      kind: z.string(),
      format: z.string(),
      sha256: z.string(),
      createdAt: z.string(),
    }),
  ),
  status: z.enum(['active', 'suspended', 'revoked']),
  /** Set when commercial delivery is gated on an unsigned upstream agreement. */
  commercialDeliveryEnabled: z.boolean(),
  disclaimer: z.string(),
});
export type LicenseSnapshotView = z.infer<typeof licenseSnapshotView>;

export const createRightsCaseRequest = z.object({
  trackId: z.string().uuid().optional(),
  audioSha256: z.string().length(64).optional(),
  reporterName: z.string().min(1).max(120),
  reporterEmail: z.string().email(),
  claimType: z.enum(['copyright', 'neighboring_rights', 'name_or_voice', 'other']),
  description: z.string().min(10).max(4000),
  evidenceUrls: z.array(z.string().url()).max(5).default([]),
});
export type CreateRightsCaseRequest = z.infer<typeof createRightsCaseRequest>;

export const createRightsCaseResponse = z.object({
  caseNumber: z.string(),
  status: z.string(),
  receivedAt: z.string(),
});
