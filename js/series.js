// series.js — Series listing and series detail (?id=...).

import { initStore } from "./store.js";
import { loadBaseData, resolveSiteState } from "./data.js";
import {
  frameHtml,
  hydrateFrames,
  markActiveNav,
  mountReviewBanner,
  batchChip,
  escapeHtml,
  Lightbox,
} from "./ui.js";

async function boot() {
  initStore();
  await loadBaseData();
  const state = resolveSiteState();
  markActiveNav("series");
  mountReviewBanner(state);

  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  if (id) renderDetail(state, id);
  else renderListing(state);
}

function renderListing(state) {
  const chipSlot = document.querySelector("[data-batch-chip]");
  if (chipSlot) chipSlot.innerHTML = batchChip(state);

  document.title = "Series — Quiet Frames";
  document.querySelector("[data-page-title]").textContent = "Series";
  document.querySelector("[data-page-lede]").textContent =
    "Three bodies of work, each frozen into a publish batch once cover, order and captions settle.";

  const grid = document.querySelector("[data-series-grid]");
  grid.innerHTML = state.series
    .map((s) => {
      const cover = s.photos.find((p) => p.id === s.coverPhotoId) || s.photos[0];
      return `
        <a class="series-card" href="/series.html?id=${encodeURIComponent(s.id)}">
          ${frameHtml(cover)}
          <div class="cat">${escapeHtml(s.category)} · ${s.photos.length} photos</div>
          <h3>${escapeHtml(s.title)}</h3>
          <p>${escapeHtml(s.summary)}</p>
          <span class="more">Open series</span>
        </a>`;
    })
    .join("");
  hydrateFrames();
}

function renderDetail(state, id) {
  const series = state.series.find((s) => s.id === id);
  const main = document.querySelector("main");

  if (!series) {
    document.title = "Series not found — Quiet Frames";
    main.innerHTML = `
      <div class="section"><div class="container">
        <p class="eyebrow">404</p>
        <h1>Series not found</h1>
        <p><a href="/series.html">← Back to all series</a></p>
      </div></div>`;
    return;
  }

  document.title = `${series.title} — Quiet Frames`;
  const isStale = state.mode === "stale" &&
    state.staleSeries.some((x) => x.id === series.id);

  main.innerHTML = `
    <section class="series-hero">
      <div class="container">
        <nav class="breadcrumb">
          <a href="/series.html">Series</a> / ${escapeHtml(series.title)}
        </nav>
        <div class="batch-state">
          <span class="chip">${escapeHtml(series.category)}</span>
          ${isStale ? `<span class="chip stale">Pending review</span>` : ""}
          ${state.batch ? batchChip(state) : ""}
        </div>
        <h1>${escapeHtml(series.title)}</h1>
        <p class="pull-quote">“${escapeHtml(series.summary)}”</p>
        <div class="series-meta">
          <span>${series.photos.length} photographs</span>
          <span>Batch ${escapeHtml(state.batch ? state.batch.batchNo : "unpublished")}</span>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="photo-flow" data-photo-flow></div>
        <p style="margin-top:52px"><a class="btn ghost" href="/series.html">← All series</a></p>
      </div>
    </section>`;

  const flow = main.querySelector("[data-photo-flow]");
  flow.innerHTML = series.photos
    .map(
      (p, i) => `
      <div class="photo-row">
        <button class="work-tile" type="button" data-index="${i}">
          ${frameHtml(p, { eager: i === 0 })}
        </button>
        <div class="photo-caption">
          <span class="index">${String(i + 1).padStart(2, "0")}</span>
          <h3>${escapeHtml(p.title)}</h3>
          <p>${escapeHtml(p.caption)}</p>
        </div>
      </div>`
    )
    .join("");
  hydrateFrames();

  // Lightbox steps only through THIS series' ordered photos.
  const lightbox = new Lightbox(series.photos);
  flow.querySelectorAll(".work-tile").forEach((tile) => {
    tile.addEventListener("click", () => lightbox.open(Number(tile.dataset.index)));
  });
}

boot().catch((e) => {
  document.querySelector("main").insertAdjacentHTML(
    "afterbegin",
    `<div class="review-banner"><div class="container">${escapeHtml(e.message)}</div></div>`
  );
});
