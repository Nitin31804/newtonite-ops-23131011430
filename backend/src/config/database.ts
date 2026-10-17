import knex, { Knex } from 'knex';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

let dbInstance: Knex | null = null;

export function getDatabase(forceMemory = false): Knex {
  if (dbInstance && !forceMemory) {
    return dbInstance;
  }

  const databaseUrl = process.env.DATABASE_URL;
  const isPostgres = databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'));

  let config: Knex.Config;

  if (isPostgres) {
    config = {
      client: 'pg',
      connection: databaseUrl,
      pool: { min: 2, max: 20 },
      migrations: {
        tableName: 'knex_migrations',
      },
    };
  } else {
    // SQLite mode (for development or testing)
    const isTest = process.env.NODE_ENV === 'test' || forceMemory;
    const dbFilename = isTest ? ':memory:' : path.resolve(process.cwd(), 'data', 'newtonite.sqlite');

    if (!isTest) {
      const dataDir = path.dirname(dbFilename);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    }

    config = {
      client: 'better-sqlite3',
      connection: {
        filename: dbFilename,
      },
      useNullAsDefault: true,
      pool: {
        afterCreate: (conn: any, cb: any) => {
          // Enable foreign keys and WAL mode in SQLite for high concurrency
          conn.pragma('foreign_keys = ON');
          if (!isTest) {
            conn.pragma('journal_mode = WAL');
          }
          cb();
        },
      },
    };
  }

  const db = knex(config);
  if (!forceMemory) {
    dbInstance = db;
  }
  return db;
}

export const db = getDatabase();
