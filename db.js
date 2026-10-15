const { createClient } = require('@libsql/client');
const path = require('node:path');
const fs = require('node:fs');

// Carrega .env quando não estiver em modo de teste temporário
if (!process.env.GUIAUP_DATA) {
  try { process.loadEnvFile(); } catch {}
}

const isTurso = Boolean(process.env.TURSO_DATABASE_URL) && !process.env.GUIAUP_DATA;

let client = null;
let localDb = null;

if (isTurso) {
  client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
} else {
  const { DatabaseSync } = require('node:sqlite');
  const dir = process.env.GUIAUP_DATA || path.join(__dirname, 'data');
  fs.mkdirSync(dir, { recursive: true });
  localDb = new DatabaseSync(path.join(dir, 'guiaup.sqlite'));
  localDb.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
}

async function q(sql, ...args) {
  if (isTurso) {
    const res = await client.execute({ sql, args });
    return res.rows;
  }
  return localDb.prepare(sql).all(...args);
}

async function one(sql, ...args) {
  if (isTurso) {
    const res = await client.execute({ sql, args });
    return res.rows[0] || null;
  }
  return localDb.prepare(sql).get(...args) || null;
}

async function run(sql, ...args) {
  if (isTurso) {
    const res = await client.execute({ sql, args });
    return res;
  }
  return localDb.prepare(sql).run(...args);
}

async function exec(sql) {
  if (isTurso) {
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    for (const stmt of statements) {
      await client.execute(stmt);
    }
  } else {
    localDb.exec(sql);
  }
}

async function initDb() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS guides(
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      company_name TEXT NOT NULL,
      email TEXT UNIQUE,
      password TEXT NOT NULL,
      salt TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      logo_data TEXT NOT NULL DEFAULT '',
      subscription_status TEXT NOT NULL DEFAULT 'trial',
      trial_ends_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trips(
      id TEXT PRIMARY KEY,
      guide_id TEXT REFERENCES guides(id),
      title TEXT NOT NULL,
      destination TEXT NOT NULL,
      date TEXT NOT NULL,
      date_return TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL,
      installment_text TEXT NOT NULL DEFAULT '',
      capacity INTEGER NOT NULL,
      description TEXT NOT NULL,
      meeting TEXT NOT NULL,
      photos TEXT NOT NULL DEFAULT '[]',
      published INTEGER NOT NULL DEFAULT 1,
      trip_type TEXT NOT NULL DEFAULT 'group'
    );

    CREATE TABLE IF NOT EXISTS participants(
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL REFERENCES trips(id),
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      present INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions(
      token TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      participant_id TEXT REFERENCES participants(id),
      guide_id TEXT REFERENCES guides(id),
      expires INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stops(
      trip_id TEXT PRIMARY KEY REFERENCES trips(id),
      id TEXT NOT NULL,
      label TEXT NOT NULL,
      ends_at INTEGER NOT NULL,
      duration INTEGER NOT NULL,
      cancelled INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS participant_links(
      token TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL REFERENCES participants(id),
      expires INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages(
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL REFERENCES trips(id),
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `;

  await exec(ddl);

  // Migrações seguras
  const migrations = [
    'ALTER TABLE trips ADD COLUMN guide_id TEXT REFERENCES guides(id)',
    'ALTER TABLE trips ADD COLUMN date_return TEXT DEFAULT ""',
    'ALTER TABLE trips ADD COLUMN installment_text TEXT DEFAULT ""',
    'ALTER TABLE trips ADD COLUMN photos TEXT DEFAULT "[]"',
    'ALTER TABLE sessions ADD COLUMN guide_id TEXT REFERENCES guides(id)',
    'ALTER TABLE trips ADD COLUMN trip_type TEXT DEFAULT "group"'
  ];

  for (const m of migrations) {
    try {
      if (isTurso) await client.execute(m);
      else localDb.exec(m + ';');
    } catch {}
  }
}

module.exports = {
  isTurso,
  q,
  one,
  run,
  exec,
  initDb
};
