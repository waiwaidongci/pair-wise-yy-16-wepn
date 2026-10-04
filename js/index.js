// index.js — Home
import { initStore } from "./store.js";
import { loadBaseData, resolveSiteState } from "./data.js";
import {
  frameHtml,
  hydrateFrames,
  markActiveNav,
  mountReviewBanner,
  batchChip,
  escapeHtml,
} from "./ui.js";

async function boot() {
  initStore();
  await loadBaseData();
  const state = resolveSiteState();
  markActiveNav("home");
  mountReviewBanner(state);

  const totalPhotos = state.series.reduce((n, s) => n + s.photos.length, 0);
  document.querySelector("[data-total-series]").textContent = state.series.length;
  document.querySelector("[data-total-photos]").textContent = totalPhotos;

  const chipSlot = document.querySelector("[data-batch-chip]");
  if (chipSlot) chipSlot.innerHTML = batchChip(state);

  const grid = document.querySelector("[data-series-grid]");
  grid.innerHTML = state.series
    .map((s) => {
      const cover = s.photos.find((p) => p.id === s.coverPhotoId) || s.photos[0];
      return `
        <a class="series-card" href="/series.html?id=${encodeURIComponent(s.id)}">
          ${frameHtml(cover)}
          <div class="cat">${escapeHtml(s.category)}</div>
          <h3>${escapeHtml(s.title)}</h3>
          <p>${escapeHtml(s.summary)}</p>
          <span class="more">View series</span>
        </a>`;
    })
    .join("");
  hydrateFrames();
}

boot().catch((e) => {
  document.querySelector("main").insertAdjacentHTML(
    "afterbegin",
    `<div class="review-banner"><div class="container">${escapeHtml(e.message)}</div></div>`
  );
});
