# Quiet Frames — photography portfolio

A dependency-free static site (no build step) for publishing three photographic
series as versioned **publish batches**.

## Run

Any static file server rooted at the repository root works:

```bash
python3 -m http.server 8099
# open http://localhost:8099/index.html
```

Pages (navigation on every page):

| Entry | Page |
|---|---|
| Home | `/index.html` |
| Works (all photos + filters + lightbox) | `/works.html` |
| Series (listing + detail) | `/series.html`, `/series.html?id=gaze` |
| About | `/about.html` |
| Contact | `/contact.html` |
| Publish console (footer link, `noindex`) | `/console.html` |

Content is loaded from `mock-data/photos.json` (the authoritative content model).
Photos are referenced in place from `mock-data/photos/`; binaries are never
parsed. Fonts are local only — `/fonts/*.woff2`, wired via `@font-face` in
`css/styles.css`, no external font CDN.

## Publish batch workflow (`/console.html`)

1. **Batch** tab — pick the series for a batch and press **Freeze selected**.
   Cover, photo order and captions are snapshotted into a batch
   (`B001`, `B002`, …). The selection may be changed any time **before**
   publishing via *Discard draft & re-pick*.
2. **Publish** freezes the batch as `v1`; the public site renders exactly the
   frozen snapshot.
3. **Cover · order · captions** tab — adjust the live source (pick cover,
   move photos, edit captions). Any change makes the fingerprint mismatch:
   - an unpublished draft is marked **outdated** (re-freeze before publishing);
   - the published batch stays online but the public pages show a
     **pending review** banner on the affected series.
4. Re-publishing a changed batch with the same batch number bumps the version
   (`v2`, `v3`, …); full history is in the **History & storage** tab.
5. *Start revision draft* pre-picks the currently published series for a new
   frozen pass.

Storage details (all client-side, in `localStorage`):

- `qf.draft` — the unpublished frozen batch; re-selectable until publish.
- `qf.published`, `qf.history` — the live batch and past releases.
- `qf.sourceOverrides` — cover / order / caption edits to the live source.
- Writes go through a single queue. If a write fails (flip on
  *Simulate storage write failure* in the console to try it), the draft stays
  in memory, an error is shown and saving retries automatically; *Retry saving
  now* flushes immediately.
- Old drafts without a batch number (`qf.publishDraft` / `qf.selection`) are
  upgraded to **B001 v1** on boot. The *Seed legacy unnumbered draft* button
  reproduces this.

## Front-end behavior

- **Filters persist** on Works (URL `?category=` + `sessionStorage`), so going
  to a series detail and back restores them (back/forward too).
- **Shared lightbox** only steps through the current result set
  (filtered tiles or one series' ordered photos); prev/next disable at the
  boundaries — no wrap and no leakage to other sets. Esc closes; arrow keys
  navigate.
- Photos reserve space from their **original width/height** before loading
  (aspect-ratio padding box; fade-in on load).
- **Responsive**: 3-column grids → 2 columns at ≤960px → single column at
  ≤680px; on narrow screens series captions move **below** the photo.
- Contact form renders **field-level errors** and a red error alert vs. a green
  success alert (success clears the form, errors keep input).
- Fonts: Playfair Display 600 / Italic 400 for headings and pull quotes,
  Inter (variable 400–600) for body/nav/form — all from `/fonts`.

## Tests (Node ≥ 20, no app dependencies)

Logic + jsdom smoke tests live outside the repo in `/tmp/qf-test`
(jsdom installed there). They cover freeze/publish/invalidation fingerprints,
pending-review rendering, filter persistence, lightbox scoping, form states,
write-failure retention/retry and the legacy-draft v1 upgrade —
101 assertions total.

## Layout

```
index.html works.html series.html about.html contact.html console.html
css/styles.css            # local @font-face, design system, responsive rules
fonts/                    # local woff2 (copied from assets/fonts)
js/
  store.js                # localStorage, batched write queue + retry, v1 migration
  data.js                 # live source + overrides, fingerprints, frozen snapshots
  ui.js                   # helpers, review banner, shared Lightbox
  index.js works.js series.js about.js contact.js
  console.js              # publish console
mock-data/                # photos.json content model + photo binaries (untouched)
assets/                   # source font binaries + font spec (FONTS.md)
```
