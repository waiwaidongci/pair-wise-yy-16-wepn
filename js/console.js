// console.js — publish console.
//
// Workflow:
//   1. pick the series for a batch (re-pickable until it is published)
//   2. freeze cover / photo order / captions into a snapshot ("freeze")
//   3. publish → public pages render the frozen snapshot
// Once order or captions change afterwards, the published batch goes stale
// (still viewable, flagged pending review) and any draft must be re-frozen.

import {
  initStore,
  getDraft,
  getPublished,
  getHistory,
  saveDraft,
  clearDraft,
  publishBatch,
  saveOverride,
  resetOverrides,
  setFault,
  isFaulting,
  retryNow,
  onSaveStatus,
  getSaveStatus,
  hasPendingWrites,
  takeBootNotices,
} from "./store.js";
import {
  loadBaseData,
  getAllLiveSeries,
  getLiveSeries,
  freezeSnapshot,
  batchSourceHash,
  seriesFingerprint,
  diffSnapshot,
} from "./data.js";
import { frameHtml, hydrateFrames, escapeHtml, formatDate } from "./ui.js";

initStore();
await loadBaseData();

const els = {
  batchPanel: document.getElementById("batch-panel"),
  contentPanel: document.getElementById("content-panel"),
  historyPanel: document.getElementById("history-panel"),
};
let panel = "batch";

function $(sel, root = document) { return root.querySelector(sel); }

// ---------------------------------------------------------------- tabs
function initTabs() {
  document.querySelectorAll(".console-nav button").forEach((btn) => {
    btn.addEventListener("click", () => {
      panel = btn.dataset.panel;
      document.querySelectorAll(".console-nav button").forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
      document.querySelectorAll(".panel").forEach((p) =>
        p.classList.toggle("active", p.id === `panel-${panel}`)
      );
      // Refresh only the panel being opened, so an open editor in the
      // content panel keeps its state.
      if (panel === "batch") renderBatchPanel();
      else if (panel === "history") renderHistoryPanel();
    });
  });
}

// ---------------------------------------------------------------- batch helpers
function nextBatchNo() {
  const used = [getPublished(), getDraft(), ...getHistory()]
    .filter(Boolean)
    .map((b) => Number(String(b.batchNo).replace(/\D/g, "")))
    .filter((n) => !Number.isNaN(n));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `B${String(next).padStart(3, "0")}`;
}

function createDraft(pickedIds) {
  const seriesList = pickedIds.map((id) => getLiveSeries(id)).filter(Boolean);
  const snapshot = freezeSnapshot(seriesList);
  return saveDraft({
    batchNo: nextBatchNo(),
    version: 1,
    status: "draft",
    pickedSeriesIds: pickedIds,
    createdAt: new Date().toISOString(),
    frozenAt: snapshot.frozenAt,
    sourceHash: batchSourceHash(snapshot),
    snapshot,
  });
}

function refreezeDraft() {
  const d = getDraft();
  if (!d) return null;
  const seriesList = d.pickedSeriesIds
    .map((id) => getLiveSeries(id))
    .filter(Boolean);
  const snapshot = freezeSnapshot(seriesList);
  return saveDraft({
    ...d,
    pickedSeriesIds: seriesList.map((s) => s.id),
    frozenAt: snapshot.frozenAt,
    sourceHash: batchSourceHash(snapshot),
    snapshot,
  });
}

function draftStaleReasons(draft) {
  if (!draft || !draft.snapshot) return [];
  return diffSnapshot(draft.snapshot);
}

function publish() {
  const d = getDraft();
  if (!d) return;
  if (!d.snapshot) {
    alert("This draft has no frozen snapshot. Re-freeze before publishing.");
    return;
  }
  const reasons = draftStaleReasons(d);
  if (reasons.length) {
    alert("The draft snapshot is outdated. Re-freeze before publishing.");
    return;
  }
  const published = getPublished();
  const version = published && published.batchNo === d.batchNo ? published.version + 1 : 1;
  const batch = {
    ...d,
    version,
    status: "published",
    publishedAt: new Date().toISOString(),
  };
  publishBatch(batch);
  renderAll();
}

