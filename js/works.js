// works.js — Works page.
// Filters persist when leaving to a series and coming back (URL + sessionStorage).
// The lightbox only steps through the CURRENT filtered result set.

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

const FILTER_KEY = "qf.worksFilter";

function readFilter() {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("category");
  if (fromUrl != null) return fromUrl; // 'all' or a category id
  const fromSession = sessionStorage.getItem(FILTER_KEY);
  return fromSession || "all";
}

function persistFilter(category) {
  sessionStorage.setItem(FILTER_KEY, category);
  const url = new URL(location.href);
  if (category === "all") url.searchParams.delete("category");
  else url.searchParams.set("category", category);
  history.replaceState(null, "", url);
}

async function boot() {
  initStore();
  const data = await loadBaseData();
  const state = resolveSiteState();
  markActiveNav("works");
  mountReviewBanner(state);

  const chipSlot = document.querySelector("[data-batch-chip]");
  if (chipSlot) chipSlot.innerHTML = batchChip(state);

  let activeCategory = readFilter();
  // Guard against stale category ids from an older published/source state.
  const validIds = new Set(["all", ...data.categories.map((c) => c.id)]);
  if (!validIds.has(activeCategory)) activeCategory = "all";

  const filterBar = document.querySelector("[data-filters]");
  filterBar.innerHTML = ["all", ...data.categories.map((c) => c.id)]
    .map((id) => {
      const label = id === "all" ? "All" : data.categories.find((c) => c.id === id).label;
      return `<button class="filter-chip" type="button" data-category="${id}">${escapeHtml(label)}</button>`;
    })
    .join("");

  function allPhotos() {
    const rows = [];
    for (const s of state.series) {
      for (const p of s.photos) {
        rows.push({ photo: p, series: s });
      }
    }
    return rows;
  }

  function render() {
    persistFilter(activeCategory);
    filterBar.querySelectorAll(".filter-chip").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.category === activeCategory);
    });

    const rows = allPhotos().filter(
      ({ series }) => activeCategory === "all" || series.category === activeCategory
    );

    document.querySelector("[data-results-note]").textContent =
      activeCategory === "all"
        ? `${rows.length} photographs across ${state.series.length} series`
        : `${rows.length} photographs in ${
            data.categories.find((c) => c.id === activeCategory).label
          }`;

    const grid = document.querySelector("[data-works-grid]");
    grid.innerHTML = rows
      .map(
        ({ photo, series }, i) => `
        <button class="work-tile" type="button" data-index="${i}">
          ${frameHtml(photo)}
          <h3>${escapeHtml(photo.title)}</h3>
          <div class="tile-meta">${escapeHtml(series.title)} · ${escapeHtml(
          series.category
        )}</div>
        </button>`
      )
      .join("");
    hydrateFrames();

    // One lightbox per render, scoped strictly to the current result set.
    const lightbox = new Lightbox(rows.map((r) => r.photo));
    grid.querySelectorAll(".work-tile").forEach((tile) => {
      tile.addEventListener("click", () =>
        lightbox.open(Number(tile.dataset.index))
      );
    });
  }

  filterBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-chip");
    if (!btn) return;
    activeCategory = btn.dataset.category;
    render();
  });

  // Back/forward should restore the filter too.
  window.addEventListener("popstate", () => {
    activeCategory = readFilter();
    if (!validIds.has(activeCategory)) activeCategory = "all";
    render();
  });

  render();
}

boot().catch((e) => {
  document.querySelector("main").insertAdjacentHTML(
    "afterbegin",
    `<div class="review-banner"><div class="container">${escapeHtml(e.message)}</div></div>`
  );
});
