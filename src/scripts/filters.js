// scripts/filters.js
//
// Works-page filters. State is persisted to sessionStorage so that navigating
// to a series page and back keeps the current filter selection. The lightbox
// reads only visible .photo elements, so it is automatically scoped to the
// filtered results.

(function () {
  'use strict';

  var grid = document.getElementById('works-grid');
  if (!grid) return;

  var STORAGE_KEY = 'works-filters';
  var statusEl = document.getElementById('filter-status');
  var emptyEl = document.getElementById('works-empty');
  var resetBtn = document.getElementById('works-reset');

  var state = { category: 'all', series: 'all' };

  function loadState() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          state.category = saved.category || 'all';
          state.series = saved.series || 'all';
        }
      }
    } catch (err) {
      // Ignore storage errors.
    }
  }

  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // Ignore storage errors.
    }
  }

  function applyChipStates() {
    var chips = document.querySelectorAll('.filter-chip');
    chips.forEach(function (chip) {
      var group = chip.getAttribute('data-filter');
      var value = chip.getAttribute('data-value');
      var active = state[group] === value;
      chip.classList.toggle('filter-chip--active', active);
    });
  }

  function matches(photo) {
    if (state.category !== 'all' && photo.getAttribute('data-category') !== state.category) {
      return false;
    }
    if (state.series !== 'all' && photo.getAttribute('data-series-id') !== state.series) {
      return false;
    }
    return true;
  }

  function applyFilters() {
    var photos = grid.querySelectorAll('.photo');
    var visibleCount = 0;
    photos.forEach(function (photo) {
      var show = matches(photo);
      photo.style.display = show ? '' : 'none';
      if (show) visibleCount++;
    });

    if (statusEl) {
      var parts = [];
      if (state.category !== 'all') parts.push('类别 ' + state.category);
      if (state.series !== 'all') parts.push('系列 ' + state.series);
      statusEl.textContent = parts.length
        ? '筛选：' + parts.join(' · ') + ' · ' + visibleCount + ' 张'
        : '全部 · ' + visibleCount + ' 张';
    }

    if (emptyEl) {
      emptyEl.hidden = visibleCount !== 0;
    }
    grid.style.display = visibleCount === 0 ? 'none' : '';
  }

  function setFilter(group, value) {
    state[group] = value;
    saveState();
    applyChipStates();
    applyFilters();
  }

  // Chip clicks (event delegation).
  document.addEventListener('click', function (event) {
    var chip = event.target.closest('.filter-chip');
    if (!chip) return;
    if (!chip.closest('#filters')) return;
    var group = chip.getAttribute('data-filter');
    var value = chip.getAttribute('data-value');
    setFilter(group, value);
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      state.category = 'all';
      state.series = 'all';
      saveState();
      applyChipStates();
      applyFilters();
    });
  }

  // Init.
  loadState();
  applyChipStates();
  applyFilters();
})();
