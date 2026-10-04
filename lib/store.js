// lib/store.js
//
// Content store + publish-batch persistence.
//
// A "batch" is a frozen snapshot of a series: its cover, photo order, and
// captions. Batches are versioned. When the underlying photo order or
// captions change, the batch's checksum no longer matches the source data and
// the batch becomes stale (待复核 / pending review). Stale published batches
// remain visible but are flagged for review.
//
// Old drafts that carry no batch number are upgraded to version 1 on load.
// Writes go through a retry loop; on final failure the in-memory draft is
// preserved so the caller can retry without losing work.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PHOTOS_PATH = path.join(ROOT, 'mock-data', 'photos.json');
const DATA_DIR = path.join(ROOT, 'data');
const BATCHES_PATH = path.join(DATA_DIR, 'batches.json');

const MAX_WRITE_ATTEMPTS = 3;
const WRITE_RETRY_DELAY_MS = 120;

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Write a file with retries. On final failure the error is thrown so the
 * caller can keep its in-memory draft and offer a retry.
 */
async function writeFileWithRetry(filePath, contents, attempts = MAX_WRITE_ATTEMPTS) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tmp = filePath + '.tmp';
      fs.writeFileSync(tmp, contents);
      fs.renameSync(tmp, filePath);
      return { ok: true, attempts };
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await sleep(WRITE_RETRY_DELAY_MS * attempt);
      }
    }
  }
  const error = new Error(
    `写入失败（已重试 ${attempts} 次）：${lastError ? lastError.message : '未知错误'}`
  );
  error.cause = lastError;
  error.code = 'WRITE_FAILED';
  throw error;
}

// ---------------------------------------------------------------------------
// Content model
// ---------------------------------------------------------------------------

function loadContent() {
  const data = readJson(PHOTOS_PATH);
  const photosById = new Map();
  for (const photo of data.photos) {
    photosById.set(photo.id, photo);
  }
  return {
    categories: data.categories,
    series: data.series,
    photos: data.photos,
    photosById,
  };
}

/**
 * Compute a deterministic checksum over a series' current photo order and
 * captions. Used to detect drift between a frozen batch and live source data.
 */
function computeSeriesChecksum(content, seriesId) {
  const series = content.series.find((s) => s.id === seriesId);
  if (!series) return null;
  const parts = [];
  for (const photoId of series.photoIds) {
    const photo = content.photosById.get(photoId);
    if (!photo) continue;
    parts.push(`${photo.id}|${photo.order}|${photo.caption || ''}|${photo.title || ''}`);
  }
  const hash = crypto.createHash('sha256').update(parts.join('\n'), 'utf8').digest('hex');
  return hash;
}

// ---------------------------------------------------------------------------
// Batch model
// ---------------------------------------------------------------------------

function createBatchId() {
  return `batch-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Freeze a snapshot of a series. Captures cover, order, and captions.
 * Returns a new batch object (not yet persisted).
 */
function freezeBatch(content, seriesId, options = {}) {
  const series = content.series.find((s) => s.id === seriesId);
  if (!series) {
    throw new Error(`系列不存在：${seriesId}`);
  }
  const orderedIds = series.photoIds.slice();
  const cover = options.cover && orderedIds.includes(options.cover)
    ? options.cover
    : orderedIds[0];

  const descriptions = {};
  for (const photoId of orderedIds) {
    const photo = content.photosById.get(photoId);
    if (photo) {
      descriptions[photoId] = photo.caption || '';
    }
  }

  const checksum = computeSeriesChecksum(content, seriesId);
  const now = new Date().toISOString();

  return {
    id: createBatchId(),
    seriesId,
    version: 1,
    status: 'draft', // draft | published | stale
    frozen: {
      cover,
      order: orderedIds,
      descriptions,
      checksum,
    },
    createdAt: now,
    publishedAt: null,
    note: options.note || '',
  };
}

/**
 * Re-freeze a draft batch (re-select). Bumps the version and refreshes the
 * snapshot from current source data. Only drafts can be re-selected.
 */
function refreezeBatch(content, batch) {
  if (batch.status !== 'draft') {
    throw new Error(`只有草稿批次可以重选（当前状态：${batch.status}）`);
  }
  const fresh = freezeBatch(content, batch.seriesId, {
    cover: batch.frozen.cover,
    note: batch.note,
  });
  fresh.id = batch.id;
  fresh.version = (batch.version || 1) + 1;
  fresh.createdAt = batch.createdAt;
  return fresh;
}

/**
 * Migration: upgrade old drafts that carry no batch number to version 1.
 * Also normalizes missing fields.
 */
function migrateBatches(raw) {
  if (!raw || typeof raw !== 'object') {
    return { version: 1, batches: [], published: {} };
  }
  const doc = {
    version: raw.version || 1,
    batches: Array.isArray(raw.batches) ? raw.batches.slice() : [],
    published: raw.published && typeof raw.published === 'object' ? { ...raw.published } : {},
  };
  let migrated = false;
  for (const batch of doc.batches) {
    if (typeof batch.version !== 'number' || batch.version < 1) {
      batch.version = 1;
      migrated = true;
    }
    if (!batch.status) {
      batch.status = 'draft';
      migrated = true;
    }
    if (!batch.frozen) {
      batch.frozen = { cover: null, order: [], descriptions: {}, checksum: null };
      migrated = true;
    }
  }
  doc._migrated = migrated;
  return doc;
}

function loadBatches() {
  let raw = null;
  try {
    raw = readJson(BATCHES_PATH);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return migrateBatches(raw);
}

async function saveBatches(doc) {
  const clean = {
    version: doc.version,
    batches: doc.batches,
    published: doc.published,
  };
  const contents = JSON.stringify(clean, null, 2) + '\n';
  await writeFileWithRetry(BATCHES_PATH, contents);
  return { ok: true };
}

/**
 * Recompute staleness for every batch against current source data.
 * A published batch whose checksum no longer matches is marked stale
 * (待复核) but remains visible.
 */
function recomputeStaleness(content, doc) {
  const bySeries = new Map();
  for (const batch of doc.batches) {
    const current = bySeries.get(batch.seriesId);
    if (!current || batch.version > current.version) {
      bySeries.set(batch.seriesId, batch);
    }
  }
  for (const batch of doc.batches) {
    if (batch.status !== 'published') continue;
    const checksum = computeSeriesChecksum(content, batch.seriesId);
    if (checksum && batch.frozen.checksum && checksum !== batch.frozen.checksum) {
      batch.status = 'stale';
    }
  }
  return doc;
}

/**
 * Return the effective published batch for a series (stale batches are still
 * the published record, just flagged). Returns null when nothing published.
 */
function getPublishedBatch(doc, seriesId) {
  const batchId = doc.published[seriesId];
  if (!batchId) return null;
  return doc.batches.find((b) => b.id === batchId) || null;
}

module.exports = {
  ROOT,
  PHOTOS_PATH,
  DATA_DIR,
  BATCHES_PATH,
  readJson,
  writeFileWithRetry,
  loadContent,
  computeSeriesChecksum,
  freezeBatch,
  refreezeBatch,
  migrateBatches,
  loadBatches,
  saveBatches,
  recomputeStaleness,
  getPublishedBatch,
  createBatchId,
};
