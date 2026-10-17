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

    // Intercept response to store result
    const originalJson = res.json.bind(res);
    res.json = (body: any): Response => {
      // Restore original method
      res.json = originalJson;

      // Only cache successful or business conflict responses (2xx, 409)
      if (res.statusCode >= 200 && res.statusCode < 500) {
        // Fire and forget insert into idempotency_keys
        db('idempotency_keys')
          .insert({
            key: idempotencyKey,
            user_id: userId,
            endpoint,
            status_code: res.statusCode,
            response_body: JSON.stringify(body),
            created_at: new Date(),
          })
          .catch((err) => {
            console.error('Failed to store idempotency record:', err);
          });
      }

      return originalJson(body);
    };

    next();
  } catch (error) {
    console.error('Idempotency error:', error);
    next();
  }
}
