import type { PoolConnection } from 'mysql2/promise';
import { execute, newId, query, queryOne, toJson } from './pool.js';

export interface OutboxRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'dispatched' | 'failed';
  attempts: number;
  available_at: Date;
  created_at: Date;
}

const OUTBOX_COLUMNS = `
  id, aggregate_type, aggregate_id, event_type, payload, status, attempts, available_at, created_at
`;

/**
 * Enqueues a domain event in the SAME transaction as the state change that
 * produced it (§4.2). This is what makes "credits reserved but nothing queued"
 * impossible: either both commit or neither does.
 */
export async function enqueueOutbox(
  params: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
    availableAt?: Date;
  },
  tx: PoolConnection,
): Promise<string> {
  const id = newId();
  await execute(
    `INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload, available_at)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, UTC_TIMESTAMP(3)))`,
    [
      id,
      params.aggregateType,
      params.aggregateId,
      params.eventType,
      toJson(params.payload),
      params.availableAt ?? null,
    ],
    tx,
  );
  return id;
}

/** Picks up pending rows for dispatch. SKIP LOCKED keeps multiple dispatchers safe. */
export async function claimOutboxBatch(limit: number, tx: PoolConnection): Promise<OutboxRow[]> {
  const candidates = await query<{ id: string }>(
    `SELECT id FROM outbox
      WHERE status <> 'dispatched' AND available_at <= UTC_TIMESTAMP(3)
      ORDER BY created_at
      LIMIT ?
      FOR UPDATE SKIP LOCKED`,
    [limit],
    tx,
  );
  if (!candidates.length) return [];

  const ids = candidates.map((c) => c.id);
  const placeholders = ids.map(() => '?').join(', ');
  await execute(`UPDATE outbox SET attempts = attempts + 1 WHERE id IN (${placeholders})`, ids, tx);
  return query<OutboxRow>(
    `SELECT ${OUTBOX_COLUMNS} FROM outbox WHERE id IN (${placeholders}) ORDER BY created_at`,
    ids,
    tx,
  );
}

export async function markDispatched(id: string, tx?: PoolConnection): Promise<void> {
  await execute(
    `UPDATE outbox SET status = 'dispatched', dispatched_at = UTC_TIMESTAMP(3), last_error = NULL
      WHERE id = ?`,
    [id],
    tx,
  );
}

export async function markDispatchFailed(
  params: { id: string; error: string; retryInSeconds: number; maxAttempts: number },
  tx?: PoolConnection,
): Promise<void> {
  await execute(
    `UPDATE outbox SET
        status = CASE WHEN attempts >= ? THEN 'failed' ELSE 'pending' END,
        last_error = ?,
        available_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND)
      WHERE id = ?`,
    [params.maxAttempts, params.error.slice(0, 500), params.retryInSeconds, params.id],
    tx,
  );
}

export async function countPendingOutbox(): Promise<number> {
  const row = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM outbox WHERE status = 'pending'`,
  );
  return Number(row?.n ?? 0);
}

// ------------------------------------------------------------ webhook events

export interface WebhookEventRow {
  id: string;
  provider: 'stripe' | 'music';
  event_id: string;
  event_type: string;
  signature_verified: boolean;
  payload: Record<string, unknown>;
  status: 'received' | 'processing' | 'processed' | 'failed' | 'ignored';
  attempts: number;
  last_error: string | null;
  received_at: Date;
}

const WEBHOOK_COLUMNS = `
  id, provider, event_id, event_type, signature_verified, payload, status, attempts, last_error, received_at
`;

/**
 * Stores a verified webhook before doing any work (PAY-04/§4.2): persist,
 * return 2xx fast, process asynchronously. A duplicate event id is a no-op
 * insert, the first of the two idempotency layers PAY-05 asks for.
 */
export async function recordWebhookEvent(
  params: {
    provider: 'stripe' | 'music';
    eventId: string;
    eventType: string;
    signatureVerified: boolean;
    payload: Record<string, unknown>;
  },
  tx?: PoolConnection,
): Promise<{ row: WebhookEventRow; duplicate: boolean }> {
  const res = await execute(
    `INSERT IGNORE INTO webhook_events
       (id, provider, event_id, event_type, signature_verified, payload)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      params.provider,
      params.eventId,
      params.eventType,
      params.signatureVerified ? 1 : 0,
      toJson(params.payload),
    ],
    tx,
  );
  const row = (await queryOne<WebhookEventRow>(
    `SELECT ${WEBHOOK_COLUMNS} FROM webhook_events WHERE provider = ? AND event_id = ?`,
    [params.provider, params.eventId],
    tx,
  ))!;
  return { row, duplicate: res.affectedRows === 0 };
}

export async function claimWebhookEvents(limit: number, tx: PoolConnection): Promise<WebhookEventRow[]> {
  const candidates = await query<{ id: string }>(
    `SELECT id FROM webhook_events
      WHERE status IN ('received','failed') AND attempts < 10 AND signature_verified = 1
      ORDER BY received_at
      LIMIT ?
      FOR UPDATE SKIP LOCKED`,
    [limit],
    tx,
  );
  if (!candidates.length) return [];

  const ids = candidates.map((c) => c.id);
  const placeholders = ids.map(() => '?').join(', ');
  await execute(
    `UPDATE webhook_events SET status = 'processing', attempts = attempts + 1
      WHERE id IN (${placeholders})`,
    ids,
    tx,
  );
  return query<WebhookEventRow>(
    `SELECT ${WEBHOOK_COLUMNS} FROM webhook_events WHERE id IN (${placeholders}) ORDER BY received_at`,
    ids,
    tx,
  );
}

export async function finishWebhookEvent(
  params: { id: string; status: 'processed' | 'failed' | 'ignored'; error?: string | null },
  tx?: PoolConnection,
): Promise<void> {
  await execute(
    `UPDATE webhook_events SET status = ?, last_error = ?, processed_at = UTC_TIMESTAMP(3) WHERE id = ?`,
    [params.status, params.error?.slice(0, 500) ?? null, params.id],
    tx,
  );
}

export async function countWebhookBacklog(): Promise<number> {
  const row = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM webhook_events WHERE status IN ('received','processing','failed')`,
  );
  return Number(row?.n ?? 0);
}
