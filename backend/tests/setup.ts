import { beforeAll, afterAll } from 'vitest';
import { db } from '../src/config/database.js';
import { runSeed } from '../src/db/seed.js';

beforeAll(async () => {
  await runSeed(db);
});

afterAll(async () => {
  // Cleanup connections
  await db.destroy();
});