// ---------------------------------------------------------------- panel: batch
function renderBatchPanel() {
  const all = getAllLiveSeries();
  const draft = getDraft();
  const published = getPublished();
  const stale = published ? diffSnapshot(published.snapshot) : [];
  const dStale = draftStaleReasons(draft);

  let stateRow;
  if (published) {
    stateRow = `
      <span class="chip ${stale.length ? "stale" : "live"}">
        ${stale.length ? "Published · pending review" : "Published · live"}
      </span>
      <strong>${escapeHtml(published.batchNo)}</strong> v${published.version}
      <span class="pick-sub">published ${formatDate(published.publishedAt)}</span>`;
  } else if (draft) {
    stateRow = `
      <span class="chip draft">Unpublished draft</span>
      <strong>${escapeHtml(draft.batchNo)}</strong> v${draft.version}
      <span class="pick-sub">frozen ${formatDate(draft.frozenAt)}</span>`;
  } else {
    stateRow = `<span class="chip draft">No batch yet</span>
      <span class="pick-sub">Pick series below to create the first publish batch.</span>`;
  }

  const selected = draft
    ? draft.pickedSeriesIds
    : published
    ? published.pickedSeriesIds
    : [];
  const frozen = !!draft; // picking is only free until the batch is published

  let staleNotice = "";
  if (stale.length) {
    staleNotice = `
      <div class="note-inline">
        <strong>Published batch needs review.</strong>
        ${escapeHtml(stale.map((s) => s.title).join(", "))} changed after publishing
        (cover, order or captions). The public pages still show the frozen version,
        flagged “pending review”. Start a draft and publish a new version to refresh them.
      </div>`;
  }
  if (draft && dStale.length) {
    staleNotice += `
      <div class="note-inline">
        <strong>Draft snapshot is outdated.</strong>
        ${escapeHtml(dStale.map((s) => s.title).join(", "))} changed since freezing.
        Re-freeze before publishing.
      </div>`;
  }

  const rows = all
    .map((s) => {
      const cover = s.photos.find((p) => p.id === s.coverPhotoId) || s.photos[0];
      const checked = selected.includes(s.id) ? "checked" : "";
      const disabled = frozen ? "disabled" : "";
      return `
        <label class="series-pick">
          <input type="checkbox" data-pick="${s.id}" ${checked} ${disabled}/>
          <span>
            <span class="pick-title">${escapeHtml(s.title)}</span><br/>
            <span class="pick-sub">${escapeHtml(s.category)} · ${s.photos.length} photos · cover “${escapeHtml(
        cover.title
      )}”</span>
          </span>
          <img src="/mock-data/${escapeHtml(cover.file)}" alt="${escapeHtml(cover.altText)}" loading="lazy"/>
        </label>`;
    })
    .join("");

  let actions;
  if (!draft) {
    actions = `
      <button class="btn" type="button" data-action="freeze">Freeze selected into new batch</button>
      <span class="pick-sub">Cover, order and captions are snapshotted now.</span>`;
  } else {
    actions = `
      <button class="btn" type="button" data-action="publish" ${
        dStale.length || !draft.snapshot ? "disabled" : ""
      }>Publish ${escapeHtml(draft.batchNo)} v${draft.version}</button>
      <button class="btn ghost" type="button" data-action="refreeze">Re-freeze snapshot</button>
      <button class="btn ghost danger" type="button" data-action="discard">Discard draft &amp; re-pick</button>`;
  }

  if (published && !draft) {
    actions += `
      <button class="btn ghost" type="button" data-action="revise">Start revision draft</button>`;
  }

  els.batchPanel.innerHTML = `
    <div class="panel-card">
      <h3>Publish batch</h3>
      <div class="batch-state">${stateRow}</div>
      ${staleNotice}
      <div data-pick-list>${rows}</div>
      <div class="console-actions">${actions}</div>
    </div>
    ${renderFrozenSummary(draft)}`;

  // events
  els.batchPanel.querySelector("[data-action='freeze']")?.addEventListener("click", () => {
    const picked = [...els.batchPanel.querySelectorAll("[data-pick]:checked")].map(
      (cb) => cb.dataset.pick
    );
    if (!picked.length) {
      alert("Select at least one series for the batch.");
      return;
    }
    createDraft(picked);
    renderAll();
  });

  els.batchPanel.querySelector("[data-action='refreeze']")?.addEventListener("click", () => {
    refreezeDraft();
    renderAll();
  });

  els.batchPanel.querySelector("[data-action='discard']")?.addEventListener("click", () => {
    if (confirm("Discard the unpublished draft? You can re-pick the series afterwards.")) {
      clearDraft();
      renderAll();
    }
  });

  els.batchPanel.querySelector("[data-action='publish']")?.addEventListener("click", publish);

  els.batchPanel.querySelector("[data-action='revise']")?.addEventListener("click", () => {
    // A revision starts pre-picked with the currently published series,
    // same batch number, version bumped on publish.
    const p = getPublished();
    const snapshot = freezeSnapshot(p.pickedSeriesIds.map((id) => getLiveSeries(id)).filter(Boolean));
    saveDraft({
      batchNo: p.batchNo,
      version: p.version, // bumped to p.version + 1 at publish time
      status: "draft",
      pickedSeriesIds: p.pickedSeriesIds,
      createdAt: new Date().toISOString(),
      frozenAt: snapshot.frozenAt,
      sourceHash: batchSourceHash(snapshot),
      snapshot,
    });
    renderAll();
  });
}

