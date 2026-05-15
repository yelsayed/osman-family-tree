'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { ensureSeeded, getNodes, saveNodes } = require('./redis');
const storage = require('./storage');

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'family123';
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, '..', 'dist');

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
  // Note: photoKey is intentionally not on this list — it can only be set
  // through the dedicated upload endpoint, never via the JSON write path.
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

/**
 * Photo variants written by the upload pipeline. Order matters in a couple of
 * places (delete + key construction), so it's defined once here.
 */
const PHOTO_VARIANTS = ['thumb', 'medium', 'original'];

/** Attach a derived photoUrls map (or null). photoKey itself is opaque. */
function withPhotoUrls(node) {
  if (!node) return node;
  if (!node.photoKey) return { ...node, photoUrls: null };
  const photoUrls = Object.fromEntries(
    PHOTO_VARIANTS.map((v) => [v, storage.publicUrl(`${node.photoKey}.${v}.webp`)]),
  );
  return { ...node, photoUrls };
}

// ── Upload plumbing ────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      const err = new Error('UNSUPPORTED_MEDIA_TYPE');
      err.statusCode = 415;
      return cb(err);
    }
    cb(null, true);
  },
});

function buildPhotoBaseKey(nodeId) {
  // ISO timestamp keeps keys naturally sortable; the random suffix prevents
  // collisions on rapid re-uploads and makes the path unpredictable.
  // No extension here — the variant pipeline appends `.thumb.webp`,
  // `.medium.webp`, and `.original.webp` to this base.
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const rnd = crypto.randomBytes(4).toString('hex');
  return `nodes/${nodeId}/${ts}-${rnd}`;
}

/**
 * Produce { thumb, medium, original } WebP buffers from a single decoded image.
 *
 * - thumb:    96×96 cover crop, q=82 (tree node avatar).
 * - medium:   256×256 cover crop, q=82 (drawer preview).
 * - original: long edge ≤ 2048, no crop, q=88 (lightbox).
 *
 * We build each from a fresh sharp pipeline rather than reusing the same one
 * because sharp pipelines are single-use after `.toBuffer()`.
 */
async function renderPhotoVariants(inputBuffer) {
  // Each pipeline starts from scratch — sharp pipelines are single-use after
  // `.toBuffer()`. `.rotate()` honours EXIF orientation; `.webp()` drops
  // metadata as a side-effect of transcoding.
  const pipe = () => sharp(inputBuffer).rotate();

  const [thumb, medium, original] = await Promise.all([
    pipe().resize({ width: 96, height: 96, fit: 'cover' }).webp({ quality: 82 }).toBuffer(),
    pipe().resize({ width: 256, height: 256, fit: 'cover' }).webp({ quality: 82 }).toBuffer(),
    pipe()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer(),
  ]);
  return { thumb, medium, original };
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
    res.json({ success: true, data: nodes.map(withPhotoUrls) });
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
    res.json({ success: true, data: withPhotoUrls(newNode) });
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
    res.json({ success: true, data: withPhotoUrls(nodes[idx]) });
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
    // Per the design, we intentionally leave blob storage objects in place when
    // a node is cascade-deleted. A future sweeper can reconcile.
    nodes = nodes.filter((n) => !toDelete.has(n.id));
    await saveNodes(nodes);
    res.json({ success: true, deleted: [...toDelete] });
  } catch (err) {
    console.error('DELETE /api/nodes/:id failed:', err);
    res.status(500).json({ error: 'تعذّر الحذف' });
  }
});

// ── Photo endpoints ────────────────────────────────────────────

/**
 * POST /api/nodes/:id/photo
 * multipart/form-data with a single `photo` field. Password may be sent as a
 * form field or in the `x-admin-password` header.
 *
 * `multer` runs first so the password can come from req.body (a form field)
 * after parsing. We then re-check auth inline.
 */
app.post('/api/nodes/:id/photo', (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      if (err.message === 'UNSUPPORTED_MEDIA_TYPE' || err.statusCode === 415) {
        return res.status(415).json({ error: 'صيغة الصورة غير مدعومة' });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'حجم الصورة يتجاوز الحد المسموح به (5MB)' });
      }
      console.error('upload parse error:', err);
      return res.status(400).json({ error: 'تعذّر قراءة الملف' });
    }

    const password = req.body?.password ?? req.headers['x-admin-password'];
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
    }

    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    if (!req.file) return res.status(400).json({ error: 'لم يتم إرفاق صورة' });

    try {
      // Render thumb / medium / original. sharp throws for non-image inputs,
      // so this also serves as the real "is this actually an image?" check.
      const variants = await renderPhotoVariants(req.file.buffer);

      const nodes = await getNodes();
      const idx = nodes.findIndex((n) => n.id === id);
      if (idx === -1) return res.status(404).json({ error: 'الشخص غير موجود' });

      const baseKey = buildPhotoBaseKey(id);
      await Promise.all(
        PHOTO_VARIANTS.map((v) => storage.put(`${baseKey}.${v}.webp`, variants[v], 'image/webp')),
      );

      nodes[idx] = { ...nodes[idx], photoKey: baseKey };
      await saveNodes(nodes);

      res.json({ success: true, data: withPhotoUrls(nodes[idx]) });
    } catch (e) {
      console.error('POST /api/nodes/:id/photo failed:', e);
      res.status(500).json({ error: 'تعذّر رفع الصورة' });
    }
  });
});

/**
 * DELETE /api/nodes/:id/photo — clear the pointer; best-effort delete the blob.
 */
app.delete('/api/nodes/:id/photo', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });

    const nodes = await getNodes();
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx === -1) return res.status(404).json({ error: 'الشخص غير موجود' });

    const oldBaseKey = nodes[idx].photoKey;
    const next = { ...nodes[idx] };
    delete next.photoKey;
    nodes[idx] = next;
    await saveNodes(nodes);

    if (oldBaseKey) {
      // Fire and forget — a transient blob-store error never blocks the
      // metadata update. Each variant is deleted independently so one failure
      // doesn't strand the others.
      for (const v of PHOTO_VARIANTS) {
        const key = `${oldBaseKey}.${v}.webp`;
        storage.delete(key).catch((e) => {
          console.warn('[storage] best-effort delete failed:', key, e.message);
        });
      }
    }

    res.json({ success: true, data: withPhotoUrls(nodes[idx]) });
  } catch (err) {
    console.error('DELETE /api/nodes/:id/photo failed:', err);
    res.status(500).json({ error: 'تعذّر حذف الصورة' });
  }
});

/**
 * GET /api/photos/* — local backend only. The S3 backend serves images
 * directly from the bucket, bypassing Express entirely.
 */
if (storage.kind === 'local' && typeof storage.read === 'function') {
  app.get(/^\/api\/photos\/(.+)/, async (req, res) => {
    const key = req.params[0];
    try {
      const obj = await storage.read(key);
      if (!obj) return res.status(404).json({ error: 'الصورة غير موجودة' });
      res.setHeader('Content-Type', obj.contentType || 'image/webp');
      // The key is content-addressed (timestamp + random suffix) so it never
      // mutates — long cache is safe.
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      obj.stream.on('error', (e) => {
        console.error('[storage] stream error:', e.message);
        if (!res.headersSent) res.status(500).end();
      });
      obj.stream.pipe(res);
    } catch (e) {
      console.error('GET /api/photos failed:', e);
      res.status(400).json({ error: 'طلب غير صالح' });
    }
  });
}

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
