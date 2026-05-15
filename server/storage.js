'use strict';

/**
 * Pluggable blob storage for profile pictures.
 *
 * Backend selection:
 *   - S3:    if S3_BUCKET and S3_REGION are both set and non-empty.
 *   - Local: otherwise. Writes to MEDIA_DIR (default /data/media) and the bytes
 *            are served by the Express `/api/photos/*` route.
 *
 * The single object exported here intentionally has the same shape for both
 * backends so the rest of the server doesn't care which one is active.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const S3_BUCKET = (process.env.S3_BUCKET || '').trim();
const S3_REGION = (process.env.S3_REGION || '').trim();
const MEDIA_DIR = process.env.MEDIA_DIR || '/data/media';

function makeLocalBackend() {
  // Ensure the directory exists (best effort). Failures here are surfaced on
  // the first write so they aren't silently swallowed at boot.
  fs.mkdirSync(MEDIA_DIR, { recursive: true });

  function resolveSafe(key) {
    // Reject absolute paths and any traversal attempts before touching the FS.
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('invalid key');
    }
    if (key.startsWith('/') || key.includes('\0')) {
      throw new Error('invalid key');
    }
    const abs = path.resolve(MEDIA_DIR, key);
    const root = path.resolve(MEDIA_DIR);
    if (!abs.startsWith(root + path.sep) && abs !== root) {
      throw new Error('path traversal blocked');
    }
    return abs;
  }

  return {
    kind: 'local',

    async put(key, buffer, _contentType) {
      const abs = resolveSafe(key);
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, buffer);
    },

    async delete(key) {
      const abs = resolveSafe(key);
      try {
        await fsp.unlink(abs);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    },

    /** Used by the /api/photos/* route. Returns null when the object is missing. */
    async read(key) {
      const abs = resolveSafe(key);
      try {
        const stat = await fsp.stat(abs);
        if (!stat.isFile()) return null;
        return {
          stream: fs.createReadStream(abs),
          size: stat.size,
          // We only ever write webp, so this is a safe fixed value. The route
          // also defaults the header to image/webp if this is omitted.
          contentType: 'image/webp',
        };
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },

    publicUrl(key) {
      // Encode each path segment but keep the slashes between them readable.
      const encoded = key.split('/').map(encodeURIComponent).join('/');
      return `/api/photos/${encoded}`;
    },
  };
}

function makeS3Backend() {
  // Lazy-require so a missing @aws-sdk install never breaks local-backend dev.
  const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const client = new S3Client({ region: S3_REGION });

  return {
    kind: 's3',

    async put(key, buffer, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: contentType || 'application/octet-stream',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    },

    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    },

    publicUrl(key) {
      const encoded = key.split('/').map(encodeURIComponent).join('/');
      return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${encoded}`;
    },

    // S3 mode never serves bytes through Express.
    read: null,
  };
}

const storage = S3_BUCKET && S3_REGION ? makeS3Backend() : makeLocalBackend();

console.log(`[storage] backend=${storage.kind}${storage.kind === 'local' ? ` dir=${MEDIA_DIR}` : ` bucket=${S3_BUCKET}`}`);

module.exports = storage;