function renderFrozenSummary(draft) {
  if (!draft) return "";
  if (!draft.snapshot) {
    return `
      <div class="panel-card">
        <h3>Frozen snapshot</h3>
        <div class="note-inline">
          This draft (an upgraded legacy draft) has no frozen snapshot yet.
          Re-freeze the current cover, order and captions before publishing.
        </div>
      </div>`;
  }
  return `
    <div class="panel-card">
      <h3>Frozen snapshot</h3>
      <p class="pick-sub">Frozen at ${formatDate(draft.frozenAt)} · source hash ${escapeHtml(
    draft.sourceHash
  )}</p>
      ${draft.snapshot.series
        .map((s) => {
          const cover = s.photos.find((p) => p.id === s.coverPhotoId) || s.photos[0];
          return `
          <div class="series-pick">
            <img src="/mock-data/${escapeHtml(cover.file)}" alt="${escapeHtml(cover.altText)}" loading="lazy"/>
            <span>
              <span class="pick-title">${escapeHtml(s.title)}</span><br/>
              <span class="pick-sub">${s.photos.length} photos · frozen order &amp; captions · fp ${escapeHtml(
            s.fingerprint
          )}</span>
            </span>
            <span class="chip draft">frozen</span>
          </div>`;
        })
        .join("")}
    </div>`;
}

// ---------------------------------------------------------------- panel: content
function renderContentPanel() {
  const all = getAllLiveSeries();
  els.contentPanel.innerHTML = `
    <div class="panel-card">
      <h3>Source adjustments</h3>
      <p class="pick-sub">
        Cover, order and captions are still adjustable here. Changing any of them
        invalidates the frozen/draft snapshot and marks a published batch pending review.
      </p>
      ${all
        .map((s) => {
          const cover = s.photos.find((p) => p.id === s.coverPhotoId) || s.photos[0];
          return `
          <div class="series-pick" style="display:block">
            <div style="display:flex;gap:16px;align-items:center">
              <img src="/mock-data/${escapeHtml(cover.file)}" alt="${escapeHtml(
            cover.altText
          )}" loading="lazy"/>
              <div style="flex:1">
                <span class="pick-title">${escapeHtml(s.title)}</span><br/>
                <span class="pick-sub">${s.photos.length} photos · current cover “${escapeHtml(
            cover.title
          )}”</span>
              </div>
              <button class="btn small ghost" type="button" data-edit-series="${s.id}">
                Adjust cover / order / captions
              </button>
            </div>
            <div data-editor="${s.id}" style="display:none;margin-top:18px"></div>
          </div>`;
        })
        .join("")}
    </div>`;

  els.contentPanel.querySelectorAll("[data-edit-series]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.editSeries;
      const slot = els.contentPanel.querySelector(`[data-editor="${id}"]`);
      const open = slot.style.display !== "none";
      slot.style.display = open ? "none" : "block";
      btn.textContent = open ? "Adjust cover / order / captions" : "Close adjustments";
      if (!open) renderSeriesEditor(id, slot);
    });
  });
}

