// store.js — persistence layer for Quiet Frames
//
// Data model (localStorage):
//   qf.sourceOverrides : edits to the live source content (photo order, captions, cover)
//   qf.draft           : selected (not yet published) batch — frozen snapshot
//   qf.published       : the currently published batch
//   qf.history[]       : past published batches (newest first)
//
// Write path goes through a single queue. When localStorage throws (or fault
// injection is enabled), the draft stays in memory and an automatic retry is
// scheduled; UI reads `getSaveStatus()` / subscribes to render the state.

const KEYS = {
  overrides: "qf.sourceOverrides",
  draft: "qf.draft",
  published: "qf.published",
  history: "qf.history",
  legacyV1: "qf.legacyMigratedV1",
};

const RETRY_MS = 3000;

const memory = {
  overrides: {},
  draft: null,
  published: null,
  history: [],
};

// ---- fault injection (console demo only) ----
let faultInjected = false;
export function setFault(on) {
  faultInjected = !!on;
  if (!faultInjected) flushQueue();
}
export function isFaulting() { return faultInjected; }

// ---- read/write primitives ----
function rawRead(key) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? undefined : JSON.parse(v);
  } catch (e) {
    return undefined;
  }
}

function rawWrite(key, value) {
  if (faultInjected) {
    throw new Error("Simulated write failure (fault injection enabled).");
  }
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    throw new Error(e && e.message ? e.message : "localStorage write failed");
  }
}

// ---- write queue: failure keeps data in memory and retries ----
const queue = []; // { key, value }
let retryTimer = null;
let saveStatus = { state: "idle", message: "" };
const statusListeners = new Set();

function emitStatus() {
  statusListeners.forEach((fn) => fn(saveStatus));
}

function setStatus(state, message) {
  saveStatus = { state, message };
  emitStatus();
}

export function getSaveStatus() { return { ...saveStatus }; }
export function onSaveStatus(fn) {
  statusListeners.add(fn);
  fn(saveStatus);
  return () => statusListeners.delete(fn);
}

function enqueueWrite(key, value) {
  // Keep only the latest pending write for a key.
  const existing = queue.find((q) => q.key === key);
  if (existing) existing.value = value;
  else queue.push({ key, value });

  const flushed = flushQueue();
  if (!flushed) {
    setStatus("error", "Write failed — draft kept locally, retrying…");
    if (!retryTimer) retryTimer = setInterval(flushQueue, RETRY_MS);
  }
}

function flushQueue() {
  let allOk = true;
  while (queue.length) {
    const job = queue[0];
    try {
      rawWrite(job.key, job.value);
      queue.shift();
    } catch (e) {
      allOk = false;
      break;
    }
  }
  if (allOk) {
    if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
    if (saveStatus.state === "error") setStatus("idle", "Saved");
    else setStatus("idle", "");
  }
  return allOk;
}

export function retryNow() {
  const ok = flushQueue();
  if (!ok) setStatus("error", "Still failing — draft retained, will retry…");
  return ok;
}

export function hasPendingWrites() { return queue.length > 0; }

// ---- boot notifications (legacy upgrade etc.) ----
const bootNotices = [];
export function takeBootNotices() { return bootNotices.splice(0); }

// ---- migration: upgrade old drafts without a batch number to v1 ----
const LEGACY_DRAFT_KEYS = ["qf.publishDraft", "qf.selection"];

function findLegacyDraft() {
  for (const key of LEGACY_DRAFT_KEYS) {
    const raw = rawRead(key);
    if (raw && typeof raw === "object") return { key, raw };
  }
  return null;
}

export function initStore() {
  memory.overrides = rawRead(KEYS.overrides) || {};
  memory.published = rawRead(KEYS.published) || null;
  memory.history = rawRead(KEYS.history) || [];
  memory.draft = rawRead(KEYS.draft) || null;

  // Old drafts without a batch number are upgraded into the first version.
  if (!memory.draft && !memory.published) {
    const legacy = findLegacyDraft();
    if (legacy && (legacy.raw.seriesIds || legacy.raw.pickedSeriesIds)) {
      const picked = legacy.raw.seriesIds || legacy.raw.pickedSeriesIds || [];
      memory.draft = {
        batchNo: "B001",
        version: 1,
        status: "draft",
        pickedSeriesIds: picked,
        createdAt: legacy.raw.createdAt || new Date().toISOString(),
        note: "Upgraded from an unnumbered legacy draft → first version (v1).",
        snapshot: legacy.raw.snapshot || null,
      };
      enqueueWrite(KEYS.draft, memory.draft);
      bootNotices.push(
        `Found a legacy draft without a batch number — upgraded it to the first version (B001 v1).`
      );
    }
  }

  // Also normalize a draft that somehow exists without batchNo/version.
  if (memory.draft && (memory.draft.batchNo == null || memory.draft.version == null)) {
    memory.draft.batchNo = memory.draft.batchNo || "B001";
    memory.draft.version = 1;
    memory.draft.status = memory.draft.status || "draft";
    bootNotices.push(`Draft ${memory.draft.batchNo} was missing a version — upgraded to v1.`);
    enqueueWrite(KEYS.draft, memory.draft);
  }

  return memory;
}

// ---- generic accessors ----
export function getOverrides() { return memory.overrides; }
export function getDraft() { return memory.draft; }
export function getPublished() { return memory.published; }
export function getHistory() { return memory.history; }

// ---- source overrides (photo order / captions / cover change the live source) ----
export function saveOverride(seriesId, override) {
  memory.overrides[seriesId] = {
    ...(memory.overrides[seriesId] || {}),
    ...override,
    updatedAt: new Date().toISOString(),
  };
  enqueueWrite(KEYS.overrides, memory.overrides);
}

export function resetOverrides(seriesId) {
  if (seriesId) delete memory.overrides[seriesId];
  else Object.keys(memory.overrides).forEach((k) => delete memory.overrides[k]);
  enqueueWrite(KEYS.overrides, memory.overrides);
}

// ---- draft batch ----
export function saveDraft(draft) {
  memory.draft = draft;
  enqueueWrite(KEYS.draft, draft);
  return draft;
}

export function clearDraft() {
  memory.draft = null;
  enqueueWrite(KEYS.draft, null);
}

// ---- publish ----
export function publishBatch(batch) {
  memory.published = batch;
  memory.history = [
    {
      batchNo: batch.batchNo,
      version: batch.version,
      publishedAt: batch.publishedAt,
      seriesCount: batch.snapshot.series.length,
      sourceHash: batch.sourceHash,
    },
    ...memory.history,
  ].slice(0, 20);
  memory.draft = null;
  enqueueWrite(KEYS.published, batch);
  enqueueWrite(KEYS.history, memory.history);
  enqueueWrite(KEYS.draft, null);
  return batch;
}
