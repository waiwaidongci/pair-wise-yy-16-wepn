// build.js
//
// Generates the static site into dist/ from mock-data/photos.json and the
// current batch state. Recomputes staleness before rendering so stale
// published batches are flagged 待复核 in the output.

'use strict';

const store = require('./lib/store');
const generate = require('./lib/generate');

function main() {
  const content = store.loadContent();
  let doc = store.loadBatches();
  doc = store.recomputeStaleness(content, doc);
  const result = generate.generate(content, doc);
  console.log(`[build] 已生成 ${result.pages.length} 个页面 → ${generate.DIST_DIR}`);
  for (const page of result.pages) {
    console.log(`  - ${page}`);
  }
}

main();