function renderSeriesEditor(seriesId, slot) {
  const s = getLiveSeries(seriesId);

  function draw() {
    const live = getLiveSeries(seriesId);
    slot.innerHTML = `
      <div class="thumb-row">
        ${live.photos
          .map((p, i) => {
            const isCover = p.id === live.coverPhotoId;
            return `
            <div class="thumb ${isCover ? "is-cover" : ""}">
              <div data-set-cover="${p.id}" title="Use as cover">
                ${frameHtml(p)}
                ${isCover ? '<span class="cover-mark">Cover</span>' : ""}
              </div>
              <span class="thumb-order">#${i + 1} ${escapeHtml(p.title)}</span>
              <div class="order-controls">
                <button type="button" data-move="${p.id}" data-dir="up" ${
              i === 0 ? "disabled" : ""
            }>↑</button>
                <button type="button" data-move="${p.id}" data-dir="down" ${
              i === live.photos.length - 1 ? "disabled" : ""
            }>↓</button>
              </div>
              <textarea class="edit-caption" rows="2" data-caption="${p.id}">${escapeHtml(
              p.caption
            )}</textarea>
            </div>`;
          })
          .join("")}
      </div>
      <div class="console-actions">
        <button class="btn ghost small" type="button" data-reset="${seriesId}">
          Reset to original order &amp; captions
        </button>
      </div>`;
    hydrateFrames(slot);

    slot.querySelectorAll("[data-set-cover]").forEach((node) => {
      node.style.cursor = "pointer";
      node.addEventListener("click", () => {
        saveOverride(seriesId, { coverPhotoId: node.dataset.setCover });
        afterChange();
      });
    });

    slot.querySelectorAll("[data-move]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const order = getLiveSeries(seriesId).photos.map((p) => p.id);
        const i = order.indexOf(btn.dataset.move);
        const j = btn.dataset.dir === "up" ? i - 1 : i + 1;
        if (j < 0 || j >= order.length) return;
        [order[i], order[j]] = [order[j], order[i]];
        saveOverride(seriesId, { photoOrder: order });
        afterChange();
      });
    });

    slot.querySelectorAll("[data-caption]").forEach((ta) => {
      ta.addEventListener("change", () => {
        const cur = getLiveSeries(seriesId);
        const captions = {};
        cur.photos.forEach((p) => (captions[p.id] = p.caption));
        captions[ta.dataset.caption] = ta.value;
        saveOverride(seriesId, { captions });
        afterChange();
      });
    });

    slot.querySelector(`[data-reset="${seriesId}"]`).addEventListener("click", () => {
      resetOverrides(seriesId);
      afterChange();
    });
  }

  // Any change here invalidates frozen snapshots — surface that immediately.
  function afterChange() {
    const d = getDraft();
    if (d) {
      // Draft stays but is stale until re-frozen; its stored snapshot is now invalid.
      const reasons = diffSnapshot(d.snapshot);
      if (reasons.length) {
        // no mutation of snapshot; batch panel will show the warning
      }
    }
    draw();
    renderBatchStateBadge();
  }

  draw();
}

