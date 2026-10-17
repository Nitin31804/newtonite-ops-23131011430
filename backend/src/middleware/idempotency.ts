import { Response, NextFunction } from 'express';
import { db } from '../config/database.js';
import { AuthenticatedRequest } from './auth.js';

// Global registry of keys currently being actively processed by this Node.js instance
export const activeInFlightKeys = new Set<string>();

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
      // Register in-memory active key to distinguish actively executing slow queries from dead processes
      activeInFlightKeys.add(idempotencyKey);
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

    // Ensure active key cleanup if client disconnects or connection closes abruptly
    const cleanupActiveKey = () => {
      activeInFlightKeys.delete(idempotencyKey);
    };
    res.once('finish', cleanupActiveKey);
    res.once('close', cleanupActiveKey);

    // Phase 2: Intercept response and await database update BEFORE flushing to client
    const originalJson = res.json.bind(res);
    res.json = function (body: any): Response {
      res.json = originalJson;

      (async () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 500) {
            // Business action succeeded: Persist completed response
            // Retry up to 3 times to guard against transient database busy/lock states
            let saved = false;
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                await db('idempotency_keys')
                  .where({ key: idempotencyKey, user_id: userId })
                  .update({
                    status_code: res.statusCode,
                    response_body: JSON.stringify(body),
                  });
                saved = true;
                break;
              } catch (retryErr) {
                await new Promise((r) => setTimeout(r, 50));
              }
            }

            if (!saved) {
              console.error('CRITICAL: Failed to persist completed idempotency record.');
              // NEVER delete the key if the business operation succeeded!
              // Deleting allows duplicate execution on retry. Instead, mark status_code to prevent repeat execution.
              await db('idempotency_keys')
                .where({ key: idempotencyKey, user_id: userId })
                .update({
                  status_code: res.statusCode,
                  response_body: JSON.stringify({ message: 'Request completed successfully (cached payload unavailable)' }),
                })
                .catch(() => {});
            }
          } else {
            // Business action failed with a 5xx server error:
            // Release the in-flight reservation so the client can safely retry
            await db('idempotency_keys')
              .where({ key: idempotencyKey, user_id: userId })
              .del()
              .catch(() => {});
          }
        } catch (err) {
          console.error('Idempotency completion interceptor error:', err);
        } finally {
          activeInFlightKeys.delete(idempotencyKey);
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
