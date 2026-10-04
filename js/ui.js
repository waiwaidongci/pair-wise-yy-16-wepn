// ui.js — shared rendering helpers, review banner and the shared lightbox.

import { photoUrl, getCategoryLabel } from "./data.js";

export function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Reserve space using the photo's ORIGINAL aspect ratio before the image loads.
export function frameHtml(photo, opts = {}) {
  const ratioPct =
    photo.width && photo.height ? (photo.height / photo.width) * 100 : 66.7;
  const loading = opts.eager ? "eager" : "lazy";
  const fetchPriority = opts.eager ? 'fetchpriority="high"' : "";
  return `
    <div class="frame">
      <span class="frame-ratio" style="padding-top:${ratioPct.toFixed(4)}%"></span>
      <div class="frame-inner">
        <img
          src="${escapeHtml(photoUrl(photo.file))}"
          alt="${escapeHtml(photo.altText || photo.title || "")}"
          loading="${loading}"
          ${fetchPriority}
        />
      </div>
    </div>`;
}

export function hydrateFrames(root = document) {
  root.querySelectorAll(".frame img").forEach((img) => {
    if (img.complete && img.naturalWidth) img.classList.add("loaded");
    else img.addEventListener("load", () => img.classList.add("loaded"), { once: true });
  });
}

export function markActiveNav(key) {
  document.querySelectorAll(".site-nav a[data-nav]").forEach((a) => {
    a.classList.toggle("active", a.dataset.nav === key);
  });
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---- review banner shown on public pages when published content is stale ----
export function mountReviewBanner(siteState) {
  if (siteState.mode !== "stale") return;
  const names = siteState.staleSeries.map((s) => s.title).join(", ");
  const banner = document.createElement("div");
  banner.className = "review-banner";
  banner.innerHTML = `
    <div class="container">
      <div>
        <strong>PENDING REVIEW · Batch ${escapeHtml(siteState.batch.batchNo)} v${siteState.batch.version}</strong><br/>
        The published content below is still viewable. Source changed after freezing
        (${escapeHtml(names)}), so this batch is outdated — re-freeze and publish from the
        <a href="/console.html">publish console</a>.
      </div>
      <a class="btn small" href="/console.html">Review now</a>
    </div>`;
  const header = document.querySelector(".site-header");
  header.insertAdjacentElement("afterend", banner);
}

export function batchChip(siteState) {
  if (!siteState.batch) return "";
  const cls = siteState.mode === "stale" ? "stale" : "live";
  const label =
    siteState.mode === "stale"
      ? `Published · ${siteState.batch.batchNo} v${siteState.batch.version} · pending review`
      : `Published · ${siteState.batch.batchNo} v${siteState.batch.version}`;
  return `<span class="chip ${cls}">${escapeHtml(label)}</span>`;
}

// ---- shared lightbox: moves only inside the list handed to it ----
export class Lightbox {
  constructor(photos) {
    this.photos = photos; // current result set — no leakage to other sets
    this.index = 0;
    this.el = null;
    this._onKey = (e) => {
      if (e.key === "Escape") this.close();
      else if (e.key === "ArrowRight") this.next();
      else if (e.key === "ArrowLeft") this.prev();
    };
  }

  open(index) {
    this.index = index;
    if (!this.el) this._build();
    document.body.appendChild(this.el);
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", this._onKey);
    this.el.classList.add("open");
    this.render();
  }

  close() {
    if (!this.el) return;
    this.el.classList.remove("open");
    document.body.style.overflow = "";
    document.removeEventListener("keydown", this._onKey);
    this.el.remove();
    this.el = null;
  }

  next() { if (this.index < this.photos.length - 1) { this.index++; this.render(); } }
  prev() { if (this.index > 0) { this.index--; this.render(); } }

  _build() {
    this.el = document.createElement("div");
    this.el.className = "lightbox";
    this.el.setAttribute("role", "dialog");
    this.el.setAttribute("aria-modal", "true");
    this.el.innerHTML = `
      <div class="lightbox-bar">
        <div>
          <div class="lb-title"></div>
          <div class="lb-counter"></div>
        </div>
        <button class="lb-btn lb-close" type="button">Close ✕</button>
      </div>
      <div class="lightbox-stage">
        <button class="lb-nav lb-prev" type="button" aria-label="Previous photo">‹</button>
        <figure class="lightbox-figure">
          <div class="lb-frame-slot"></div>
          <figcaption class="lb-caption"></figcaption>
          <div class="lb-alt"></div>
        </figure>
        <button class="lb-nav lb-next" type="button" aria-label="Next photo">›</button>
      </div>`;
    this.el.addEventListener("click", (e) => {
      if (e.target === this.el) this.close();
    });
    this.el.querySelector(".lb-close").addEventListener("click", () => this.close());
    this.el.querySelector(".lb-prev").addEventListener("click", () => this.prev());
    this.el.querySelector(".lb-next").addEventListener("click", () => this.next());
  }

  render() {
    const p = this.photos[this.index];
    const slot = this.el.querySelector(".lb-frame-slot");
    slot.innerHTML = frameHtml(p);
    hydrateFrames(this.el);
    this.el.querySelector(".lb-title").textContent = p.title || "";
    this.el.querySelector(".lb-counter").textContent =
      `${this.index + 1} / ${this.photos.length}`;
    this.el.querySelector(".lb-caption").textContent = p.caption || "";
    this.el.querySelector(".lb-alt").textContent = p.altText || "";
    this.el.querySelector(".lb-prev").disabled = this.index === 0;
    this.el.querySelector(".lb-next").disabled = this.index === this.photos.length - 1;
  }
}