// ---------------------------------------------------------------- panel: history
function renderHistoryPanel() {
  const published = getPublished();
  const history = getHistory();

  els.historyPanel.innerHTML = `
    <div class="panel-card">
      <h3>Published batches</h3>
      ${
        history.length
          ? `<table class="history-table">
              <thead><tr><th>Batch</th><th>Version</th><th>Published</th><th>Series</th><th>State</th></tr></thead>
              <tbody>
                ${history
                  .map((h) => {
                    const isCurrent =
                      published && published.batchNo === h.batchNo && published.version === h.version;
                    const stale = isCurrent ? diffSnapshot(published.snapshot).length : 0;
                    return `<tr>
                      <td><strong>${escapeHtml(h.batchNo)}</strong></td>
                      <td>v${h.version}</td>
                      <td>${formatDate(h.publishedAt)}</td>
                      <td>${h.seriesCount}</td>
                      <td>${
                        isCurrent
                          ? `<span class="chip ${stale ? "stale" : "live"}">${
                              stale ? "pending review" : "live"
                            }</span>`
                          : '<span class="chip">archived</span>'
                      }</td>
                    </tr>`;
                  })
                  .join("")}
              </tbody>
            </table>`
          : "<p class='pick-sub'>Nothing published yet.</p>"
      }
    </div>
    <div class="panel-card">
      <h3>Storage diagnostics</h3>
      <div class="toggle-row" style="margin-bottom:12px">
        <input type="checkbox" id="fault-toggle"/>
        <label for="fault-toggle">Simulate storage write failure</label>
      </div>
      <p class="pick-sub">
        With the toggle on, saves are forced to fail. Drafts are retained in memory
        and an automatic retry runs every few seconds; turn the toggle off (or hit
        retry) to flush the queue.
      </p>
      <div class="console-actions">
        <button class="btn ghost small" type="button" data-action="retry">Retry saving now</button>
        <span class="save-state" data-save-state></span>
      </div>
      <div class="console-actions">
        <button class="btn ghost small danger" type="button" data-action="seed-legacy">
          Seed legacy unnumbered draft (demo)
        </button>
        <button class="btn ghost small danger" type="button" data-action="wipe">
          Wipe all local batches
        </button>
      </div>
    </div>`;

  $("#fault-toggle").checked = isFaulting();
  $("#fault-toggle").addEventListener("change", (e) => setFault(e.target.checked));
  $('[data-action="retry"]').addEventListener("click", () => {
    retryNow();
    renderSaveStatus();
  });

  $('[data-action="seed-legacy"]').addEventListener("click", () => {
    // Reproduces an old-schema draft (no batch number) then reloads:
    // initStore upgrades it to the first version.
    localStorage.setItem(
      "qf.publishDraft",
      JSON.stringify({
        seriesIds: ["gaze"],
        createdAt: new Date().toISOString(),
      })
    );
    location.reload();
  });

  $('[data-action="wipe"]').addEventListener("click", () => {
    if (!confirm("Remove drafts, published batches and overrides from this browser?")) return;
    [
      "qf.sourceOverrides",
      "qf.draft",
      "qf.published",
      "qf.history",
      "qf.publishDraft",
      "qf.selection",
    ].forEach((k) => localStorage.removeItem(k));
    location.reload();
  });

  renderSaveStatus();
}

// ---------------------------------------------------------------- chrome
function renderSaveStatus() {
  const node = $("[data-save-state]");
  if (!node) return;
  const status = getSaveStatus();
  if (status.state === "error" || hasPendingWrites()) {
    node.className = "save-state err";
    node.textContent = "● write failed — draft kept, retrying…";
  } else {
    node.className = "save-state ok";
    node.textContent = "● all changes saved";
  }
}

function renderBatchStateBadge() {
  // lightweight refresh of the batch panel warnings
  if (panel === "batch") renderBatchPanel();
}

function renderAll() {
  renderBatchPanel();
  renderContentPanel();
  renderHistoryPanel();
}

// ---------------------------------------------------------------- boot
function showBootNotices() {
  const notices = takeBootNotices();
  if (!notices.length) return;
  const host = document.querySelector("[data-console-notices]");
  host.innerHTML = notices
    .map((m) => `<div class="form-alert success" style="display:block">${escapeHtml(m)}</div>`)
    .join("");
}

initTabs();
showBootNotices();
renderAll();

onSaveStatus((status) => {
  const node = document.querySelector("[data-save-state]");
  if (!node) return;
  if (status.state === "error") {
    node.className = "save-state err";
    node.textContent = hasPendingWrites()
      ? `● ${status.message}`
      : "● save failed";
  } else {
    node.className = "save-state ok";
    node.textContent = "● all changes saved";
  }
});
