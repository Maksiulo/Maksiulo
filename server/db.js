const { Pool, types } = require('pg');
types.setTypeParser(1082, v => v); // DATE как строка YYYY-MM-DD, без сдвига часовых поясов

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL не задан'); process.exit(1); }
const needSsl = /sslmode=require|neon\.tech|supabase\.co/.test(url) && !/sslmode=disable/.test(url);
const pool = new Pool({ connectionString: url, max: 10, ssl: needSsl ? { rejectUnauthorized: false } : undefined });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  first_name TEXT NOT NULL DEFAULT '',
  username TEXT,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  xp INT NOT NULL DEFAULT 0,
  pass_season INT NOT NULL DEFAULT 0,
  pass_claimed INT[] NOT NULL DEFAULT '{}',
  streak INT NOT NULL DEFAULT 0,
  last_checkin DATE,
  quests JSONB NOT NULL DEFAULT '{}',
  referrer BIGINT,
  stars_paid BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gifts (
  id TEXT PRIMARY KEY,
  owner BIGINT REFERENCES users(id),
  model INT NOT NULL, tier INT NOT NULL, skin INT NOT NULL, bd INT NOT NULL, sym INT NOT NULL,
  num INT NOT NULL,
  origin TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'owned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gifts_owner ON gifts(owner) WHERE status <> 'burned';
CREATE TABLE IF NOT EXISTS counters (model INT PRIMARY KEY, n INT NOT NULL);
CREATE TABLE IF NOT EXISTS listings (
  gift_id TEXT PRIMARY KEY REFERENCES gifts(id),
  seller BIGINT NOT NULL REFERENCES users(id),
  price BIGINT NOT NULL CHECK (price > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sales (
  id BIGSERIAL PRIMARY KEY, gift_id TEXT NOT NULL, seller BIGINT, buyer BIGINT,
  price BIGINT NOT NULL, fee BIGINT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS drops (
  id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, model INT NOT NULL, tier INT NOT NULL,
  price BIGINT NOT NULL, supply INT NOT NULL, minted INT NOT NULL DEFAULT 0,
  ends_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gift_links (
  code TEXT PRIMARY KEY, gift_id TEXT NOT NULL REFERENCES gifts(id), from_user BIGINT NOT NULL,
  claimed_by BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payments (
  charge_id TEXT PRIMARY KEY, user_id BIGINT NOT NULL, stars BIGINT NOT NULL, credited BIGINT NOT NULL,
  payload TEXT NOT NULL, refunded BOOLEAN NOT NULL DEFAULT false, at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ledger (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, delta BIGINT NOT NULL, reason TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, at DESC);
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins BIGINT NOT NULL DEFAULT 500 CHECK (coins >= 0);
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins_won BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins_bonus DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wheel_day DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS arcade_xp JSONB NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS chicken (
  id TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id), bet BIGINT NOT NULL,
  risk TEXT NOT NULL, step INT NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'live',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS chicken_live ON chicken(user_id) WHERE status = 'live';
CREATE INDEX IF NOT EXISTS users_coins_won ON users(coins_won DESC);
`;

async function migrate() { await pool.query(SCHEMA); }

/* Выполнить fn внутри транзакции; при ошибке — откат */
async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

module.exports = { pool, migrate, tx };
