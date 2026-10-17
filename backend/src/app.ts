import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import itemsRoutes from './routes/items.js';
import teamsRoutes from './routes/teams.js';
import statsRoutes from './routes/stats.js';

export function createApp() {
  const app = express();

  // 1. Helmet security headers (CSP, HSTS, XSS protection, anti-clickjacking)
  app.use(helmet());

  // 2. Rate limiting (DoS & brute-force defense)
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    message: { error: 'Rate limit exceeded: Too many requests from this IP, please try again later.' },
  });
  app.use('/api', apiLimiter);

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    message: { error: 'Rate limit exceeded: Too many login attempts. Account temporarily throttled for 15 minutes.' },
  });
  app.use('/api/auth/login', loginLimiter);

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
          callback(null, true);
        } else {
          callback(new Error('Blocked by CORS policy: unauthorized origin.'));
        }
      },
      credentials: true,
    })
  );

  // Guard against oversized payload attacks (DoS mitigation)
  app.use(express.json({ limit: '1mb' }));

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'newtonite-operations-platform', timestamp: new Date() });
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/items', itemsRoutes);
  app.use('/api/teams', teamsRoutes);
  app.use('/api/stats', statsRoutes);

  // Global 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
  });

  return app;
}

export const app = createApp();
