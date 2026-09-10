import type { PoolConnection } from 'mysql2/promise';
import type { AssetKind, AudioFormat, TrackState } from '@loopscene/contracts';
import { execute, newId, query, queryOne } from './pool.js';

export interface TrackRow {
  id: string;
  owner_id: string;
  project_id: string;
  job_id: string;
  title: string;
  scene: string;
  mood: string | null;
  duration_ms: number;
  state: TrackState;
  suspended_reason: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

const TRACK_COLUMNS = `
  id, owner_id, project_id, job_id, title, scene, mood, duration_ms,
  state, suspended_reason, created_at, updated_at, deleted_at
`;

export async function insertTrack(
  params: {
    /** Supplied by the caller so the storage key can be derived before insert. */
    id?: string;
    ownerId: string;
    projectId: string;
    jobId: string;
    title: string;
    scene: string;
    mood?: string | null;
    durationMs: number;
    state?: TrackState;
  },
  tx: PoolConnection,
): Promise<TrackRow> {
  const id = params.id ?? newId();
  // A retried delivery must not create a second track for the same job.
  await execute(
    `INSERT INTO tracks (id, owner_id, project_id, job_id, title, scene, mood, duration_ms, state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE updated_at = UTC_TIMESTAMP(3)`,
    [
      id,
      params.ownerId,
      params.projectId,
      params.jobId,
      params.title,
      params.scene,
      params.mood ?? null,
      params.durationMs,
      params.state ?? 'processing',
    ],
    tx,
  );
  return (await queryOne<TrackRow>(
    `SELECT ${TRACK_COLUMNS} FROM tracks WHERE job_id = ?`,
    [params.jobId],
    tx,
  ))!;
}

export async function getTrackForUser(
  id: string,
  userId: string,
  tx?: PoolConnection,
): Promise<TrackRow | undefined> {
  return queryOne<TrackRow>(
    `SELECT ${TRACK_COLUMNS} FROM tracks
      WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
    [id, userId],
    tx,
  );
}

export async function getTrack(id: string, tx?: PoolConnection): Promise<TrackRow | undefined> {
  return queryOne<TrackRow>(`SELECT ${TRACK_COLUMNS} FROM tracks WHERE id = ?`, [id], tx);
}

export async function setTrackState(
  params: { trackId: string; state: TrackState; reason?: string | null },
  tx?: PoolConnection,
): Promise<void> {
  await execute(
    `UPDATE tracks SET state = ?, suspended_reason = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
    [params.state, params.reason ?? null, params.trackId],
    tx,
  );
}

export interface ListTracksParams {
  userId: string;
  limit: number;
  cursor?: string | undefined;
  state?: TrackState | undefined;
  q?: string | undefined;
  projectId?: string | undefined;
}

export async function listTracks(params: ListTracksParams): Promise<TrackRow[]> {
  const clauses = ['owner_id = ?', 'deleted_at IS NULL'];
  const values: unknown[] = [params.userId];
  if (params.cursor) {
    values.push(new Date(params.cursor));
    clauses.push('created_at < ?');
  }
  if (params.state) {
    values.push(params.state);
    clauses.push('state = ?');
  }
  if (params.projectId) {
    values.push(params.projectId);
    clauses.push('project_id = ?');
  }
  if (params.q) {
    values.push(`%${params.q}%`);
    clauses.push('title LIKE ?');
  }
  values.push(params.limit);
  return query<TrackRow>(
    `SELECT ${TRACK_COLUMNS} FROM tracks
      WHERE ${clauses.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ?`,
    values,
  );
}

/**
 * Soft delete. The audio object is removed by a separate retention job, and a
 * track under an open rights case is never deleted from here — evidence
 * preservation beats a user-initiated wipe (design doc §18).
 */
export async function softDeleteTrack(
  params: { trackId: string; userId: string },
  tx?: PoolConnection,
): Promise<boolean> {
  const res = await execute(
    `UPDATE tracks t
        LEFT JOIN rights_cases rc
          ON rc.track_id = t.id
         AND rc.status IN ('received','under_review','suspended')
        SET t.deleted_at = UTC_TIMESTAMP(3),
            t.state = 'deleted',
            t.updated_at = UTC_TIMESTAMP(3)
      WHERE t.id = ? AND t.owner_id = ? AND t.deleted_at IS NULL
        AND rc.id IS NULL`,
    [params.trackId, params.userId],
    tx,
  );
  return res.affectedRows > 0;
}

export interface AssetRow {
  id: string;
  track_id: string;
  owner_id: string;
  kind: AssetKind;
  format: AudioFormat;
  storage_key: string;
  byte_size: number;
  duration_ms: number;
  sha256: string;
  clip_start_ms: number | null;
  clip_duration_ms: number | null;
  fade_out_ms: number;
  params_hash: string;
  created_at: Date;
}

const ASSET_COLUMNS = `
  id, track_id, owner_id, kind, format, storage_key, byte_size, duration_ms,
  sha256, clip_start_ms, clip_duration_ms, fade_out_ms, params_hash, created_at
`;

export async function insertAsset(
  params: {
    trackId: string;
    ownerId: string;
    kind: AssetKind;
    format: AudioFormat;
    storageKey: string;
    byteSize: number;
    durationMs: number;
    sha256: string;
    clipStartMs?: number | null;
    clipDurationMs?: number | null;
    fadeOutMs?: number;
    paramsHash: string;
  },
  tx?: PoolConnection,
): Promise<AssetRow> {
  // An identical export is reused rather than re-rendered (UI-06).
  await execute(
    `INSERT INTO asset_versions
       (id, track_id, owner_id, kind, format, storage_key, byte_size, duration_ms, sha256,
        clip_start_ms, clip_duration_ms, fade_out_ms, params_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [
      newId(),
      params.trackId,
      params.ownerId,
      params.kind,
      params.format,
      params.storageKey,
      params.byteSize,
      params.durationMs,
      params.sha256,
      params.clipStartMs ?? null,
      params.clipDurationMs ?? null,
      params.fadeOutMs ?? 0,
      params.paramsHash,
    ],
    tx,
  );
  return (await queryOne<AssetRow>(
    `SELECT ${ASSET_COLUMNS} FROM asset_versions
      WHERE track_id = ? AND kind = ? AND params_hash = ?`,
    [params.trackId, params.kind, params.paramsHash],
    tx,
  ))!;
}

export async function findAsset(
  params: { trackId: string; kind: AssetKind; paramsHash: string },
  tx?: PoolConnection,
): Promise<AssetRow | undefined> {
  return queryOne<AssetRow>(
    `SELECT ${ASSET_COLUMNS} FROM asset_versions
      WHERE track_id = ? AND kind = ? AND params_hash = ?`,
    [params.trackId, params.kind, params.paramsHash],
    tx,
  );
}

export async function getMasterAsset(trackId: string, tx?: PoolConnection): Promise<AssetRow | undefined> {
  return queryOne<AssetRow>(
    `SELECT ${ASSET_COLUMNS} FROM asset_versions
      WHERE track_id = ? AND kind = 'master' ORDER BY created_at LIMIT 1`,
    [trackId],
    tx,
  );
}

/** Ownership is enforced in the query — download authorisation, not a UI check (SEC-04). */
export async function getAssetForUser(
  assetId: string,
  userId: string,
  tx?: PoolConnection,
): Promise<AssetRow | undefined> {
  return queryOne<AssetRow>(
    `SELECT a.id, a.track_id, a.owner_id, a.kind, a.format, a.storage_key, a.byte_size,
            a.duration_ms, a.sha256, a.clip_start_ms, a.clip_duration_ms, a.fade_out_ms,
            a.params_hash, a.created_at
       FROM asset_versions a
       JOIN tracks t ON t.id = a.track_id
      WHERE a.id = ? AND a.owner_id = ? AND t.deleted_at IS NULL AND t.state <> 'suspended'`,
    [assetId, userId],
    tx,
  );
}

export async function listAssets(trackId: string, tx?: PoolConnection): Promise<AssetRow[]> {
  return query<AssetRow>(
    `SELECT ${ASSET_COLUMNS} FROM asset_versions WHERE track_id = ? ORDER BY created_at`,
    [trackId],
    tx,
  );
}
