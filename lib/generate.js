// lib/generate.js
//
// Static site generator. Produces dist/ from content + batches.
// All pages live at the dist root, so asset paths are relative (no leading
// slash) and work both served and opened directly.

'use strict';

const fs = require('fs');
const path = require('path');
const store = require('./store');

const DIST_DIR = path.join(store.ROOT, 'dist');
const FONTS_SRC = path.join(store.ROOT, 'assets', 'fonts');
const FONTS_DIST = path.join(DIST_DIR, 'fonts');
const PHOTOS_SRC = path.join(store.ROOT, 'mock-data', 'photos');
const PHOTOS_DIST = path.join(DIST_DIR, 'photos');
const STYLES_SRC = path.join(store.ROOT, 'src', 'styles');
const STYLES_DIST = path.join(DIST_DIR, 'styles');
const SCRIPTS_SRC = path.join(store.ROOT, 'src', 'scripts');
const SCRIPTS_DIST = path.join(DIST_DIR, 'scripts');

const SITE = {
  name: '镜头之间',
  nameEn: 'Between Frames',
  tagline: '摄影作品集 · Photography Portfolio',
  artist: '林一',
  artistEn: 'Lin Yi',
  email: 'hello@betweenframes.studio',
  location: '云南 · 大理',
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function categoryLabel(content, id) {
  const cat = content.categories.find((c) => c.id === id);
  return cat ? cat.label : id;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { href: 'index.html', label: '首页', key: 'home' },
  { href: 'works.html', label: '作品', key: 'works' },
  { href: 'series.html', label: '系列', key: 'series' },
  { href: 'about.html', label: '关于', key: 'about' },
  { href: 'contact.html', label: '联系', key: 'contact' },
];

function layout({ title, pageKey, body, bodyClass = '', extraHead = '' }) {
  const navLinks = NAV_ITEMS.map((item) => {
    const active = item.key === pageKey ? ' class="is-active"' : '';
    return `<a href="${item.href}"${active}>${item.label}</a>`;
  }).join('\n      ');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} · ${SITE.name}</title>
  <link rel="stylesheet" href="styles/main.css">
  ${extraHead}
</head>
<body class="${bodyClass}">
  <header class="site-header">
    <div class="site-header__inner">
      <a class="site-brand" href="index.html">
        <span class="site-brand__mark"></span>
        <span class="site-brand__text">${SITE.name}<em>${SITE.nameEn}</em></span>
      </a>
      <nav class="site-nav" aria-label="主导航">
      ${navLinks}
      </nav>
      <button class="nav-toggle" type="button" aria-label="打开菜单" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>

  <main class="site-main">
${body}
  </main>

  <footer class="site-footer">
    <div class="site-footer__inner">
      <div class="site-footer__brand">
        <strong>${SITE.name}</strong>
        <span>${SITE.tagline}</span>
      </div>
      <div class="site-footer__meta">
        <span>© ${new Date().getFullYear()} ${SITE.artistEn}</span>
        <a href="publish.html">发布管理</a>
      </div>
    </div>
  </footer>

  <div class="lightbox" id="lightbox" hidden>
    <button class="lightbox__close" type="button" aria-label="关闭">×</button>
    <button class="lightbox__nav lightbox__nav--prev" type="button" aria-label="上一张">‹</button>
    <figure class="lightbox__figure">
      <img class="lightbox__img" alt="">
      <figcaption class="lightbox__caption">
        <span class="lightbox__title"></span>
        <span class="lightbox__text"></span>
        <span class="lightbox__counter"></span>
      </figcaption>
    </figure>
    <button class="lightbox__nav lightbox__nav--next" type="button" aria-label="下一张">›</button>
  </div>

  <script src="scripts/lightbox.js"></script>
  <script src="scripts/filters.js"></script>
  <script src="scripts/form.js"></script>
  <script src="scripts/publish.js"></script>
  <script src="scripts/site.js"></script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

/**
 * A single photo figure. Uses the source width/height to reserve the original
 * aspect ratio before the image loads (no layout shift).
 */
function photoFigure(photo, { loading = 'lazy', index = 0 } = {}) {
  const ratio = photo.width && photo.height ? `${photo.width} / ${photo.height}` : '4 / 3';
  return `<figure class="photo" data-photo-id="${escapeHtml(photo.id)}" data-series-id="${escapeHtml(photo.seriesId)}" data-category="${escapeHtml(photo.category)}" style="--photo-ratio: ${ratio}">
    <div class="photo__frame">
      <img class="photo__img" src="${escapeHtml(photo.file)}" alt="${escapeHtml(photo.altText)}" loading="${loading}" width="${photo.width}" height="${photo.height}">
    </div>
    <figcaption class="photo__caption">
      <span class="photo__title">${escapeHtml(photo.title)}</span>
      <span class="photo__text">${escapeHtml(photo.caption)}</span>
    </figcaption>
  </figure>`;
}

function seriesCard(content, series, batch) {
  const coverPhoto = batch
    ? content.photosById.get(batch.frozen.cover)
    : content.photos.find((p) => p.seriesId === series.id && p.order === 1) ||
      content.photos.find((p) => p.seriesId === series.id);
  const count = batch ? batch.frozen.order.length : series.photoIds.length;
  const statusBadge = batch && batch.status === 'stale'
    ? '<span class="badge badge--stale">待复核</span>'
    : batch && batch.status === 'published'
      ? '<span class="badge badge--published">已发布</span>'
      : '';
  return `<a class="series-card" href="series-${escapeHtml(series.id)}.html">
    <div class="series-card__cover" style="--photo-ratio: ${coverPhoto.width} / ${coverPhoto.height}">
      <img src="${escapeHtml(coverPhoto.file)}" alt="${escapeHtml(coverPhoto.altText)}" loading="lazy" width="${coverPhoto.width}" height="${coverPhoto.height}">
      ${statusBadge}
    </div>
    <div class="series-card__body">
      <span class="series-card__category">${escapeHtml(categoryLabel(content, series.category))}</span>
      <h3 class="series-card__title">${escapeHtml(series.title)}</h3>
      <p class="series-card__summary">${escapeHtml(series.summary)}</p>
      <span class="series-card__count">${count} 张</span>
    </div>
  </a>`;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function renderHome(content, doc) {
  const publishedSeries = content.series
    .map((s) => ({ series: s, batch: store.getPublishedBatch(doc, s.id) }))
    .filter((x) => x.batch);
  const featured = publishedSeries[0];
  const recentPhotos = content.photos.slice(0, 6);

  const featuredBlock = featured
    ? `<section class="home-featured">
        <a class="home-featured__cover" href="series-${escapeHtml(featured.series.id)}.html">
          ${photoFigure(content.photosById.get(featured.batch.frozen.cover), { loading: 'eager' })}
        </a>
        <div class="home-featured__text">
          <span class="eyebrow">精选系列</span>
          <h2>${escapeHtml(featured.series.title)}</h2>
          <p>${escapeHtml(featured.series.summary)}</p>
          <span class="link-arrow">查看系列</span>
        </div>
      </section>`
    : `<section class="home-featured home-featured--empty">
        <div class="home-featured__text">
          <span class="eyebrow">精选系列</span>
          <h2>尚未发布</h2>
          <p>前往发布管理选择并冻结一个系列，生成公开站点内容。</p>
          <a class="link-arrow" href="publish.html">前往发布管理</a>
        </div>
      </section>`;

  const seriesPreview = content.series
    .map((s) => seriesCard(content, s, store.getPublishedBatch(doc, s.id)))
    .join('\n      ');

  const body = `
  <section class="hero">
    <div class="hero__inner">
      <span class="eyebrow">${SITE.tagline}</span>
      <h1 class="hero__title">用镜头<br>留住<span class="hero__italic">转瞬</span>的光</h1>
      <p class="hero__lede">这里是 ${SITE.artist} 的摄影作品集，收录肖像、风光与牧野三个系列。所有照片均按原始宽高占位，点击可在灯箱中沿当前序列浏览。</p>
      <div class="hero__actions">
        <a class="btn btn--primary" href="works.html">浏览作品</a>
        <a class="btn btn--ghost" href="series.html">查看系列</a>
      </div>
    </div>
  </section>

  ${featuredBlock}

  <section class="home-section">
    <div class="section-head">
      <h2>系列</h2>
      <a class="link-arrow" href="series.html">全部系列</a>
    </div>
    <div class="series-grid">
      ${seriesPreview}
    </div>
  </section>

  <section class="home-section">
    <div class="section-head">
      <h2>最新作品</h2>
      <a class="link-arrow" href="works.html">进入作品页</a>
    </div>
    <div class="photo-grid photo-grid--home">
      ${recentPhotos.map((p) => photoFigure(p)).join('\n      ')}
    </div>
  </section>

  <section class="home-about">
    <div class="home-about__inner">
      <h2>关于摄影师</h2>
      <p>${SITE.artist}，自由摄影师，常驻${SITE.location}。作品聚焦人物肖像与自然地貌，曾在多个独立摄影展展出。</p>
      <a class="btn btn--ghost" href="about.html">了解更多</a>
    </div>
  </section>`;

  return layout({ title: '首页', pageKey: 'home', body });
}

function renderWorks(content, doc) {
  const categories = content.categories
    .map((c) => `<button class="filter-chip" type="button" data-filter="category" data-value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</button>`)
    .join('\n        ');
  const seriesOptions = content.series
    .map((s) => `<button class="filter-chip" type="button" data-filter="series" data-value="${escapeHtml(s.id)}">${escapeHtml(s.title)}</button>`)
    .join('\n        ');

  const figures = content.photos.map((p) => photoFigure(p)).join('\n      ');

  const body = `
  <section class="page-head">
    <span class="eyebrow">作品</span>
    <h1>全部作品</h1>
    <p>使用下方筛选按类别或系列浏览。筛选状态会在你前往系列页再返回时保留。点击任意照片打开灯箱，灯箱只沿当前筛选结果切换。</p>
  </section>

  <section class="filters" id="filters" aria-label="作品筛选">
    <div class="filters__group">
      <span class="filters__label">类别</span>
      <div class="filters__chips" data-group="category">
        <button class="filter-chip filter-chip--active" type="button" data-filter="category" data-value="all">全部</button>
        ${categories}
      </div>
    </div>
    <div class="filters__group">
      <span class="filters__label">系列</span>
      <div class="filters__chips" data-group="series">
        <button class="filter-chip filter-chip--active" type="button" data-filter="series" data-value="all">全部</button>
        ${seriesOptions}
      </div>
    </div>
    <div class="filters__status" id="filter-status" aria-live="polite"></div>
  </section>

  <section class="works-grid-wrap">
    <div class="photo-grid photo-grid--works" id="works-grid">
      ${figures}
    </div>
    <div class="works-empty" id="works-empty" hidden>
      <p>当前筛选下没有作品。</p>
      <button class="btn btn--ghost" type="button" id="works-reset">重置筛选</button>
    </div>
  </section>`;

  return layout({ title: '作品', pageKey: 'works', body });
}

function renderSeriesList(content, doc) {
  const cards = content.series
    .map((s) => seriesCard(content, s, store.getPublishedBatch(doc, s.id)))
    .join('\n      ');

  const body = `
  <section class="page-head">
    <span class="eyebrow">系列</span>
    <h1>摄影系列</h1>
    <p>三个系列，三种观看方式。已发布的系列内容由发布批次冻结封面、顺序与说明；若源数据变更，批次会被标记为待复核。</p>
  </section>

  <section class="series-list">
    <div class="series-grid series-grid--list">
      ${cards}
    </div>
  </section>`;

  return layout({ title: '系列', pageKey: 'series', body });
}

function renderSeriesDetail(content, doc, series) {
  const batch = store.getPublishedBatch(doc, series.id);
  const orderedPhotos = batch
    ? batch.frozen.order.map((id) => content.photosById.get(id)).filter(Boolean)
    : series.photoIds.map((id) => content.photosById.get(id)).filter(Boolean);
  const coverPhoto = batch
    ? content.photosById.get(batch.frozen.cover)
    : orderedPhotos[0];

  const figures = orderedPhotos.map((p) => photoFigure(p)).join('\n        ');
  const pullQuote = series.summary;

  const statusNote = batch && batch.status === 'stale'
    ? `<div class="notice notice--warning" role="status">
        <strong>待复核</strong>
        <span>该系列的源数据（顺序或说明）已变更，当前展示的是已发布的冻结版本。请在发布管理中重新选择并发布。</span>
      </div>`
    : batch
      ? `<div class="notice notice--info" role="status">
          <strong>已发布</strong>
          <span>批次 v${batch.version} · 发布于 ${formatDate(batch.publishedAt)} · 封面、顺序与说明已冻结。</span>
        </div>`
      : `<div class="notice notice--info" role="status">
          <strong>预览</strong>
          <span>该系列尚未发布，以下为源数据实时内容。</span>
        </div>`;

  const body = `
  <section class="page-head page-head--series">
    <a class="back-link" href="series.html">← 返回系列</a>
    <span class="eyebrow">${escapeHtml(categoryLabel(content, series.category))}系列</span>
    <h1>${escapeHtml(series.title)}</h1>
    <blockquote class="pull-quote">${escapeHtml(pullQuote)}</blockquote>
    ${statusNote}
  </section>

  <section class="series-cover" style="--photo-ratio: ${coverPhoto.width} / ${coverPhoto.height}">
    <img src="${escapeHtml(coverPhoto.file)}" alt="${escapeHtml(coverPhoto.altText)}" width="${coverPhoto.width}" height="${coverPhoto.height}">
  </section>

  <section class="series-photos">
    <div class="photo-grid photo-grid--series" id="series-grid" data-series-id="${escapeHtml(series.id)}">
      ${figures}
    </div>
  </section>`;

  return layout({ title: series.title, pageKey: 'series', body });
}

function renderAbout(content, doc) {
  const body = `
  <section class="page-head">
    <span class="eyebrow">关于</span>
    <h1>关于摄影师</h1>
  </section>

  <section class="about">
    <div class="about__portrait" style="--photo-ratio: 4 / 5">
      <img src="${escapeHtml(content.photos.find((p) => p.category === 'portrait').file)}" alt="${escapeHtml(content.photos.find((p) => p.category === 'portrait').altText)}" width="${content.photos.find((p) => p.category === 'portrait').width}" height="${content.photos.find((p) => p.category === 'portrait').height}">
    </div>
    <div class="about__text">
      <h2>${SITE.artist} <em>${SITE.artistEn}</em></h2>
      <p>自由摄影师，常驻${SITE.location}。创作以肖像与自然地貌为主，关注镜头前的坦露与防备，以及纯粹地貌在四季光线下的变化。</p>
      <p>作品曾参与多个独立摄影展，并为品牌与出版物提供影像。个人项目长期进行中。</p>
      <div class="about__details">
        <div><span>驻地</span><strong>${SITE.location}</strong></div>
        <div><span>邮箱</span><strong>${SITE.email}</strong></div>
        <div><span>系列</span><strong>${content.series.length} 个</strong></div>
      </div>
    </div>
  </section>`;

  return layout({ title: '关于', pageKey: 'about', body });
}

function renderContact(content, doc) {
  const body = `
  <section class="page-head">
    <span class="eyebrow">联系</span>
    <h1>取得联系</h1>
    <p>无论是项目合作、展览邀约还是简单问候，都欢迎通过下方表单或邮件联系。</p>
  </section>

  <section class="contact">
    <form class="contact-form" id="contact-form" novalidate>
      <div class="form-field">
        <label for="contact-name">姓名</label>
        <input type="text" id="contact-name" name="name" autocomplete="name" required>
        <p class="form-error" data-error-for="name" hidden></p>
      </div>
      <div class="form-field">
        <label for="contact-email">邮箱</label>
        <input type="email" id="contact-email" name="email" autocomplete="email" required>
        <p class="form-error" data-error-for="email" hidden></p>
      </div>
      <div class="form-field">
        <label for="contact-subject">主题</label>
        <input type="text" id="contact-subject" name="subject">
        <p class="form-error" data-error-for="subject" hidden></p>
      </div>
      <div class="form-field">
        <label for="contact-message">留言</label>
        <textarea id="contact-message" name="message" rows="5" required></textarea>
        <p class="form-error" data-error-for="message" hidden></p>
      </div>
      <button class="btn btn--primary" type="submit">发送留言</button>
      <p class="form-status" id="form-status" role="status" hidden></p>
    </form>

    <aside class="contact-aside">
      <h2>其他方式</h2>
      <p>邮箱：<a href="mailto:${SITE.email}">${SITE.email}</a></p>
      <p>驻地：${SITE.location}</p>
      <p>通常在 48 小时内回复。</p>
    </aside>
  </section>`;

  return layout({ title: '联系', pageKey: 'contact', body });
}

function renderPublish(content, doc) {
  const seriesBlocks = content.series.map((series) => {
    const batches = doc.batches
      .filter((b) => b.seriesId === series.id)
      .sort((a, b) => b.version - a.version);
    const published = store.getPublishedBatch(doc, series.id);

    const batchRows = batches.length
      ? batches.map((b) => {
          const isPublished = published && published.id === b.id;
          const statusLabel = b.status === 'published'
            ? (isPublished ? '已发布' : '已发布(旧)')
            : b.status === 'stale'
              ? '待复核'
              : '草稿';
          return `<tr data-batch-id="${escapeHtml(b.id)}">
            <td><code>v${b.version}</code></td>
            <td><span class="badge badge--${b.status}">${statusLabel}</span></td>
            <td>${b.frozen.order.length} 张</td>
            <td>${formatDate(b.createdAt)}</td>
            <td>${b.publishedAt ? formatDate(b.publishedAt) : '—'}</td>
            <td class="batch-actions">
              ${b.status === 'draft' ? `<button class="btn btn--small btn--ghost" type="button" data-action="refreeze">重选</button>` : ''}
              ${b.status === 'draft' ? `<button class="btn btn--small btn--primary" type="button" data-action="publish">发布</button>` : ''}
              ${b.status === 'stale' ? `<button class="btn btn--small btn--primary" type="button" data-action="republish">重新发布</button>` : ''}
              ${isPublished ? `<a class="btn btn--small btn--ghost" href="series-${escapeHtml(series.id)}.html">查看</a>` : ''}
            </td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="6" class="batch-empty">暂无批次</td></tr>`;

    return `<section class="publish-series" data-series-id="${escapeHtml(series.id)}">
      <div class="publish-series__head">
        <div>
          <span class="eyebrow">${escapeHtml(categoryLabel(content, series.category))}</span>
          <h2>${escapeHtml(series.title)}</h2>
          <p>${escapeHtml(series.summary)}</p>
        </div>
        <button class="btn btn--primary" type="button" data-action="freeze">新建批次（冻结快照）</button>
      </div>
      <table class="batch-table">
        <thead>
          <tr><th>版本</th><th>状态</th><th>照片</th><th>创建于</th><th>发布于</th><th>操作</th></tr>
        </thead>
        <tbody>
          ${batchRows}
        </tbody>
      </table>
    </section>`;
  }).join('\n      ');

  const body = `
  <section class="page-head">
    <span class="eyebrow">发布管理</span>
    <h1>发布批次</h1>
    <p>为每个系列冻结一个快照（封面、顺序、说明）生成发布批次。批次在发布前可随时重选；照片顺序或说明一旦变更，旧批次失效并标记待复核，需重新选择发布。</p>
  </section>

  <div class="publish-status" id="publish-status" role="status" hidden></div>

  <div class="publish-series-list">
    ${seriesBlocks}
  </div>`;

  return layout({ title: '发布管理', pageKey: 'home', body, bodyClass: 'publish-page' });
}

// ---------------------------------------------------------------------------
// Asset copying
// ---------------------------------------------------------------------------

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyAssets() {
  copyDir(FONTS_SRC, FONTS_DIST);
  copyDir(PHOTOS_SRC, PHOTOS_DIST);
  copyDir(STYLES_SRC, STYLES_DIST);
  copyDir(SCRIPTS_SRC, SCRIPTS_DIST);
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

function generate(content, doc) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
  copyAssets();

  const pages = {
    'index.html': renderHome(content, doc),
    'works.html': renderWorks(content, doc),
    'series.html': renderSeriesList(content, doc),
    'about.html': renderAbout(content, doc),
    'contact.html': renderContact(content, doc),
    'publish.html': renderPublish(content, doc),
  };

  for (const series of content.series) {
    pages[`series-${series.id}.html`] = renderSeriesDetail(content, doc, series);
  }

  for (const [filename, html] of Object.entries(pages)) {
    fs.writeFileSync(path.join(DIST_DIR, filename), html);
  }

  return { pages: Object.keys(pages) };
}

module.exports = {
  DIST_DIR,
  generate,
  layout,
  escapeHtml,
  formatDate,
};
