import type { FastifyInstance } from 'fastify';
import {
  AppError,
  IDEMPOTENCY_HEADER,
  createGenerationRequest,
  idempotencyKeySchema,
} from '@loopscene/contracts';
import { getBalance, listOpenJobs } from '@loopscene/db';
import type { AppContext } from '../context.js';
import { cancelGeneration, createGeneration, getJobView, toJobView } from '../services/generation.js';

export default async function generationRoutes(app: FastifyInstance, opts: { ctx: AppContext }) {
  const { ctx } = opts;

  /**
   * POST /v1/generations — 202 with a job id (§10).
   * The idempotency key is mandatory: without it a network retry would create a
   * second job and a second charge.
   */
  app.post(
    '/v1/generations',
    {
      preHandler: app.requireAgeConfirmed,
      config: {
        rateLimit: {
          max: ctx.config.GENERATION_RATE_LIMIT_PER_HOUR,
          timeWindow: '1 hour',
          keyGenerator: (req: { user?: { id: string }; ip: string }) => req.user?.id ?? req.ip,
        },
      },
    },
    async (req, reply) => {
      const rawKey = req.headers[IDEMPOTENCY_HEADER];
      const parsedKey = idempotencyKeySchema.safeParse(Array.isArray(rawKey) ? rawKey[0] : rawKey);
      if (!parsedKey.success) {
        throw new AppError('VALIDATION_FAILED', `a valid ${IDEMPOTENCY_HEADER} header is required`);
      }
      const body = createGenerationRequest.parse(req.body);

      const result = await createGeneration(ctx, {
        userId: req.user!.id,
        idempotencyKey: parsedKey.data,
        request: body,
      });

      // The full job view, so the client can render the progress screen without
      // an immediate follow-up GET.
      return reply.status(202).send({
        ...toJobView(ctx, result.job),
        deduplicated: result.deduplicated,
      });
    },
  );

  /** GET /v1/jobs/:id — owner-scoped status polling with backoff hints. */
  app.get('/v1/jobs/:id', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    return getJobView(ctx, id, req.user!.id);
  });

  app.post('/v1/jobs/:id/cancel', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    return cancelGeneration(ctx, { jobId: id, userId: req.user!.id });
  });

  /**
   * Open jobs for the current user, so the studio can restore in-flight work
   * after a refresh or a re-login (GEN-10).
   */
  app.get('/v1/jobs', { preHandler: app.requireAuth }, async (req) => {
    const rows = await listOpenJobs(req.user!.id);
    return { items: rows.map((r) => toJobView(ctx, r)) };
  });

  /**
   * UI-03 requires the create screen to show the real remaining balance before
   * submission, not an optimistic client-side number.
   */
  app.get('/v1/entitlements/summary', { preHandler: app.requireAuth }, async (req) => {
    const balance = await getBalance(req.user!.id);
    return {
      availableUnits: balance.available,
      reservedUnits: balance.reserved,
      costOfNextGeneration: 1,
    };
  });
}
