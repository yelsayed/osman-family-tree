'use strict';

const { createClient } = require('redis');
const SEED = require('./seed');

const KEY = 'family:nodes';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

let client;
let connecting;

async function connect() {
  if (client && client.isOpen) return client;
  if (connecting) return connecting;
  client = createClient({ url: REDIS_URL });
  client.on('error', (err) => console.error('[redis] error:', err.message));
  connecting = client
    .connect()
    .then(() => {
      connecting = null;
      return client;
    })
    .catch((err) => {
      connecting = null;
      throw err;
    });
  return connecting;
}

/**
 * Try to connect, retrying for up to ~30s. Useful at boot when supervisord starts
 * Redis and Express in parallel.
 */
async function connectWithRetry({ retries = 30, delayMs = 1000 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await connect();
    } catch (err) {
      lastErr = err;
      // Reset client so next attempt creates a fresh one
      try {
        if (client) await client.disconnect().catch(() => {});
      } catch (_) {
        /* ignore */
      }
      client = undefined;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

async function getNodes() {
  const c = await connect();
  const raw = await c.get(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error('[redis] failed to parse nodes JSON:', err.message);
    return [];
  }
}

async function saveNodes(nodes) {
  const c = await connect();
  await c.set(KEY, JSON.stringify(nodes));
  // Best-effort BGSAVE — ignore errors (RDB may already be in progress)
  c.bgSave?.().catch(() => {});
}

async function ensureSeeded() {
  const c = await connectWithRetry();
  const exists = await c.exists(KEY);
  if (!exists) {
    console.log('[redis] no data found — seeding initial fixture');
    await c.set(KEY, JSON.stringify(SEED));
  }
}

module.exports = {
  connect,
  connectWithRetry,
  ensureSeeded,
  getNodes,
  saveNodes,
};
