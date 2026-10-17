import { app } from './app.js';
import { db } from './config/database.js';
import { initSchema } from './db/schema.js';
import { outboxWorker } from './workers/outboxWorker.js';

const PORT = process.env.PORT || 4000;

async function bootstrap() {
  try {
    // 1. Ensure schema is initialized
    await initSchema(db);
    console.log('Database initialized successfully.');

    // 2. Start background outbox processor
    outboxWorker.start(3000);
    console.log('Transactional outbox background worker started.');

    // 3. Start HTTP server
    const server = app.listen(PORT, () => {
      console.log(`Newtonite Operations Platform backend running on http://localhost:${PORT}`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log('Shutting down server gracefully...');
      outboxWorker.stop();
      server.close(() => {
        db.destroy().then(() => {
          console.log('Database connections closed.');
          process.exit(0);
        });
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('Fatal initialization error:', error);
    process.exit(1);
  }
}

bootstrap();
