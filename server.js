// server.js
//
// Serves the static site from dist/ and exposes the publish-batch API.
// All writes go through store.saveBatches (retry loop). On final failure the
// draft is preserved in memory and the API returns an error so the UI can
// offer a retry without losing work.

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./lib/store');
const generate = require('./lib/generate');

const PORT = process.env.PORT || 3000;
const DIST_DIR = generate.DIST_DIR;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Persist batches with retry. On failure, keep the in-memory draft and
 * return an error so the caller can retry.
 */
async function persistBatches(doc) {
  try {
    await store.saveBatches(doc);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code || 'WRITE_FAILED' };
  }
}

function regenerateSite(content, doc) {
  const fresh = store.recomputeStaleness(content, doc);
  generate.generate(content, fresh);
}

async function handleApi(req, res, pathname) {
  const content = store.loadContent();
  const doc = store.loadBatches();

  if (req.method === 'GET' && pathname === '/api/content') {
    return sendJson(res, 200, {
      categories: content.categories,
      series: content.series,
      photos: content.photos,
    });
  }

  if (req.method === 'GET' && pathname === '/api/batches') {
    const fresh = store.recomputeStaleness(content, doc);
    return sendJson(res, 200, {
      batches: fresh.batches,
      published: fresh.published,
    });
  }

  if (req.method === 'POST' && pathname === '/api/batches/freeze') {
    const body = await readBody(req);
    const seriesId = body.seriesId;
    if (!seriesId) return sendJson(res, 400, { ok: false, error: '缺少 seriesId' });
    try {
      const batch = store.freezeBatch(content, seriesId, { note: body.note || '' });
      doc.batches.push(batch);
      const result = await persistBatches(doc);
      if (!result.ok) {
        // Keep the draft in memory; report failure so UI can retry.
        return sendJson(res, 500, {
          ok: false,
          error: result.error,
          code: result.code,
          draft: batch,
          retryable: true,
        });
      }
      regenerateSite(content, doc);
      return sendJson(res, 200, { ok: true, batch });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && pathname === '/api/batches/refreeze') {
    const body = await readBody(req);
    const batch = doc.batches.find((b) => b.id === body.batchId);
    if (!batch) return sendJson(res, 404, { ok: false, error: '批次不存在' });
    try {
      const updated = store.refreezeBatch(content, batch);
      const idx = doc.batches.findIndex((b) => b.id === batch.id);
      doc.batches[idx] = updated;
      const result = await persistBatches(doc);
      if (!result.ok) {
        return sendJson(res, 500, {
          ok: false,
          error: result.error,
          code: result.code,
          draft: updated,
          retryable: true,
        });
      }
      regenerateSite(content, doc);
      return sendJson(res, 200, { ok: true, batch: updated });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && pathname === '/api/batches/publish') {
    const body = await readBody(req);
    const batch = doc.batches.find((b) => b.id === body.batchId);
    if (!batch) return sendJson(res, 404, { ok: false, error: '批次不存在' });
    if (batch.status !== 'draft' && batch.status !== 'stale') {
      return sendJson(res, 400, { ok: false, error: `当前状态不可发布：${batch.status}` });
    }
    // Recompute checksum at publish time so the frozen snapshot matches source.
    const checksum = store.computeSeriesChecksum(content, batch.seriesId);
    if (checksum) batch.frozen.checksum = checksum;
    batch.status = 'published';
    batch.publishedAt = new Date().toISOString();
    doc.published[batch.seriesId] = batch.id;
    const result = await persistBatches(doc);
    if (!result.ok) {
      return sendJson(res, 500, {
        ok: false,
        error: result.error,
        code: result.code,
        draft: batch,
        retryable: true,
      });
    }
    regenerateSite(content, doc);
    return sendJson(res, 200, { ok: true, batch });
  }

  return sendJson(res, 404, { ok: false, error: '未知接口' });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.join(DIST_DIR, rel);
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404</h1>');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, pathname);
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return;
  }
  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`[server] 站点地址 http://localhost:${PORT}`);
  console.log(`[server] 发布管理 http://localhost:${PORT}/publish.html`);
});
