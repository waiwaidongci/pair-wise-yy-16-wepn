// data.js — content model: live source (base JSON + local edits), fingerprints,
// frozen snapshots and published-state resolution.

import { getOverrides, getDraft, getPublished } from "./store.js";

const DATA_URL = "/mock-data/photos.json";

let base = null;

export async function loadBaseData() {
  if (base) return base;
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load content model (${res.status})`);
  base = await res.json();
  return base;
}

export function photoUrl(file) {
  return `/mock-data/${file}`;
}

// ---- live source = base content + source overrides ----
// Overrides only cover the things the photographer is still adjusting:
// cover choice, photo order and photo captions.
export function getLiveSeries(seriesId) {
  const s = base.series.find((x) => x.id === seriesId);
  if (!s) return null;
  const ov = getOverrides()[seriesId] || {};

  const order =
    Array.isArray(ov.photoOrder) && ov.photoOrder.length
      ? ov.photoOrder
      : s.photoIds.slice();

  const photos = order
    .map((id, idx) => {
      const p = base.photos.find((x) => x.id === id);
      if (!p) return null;
      const captionOverride = ov.captions && ov.captions[id];
      return {
        ...p,
        order: idx + 1,
        caption: captionOverride != null && captionOverride !== "" ? captionOverride : p.caption,
        captionEdited: captionOverride != null && captionOverride !== p.caption,
      };
    })
    .filter(Boolean);

  const coverPhotoId =
    ov.coverPhotoId && order.includes(ov.coverPhotoId) ? ov.coverPhotoId : order[0];

  return {
    id: s.id,
    title: s.title,
    category: s.category,
    summary: s.summary,
    coverPhotoId,
    photos,
  };
}

export function getAllLiveSeries() {
  return base.series.map((s) => getLiveSeries(s.id));
}

export function getCategoryLabel(catId) {
  const c = base.categories.find((x) => x.id === catId);
  return c ? c.label : catId;
}

// ---- fingerprints: a series changes when cover / order / any caption changes ----
function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return ("0000000" + (h >>> 0).toString(16)).slice(-8);
}

export function seriesFingerprint(series) {
  const payload = [
    series.id,
    series.coverPhotoId,
    series.photos
      .map((p) => `${p.id}@${p.order}#${p.caption}`)
      .join("|"),
  ].join("::");
  return hashString(payload);
}

// Snapshot is frozen at selection time: cover, order and captions included.
export function freezeSnapshot(seriesList) {
  return {
    frozenAt: new Date().toISOString(),
    series: seriesList.map((s) => ({
      id: s.id,
      title: s.title,
      category: s.category,
      summary: s.summary,
      coverPhotoId: s.coverPhotoId,
      fingerprint: seriesFingerprint(s),
      photos: s.photos.map((p) => ({
        id: p.id,
        title: p.title,
        altText: p.altText,
        caption: p.caption,
        file: p.file,
        width: p.width,
        height: p.height,
        order: p.order,
      })),
    })),
  };
}

export function batchSourceHash(snapshot) {
  return hashString(
    snapshot.series.map((s) => s.fingerprint).sort().join("|")
  );
}

// Published series become stale the moment the live source diverges from the
// frozen snapshot (order or caption change; missing photo also counts).
export function diffSnapshot(snapshot) {
  const stale = [];
  for (const frozen of snapshot.series) {
    const live = getLiveSeries(frozen.id);
    if (!live) {
      stale.push({ id: frozen.id, title: frozen.title, reason: "Series removed from source." });
      continue;
    }
    if (seriesFingerprint(live) !== frozen.fingerprint) {
      stale.push({
        id: frozen.id,
        title: live.title,
        reason: "Cover, photo order or captions changed after this batch was frozen.",
      });
    }
  }
  return stale;
}

// ---- what the public site should render ----
// mode: 'live' | 'published' | 'stale'
export function resolveSiteState() {
  const published = getPublished();
  if (!published || !published.snapshot) {
    return { mode: "live", batch: null, staleSeries: [], series: getAllLiveSeries() };
  }
  const staleSeries = diffSnapshot(published.snapshot);
  return {
    mode: staleSeries.length ? "stale" : "published",
    batch: published,
    staleSeries,
    series: published.snapshot.series.map(snapshotSeriesToView),
  };
}

// Frozen snapshot -> view shape used by the public pages.
function snapshotSeriesToView(s) {
  return {
    ...s,
    photos: s.photos
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((p) => ({ ...p, captionEdited: false })),
  };
}

export function snapshotPhoto(snapshot, photoId) {
  for (const s of snapshot.series) {
    const p = s.photos.find((x) => x.id === photoId);
    if (p) return p;
  }
  return null;
}

export { getDraft };
