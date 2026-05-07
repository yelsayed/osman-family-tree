'use strict';

const path = require('path');
const express = require('express');
const { ensureSeeded, getNodes, saveNodes } = require('./redis');

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'family123';
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, '..', 'dist');

app.use(express.json({ limit: '1mb' }));

// Tiny request log
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// Serve the built SPA (if present). In dev, Vite handles this and proxies /api here.
app.use(express.static(STATIC_DIR));

// ── Auth middleware ────────────────────────────────────────────
function requireAuth(req, res, next) {
  const password = req.body?.password ?? req.headers['x-admin-password'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
  }
  next();
}

// ── Helpers ────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_RE = /^\d{4}$/;

/**
 * Coerce a date-ish input into a YYYY-MM-DD string, or null.
 * - null / '' / undefined -> null
 * - 4-digit number or string -> YYYY-01-01 (legacy)
 * - YYYY-MM-DD string -> validated and returned as-is
 */
function coerceDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const y = Math.trunc(value);
    if (y < 1 || y > 9999) return null;
    return `${String(y).padStart(4, '0')}-01-01`;
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    if (ISO_DATE_RE.test(s)) {
      const d = new Date(s + 'T00:00:00Z');
      if (Number.isNaN(d.getTime())) return null;
      return s;
    }
    if (YEAR_RE.test(s)) return `${s}-01-01`;
  }
  return null;
}

function sanitizeIncoming(body) {
  const allowed = ['parentId', 'name', 'sex', 'born', 'died', 'bio', 'email'];
  const out = {};
  for (const k of allowed) {
    if (k in body) out[k] = body[k];
  }
  if ('born' in out) out.born = coerceDate(out.born);
  if ('died' in out) out.died = coerceDate(out.died);
  if ('sex' in out && out.sex !== 'female') out.sex = 'male';
  if ('name' in out && typeof out.name === 'string') out.name = out.name.trim();
  return out;
}

/**
 * Migrate any legacy year-only born/died values to YYYY-MM-DD.
 * Returns the migrated array; the second element indicates whether anything changed.
 */
function migrateNodes(nodes) {
  let changed = false;
  const out = nodes.map((n) => {
    const newBorn = coerceDate(n.born);
    const newDied = coerceDate(n.died);
    if (newBorn !== n.born || newDied !== n.died) changed = true;
    return { ...n, born: newBorn, died: newDied };
  });
  return [out, changed];
}

function getDescendants(id, nodes) {
  const ch = nodes.filter((n) => n.parentId === id);
  return ch.flatMap((c) => [c.id, ...getDescendants(c.id, nodes)]);
}

// ── API ────────────────────────────────────────────────────────

// Verify the admin password without performing any mutation.
// The client uses this to "unlock" edit mode for the current session.
app.post('/api/verify-password', (req, res) => {
  const password = req.body?.password ?? req.headers['x-admin-password'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
  }
  res.json({ success: true });
});

app.get('/api/nodes', async (_req, res) => {
  try {
    const raw = await getNodes();
    const [nodes, changed] = migrateNodes(raw);
    if (changed) {
      console.log('[migrate] upgraded legacy date format on read; persisting');
      await saveNodes(nodes);
    }
    res.json({ success: true, data: nodes });
  } catch (err) {
    console.error('GET /api/nodes failed:', err);
    res.status(500).json({ error: 'تعذّر جلب البيانات' });
  }
});

app.post('/api/nodes', requireAuth, async (req, res) => {
  try {
    const data = sanitizeIncoming(req.body);
    if (!data.name) return res.status(400).json({ error: 'الاسم مطلوب' });
    const nodes = await getNodes();
    const newId = nodes.reduce((m, n) => Math.max(m, n.id), 0) + 1;
    const newNode = {
      id: newId,
      parentId: data.parentId ?? null,
      name: data.name,
      sex: data.sex ?? 'male',
      born: data.born ?? null,
      died: data.died ?? null,
      bio: data.bio ?? '',
      email: data.email ?? '',
    };
    nodes.push(newNode);
    await saveNodes(nodes);
    res.json({ success: true, data: newNode });
  } catch (err) {
    console.error('POST /api/nodes failed:', err);
    res.status(500).json({ error: 'تعذّر إضافة العنصر' });
  }
});

app.put('/api/nodes/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    const updates = sanitizeIncoming(req.body);
    const nodes = await getNodes();
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx === -1) return res.status(404).json({ error: 'الشخص غير موجود' });
    nodes[idx] = { ...nodes[idx], ...updates };
    await saveNodes(nodes);
    res.json({ success: true, data: nodes[idx] });
  } catch (err) {
    console.error('PUT /api/nodes/:id failed:', err);
    res.status(500).json({ error: 'تعذّر التحديث' });
  }
});

app.delete('/api/nodes/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    let nodes = await getNodes();
    if (!nodes.some((n) => n.id === id)) {
      return res.status(404).json({ error: 'الشخص غير موجود' });
    }
    const toDelete = new Set([id, ...getDescendants(id, nodes)]);
    nodes = nodes.filter((n) => !toDelete.has(n.id));
    await saveNodes(nodes);
    res.json({ success: true, deleted: [...toDelete] });
  } catch (err) {
    console.error('DELETE /api/nodes/:id failed:', err);
    res.status(500).json({ error: 'تعذّر الحذف' });
  }
});

// SPA fallback — let any non-API GET fall back to index.html
app.get(/^(?!\/api).*/, (_req, res, next) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'), (err) => {
    if (err) next();
  });
});

async function start() {
  try {
    await ensureSeeded();
  } catch (err) {
    console.error('Could not connect to Redis at startup:', err.message);
    console.error('The server will still listen, but API calls will fail until Redis is available.');
  }
  app.listen(PORT, () => {
    console.log(`Family-tree server listening on http://0.0.0.0:${PORT}`);
    console.log(`Static dir: ${STATIC_DIR}`);
  });
}

start();
