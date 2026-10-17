import { Response, NextFunction } from 'express';
import { db } from '../config/database.js';
import { AuthenticatedRequest } from './auth.js';

export async function idempotencyMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Only apply idempotency to mutating requests
  if (!['POST', 'PATCH', 'PUT'].includes(req.method)) {
    return next();
  }

  const idempotencyKey = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string;
  if (!idempotencyKey) {
    // If no key provided, proceed normally
    return next();
  }

  const userId = req.user?.id || 'anonymous';
  const endpoint = `${req.method} ${req.baseUrl}${req.path}`;

  try {
    // Check if key already exists
    const existing = await db('idempotency_keys')
      .where({ key: idempotencyKey, user_id: userId })
      .first();

    if (existing) {
      // If currently processing in another thread
      if (existing.status_code === 0) {
        res.status(409).json({
          error: 'Concurrent Request Conflict: An identical request with this Idempotency-Key is currently in-flight.',
        });
        return;
      }

      res.setHeader('X-Idempotency-Hit', 'true');
      res.status(existing.status_code);
      try {
        const parsed = JSON.parse(existing.response_body);
        res.json(parsed);
      } catch {
        res.send(existing.response_body);
      }
      return;
    }

    // Phase 1: Atomically claim the idempotency key with IN_FLIGHT status (status_code = 0)
    try {
      await db('idempotency_keys').insert({
        key: idempotencyKey,
        user_id: userId,
        endpoint,
        status_code: 0, // 0 = IN_FLIGHT reservation
        response_body: JSON.stringify({ status: 'IN_FLIGHT' }),
        created_at: new Date().toISOString(),
      });
    } catch (insertError: any) {
      // Primary key constraint violation: Another concurrent request claimed this key first
      const raced = await db('idempotency_keys').where({ key: idempotencyKey }).first();
      if (raced && raced.status_code > 0) {
        res.setHeader('X-Idempotency-Hit', 'true');
        res.status(raced.status_code).json(JSON.parse(raced.response_body));
        return;
      }
      res.status(409).json({
        error: 'Concurrent Request Conflict: An identical request with this Idempotency-Key is currently in-flight.',
      });
      return;
    }

    // Phase 2: Intercept response to update reservation with finalized response
    const originalJson = res.json.bind(res);
    res.json = (body: any): Response => {
      res.json = originalJson;

      if (res.statusCode >= 200 && res.statusCode < 500) {
        db('idempotency_keys')
          .where({ key: idempotencyKey, user_id: userId })
          .update({
            status_code: res.statusCode,
            response_body: JSON.stringify(body),
          })
          .catch((err) => {
            console.error('Failed to update idempotency record:', err);
          });
      } else {
        // Remove in-flight reservation on server errors (5xx) so user can retry safely
        db('idempotency_keys')
          .where({ key: idempotencyKey, user_id: userId })
          .del()
          .catch(() => {});
      }

      return originalJson(body);
    };

    next();
  } catch (error) {
    console.error('Idempotency error:', error);
    next();
  }
}
