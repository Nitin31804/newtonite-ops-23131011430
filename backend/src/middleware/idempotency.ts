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
  const rawPath = `${req.baseUrl}${req.path}`.replace(/\/+$/, '') || '/';
  const endpoint = `${req.method} ${rawPath}`;
  const requestPayload = req.body ? JSON.stringify(req.body) : '';

  try {
    // Check if key already exists
    const existing = await db('idempotency_keys')
      .where({ key: idempotencyKey, user_id: userId })
      .first();

    if (existing) {
      // Check for endpoint or payload mismatch
      if (
        existing.endpoint !== endpoint ||
        (existing.request_payload && existing.request_payload !== requestPayload)
      ) {
        res.status(422).json({
          error: 'Unprocessable Entity: Idempotency-Key was already used with a different request endpoint or payload.',
        });
        return;
      }

      // If currently marked in-flight (status_code === 0), concurrent requests MUST wait
      // Never delete an in-flight key based on arbitrary elapsed time, as slow operations may still be executing or committing
      if (existing.status_code === 0) {
        res.status(409).json({
          error: 'Concurrent Request Conflict: An identical request with this Idempotency-Key is currently in-flight.',
        });
        return;
      }

      if (existing.status_code > 0) {
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
    }

    // Phase 1: Atomically claim the idempotency key with IN_FLIGHT status (status_code = 0)
    try {
      await db('idempotency_keys').insert({
        key: idempotencyKey,
        user_id: userId,
        endpoint,
        request_payload: requestPayload,
        status_code: 0, // 0 = IN_FLIGHT reservation
        response_body: JSON.stringify({ status: 'IN_FLIGHT' }),
        created_at: new Date().toISOString(),
      });
    } catch (insertError: any) {
      // Primary key constraint violation: Another concurrent request claimed this key first
      const raced = await db('idempotency_keys').where({ key: idempotencyKey }).first();
      if (raced && raced.status_code > 0) {
        if (
          raced.endpoint !== endpoint ||
          (raced.request_payload && raced.request_payload !== requestPayload)
        ) {
          res.status(422).json({
            error: 'Unprocessable Entity: Idempotency-Key was already used with a different request endpoint or payload.',
          });
          return;
        }
        res.setHeader('X-Idempotency-Hit', 'true');
        res.status(raced.status_code).json(JSON.parse(raced.response_body));
        return;
      }
      res.status(409).json({
        error: 'Concurrent Request Conflict: An identical request with this Idempotency-Key is currently in-flight.',
      });
      return;
    }

    // Free the in-flight key if the client connection is aborted abruptly before response finishes
    req.on('close', async () => {
      if (!res.writableEnded) {
        try {
          const current = await db('idempotency_keys').where({ key: idempotencyKey, user_id: userId }).first();
          if (current && current.status_code === 0) {
            await db('idempotency_keys').where({ key: idempotencyKey, user_id: userId }).del();
          }
        } catch {}
      }
    });

    // Phase 2: Intercept response and await database update BEFORE flushing to client
    const originalJson = res.json.bind(res);
    res.json = function (body: any): Response {
      res.json = originalJson;

      (async () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 500) {
            await db('idempotency_keys')
              .where({ key: idempotencyKey, user_id: userId })
              .update({
                status_code: res.statusCode,
                response_body: JSON.stringify(body),
              });
          } else {
            // Remove in-flight reservation on server errors (5xx) so user can retry safely
            await db('idempotency_keys')
              .where({ key: idempotencyKey, user_id: userId })
              .del();
          }
        } catch (err) {
          console.error('Failed to update idempotency record:', err);
          // If updating the completed record fails, delete the in-flight key so it is NOT stranded
          await db('idempotency_keys')
            .where({ key: idempotencyKey, user_id: userId })
            .del()
            .catch(() => {});
        } finally {
          originalJson(body);
        }
      })();

      return res;
    };

    next();
  } catch (error) {
    console.error('Idempotency error:', error);
    next();
  }
}
