// about.js — About page.

import { initStore } from "./store.js";
import { loadBaseData, resolveSiteState } from "./data.js";
import { markActiveNav, batchChip, escapeHtml } from "./ui.js";

async function boot() {
  initStore();
  await loadBaseData();
  const state = resolveSiteState();
  markActiveNav("about");

  const chipSlot = document.querySelector("[data-batch-chip]");
  if (chipSlot) chipSlot.innerHTML = batchChip(state);

  document.querySelector("[data-series-names]").textContent = state.series
    .map((s) => s.title)
    .join(", ");
  const totalPhotos = state.series.reduce((n, s) => n + s.photos.length, 0);
  document.querySelector("[data-photo-count]").textContent = totalPhotos;
}

boot().catch((e) => {
  const main = document.querySelector("main");
  if (main) {
    main.insertAdjacentHTML(
      "afterbegin",
      `<div class="review-banner"><div class="container">${escapeHtml(e.message)}</div></div>`
    );
  }
});
