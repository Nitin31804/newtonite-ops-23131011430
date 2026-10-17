import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import itemsRoutes from './routes/items.js';
import teamsRoutes from './routes/teams.js';
import statsRoutes from './routes/stats.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

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
