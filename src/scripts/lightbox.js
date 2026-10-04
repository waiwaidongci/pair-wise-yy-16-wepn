// scripts/lightbox.js
//
// Shared lightbox. Navigates only along the *current* result set — the visible
// .photo figures in the page's grid at the moment of opening. On the works
// page that means the filtered results; on a series page, that series' photos.

(function () {
  'use strict';

  var lightbox = document.getElementById('lightbox');
  if (!lightbox) return;

  var img = lightbox.querySelector('.lightbox__img');
  var titleEl = lightbox.querySelector('.lightbox__title');
  var textEl = lightbox.querySelector('.lightbox__text');
  var counterEl = lightbox.querySelector('.lightbox__counter');
  var closeBtn = lightbox.querySelector('.lightbox__close');
  var prevBtn = lightbox.querySelector('.lightbox__nav--prev');
  var nextBtn = lightbox.querySelector('.lightbox__nav--next');

  var currentList = [];
  var currentIndex = 0;

  /**
   * Return the photos that belong to the current result set. We only consider
   * .photo figures that are visible (not display:none), so filters on the
   * works page naturally scope the lightbox.
   */
  function getCurrentPhotos() {
    var grid = document.getElementById('works-grid') ||
      document.getElementById('series-grid') ||
      document.querySelector('.photo-grid--home');
    if (!grid) return [];
    var nodes = grid.querySelectorAll('.photo');
    var list = [];
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.offsetParent !== null || node.getClientRects().length > 0) {
        list.push(node);
      }
    }
    return list;
  }

  function readPhotoData(node) {
    var imgEl = node.querySelector('.photo__img');
    var title = node.querySelector('.photo__title');
    var text = node.querySelector('.photo__text');
    return {
      file: imgEl ? imgEl.getAttribute('src') : '',
      alt: imgEl ? imgEl.getAttribute('alt') : '',
      title: title ? title.textContent : '',
      text: text ? text.textContent : '',
    };
  }

  function render() {
    if (!currentList.length) return;
    if (currentIndex < 0) currentIndex = currentList.length - 1;
    if (currentIndex >= currentList.length) currentIndex = 0;

    var data = readPhotoData(currentList[currentIndex]);
    img.src = data.file;
    img.alt = data.alt;
    titleEl.textContent = data.title;
    textEl.textContent = data.text;
    counterEl.textContent = (currentIndex + 1) + ' / ' + currentList.length;

    prevBtn.style.visibility = currentList.length > 1 ? 'visible' : 'hidden';
    nextBtn.style.visibility = currentList.length > 1 ? 'visible' : 'hidden';
  }

  function open(node) {
    currentList = getCurrentPhotos();
    currentIndex = Math.max(0, currentList.indexOf(node));
    render();
    lightbox.classList.add('is-open');
    lightbox.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    lightbox.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(function () {
      if (!lightbox.classList.contains('is-open')) {
        lightbox.setAttribute('hidden', '');
        img.src = '';
      }
    }, 250);
  }

  function next() {
    currentIndex++;
    render();
  }

  function prev() {
    currentIndex--;
    render();
  }

  // Event delegation: open on any .photo click.
  document.addEventListener('click', function (event) {
    var node = event.target.closest('.photo');
    if (!node) return;
    // Only open if the photo is in a grid that owns the lightbox set.
    var grid = document.getElementById('works-grid') ||
      document.getElementById('series-grid') ||
      document.querySelector('.photo-grid--home');
    if (!grid || !grid.contains(node)) return;
    event.preventDefault();
    open(node);
  });

  closeBtn.addEventListener('click', close);
  nextBtn.addEventListener('click', function (e) { e.stopPropagation(); next(); });
  prevBtn.addEventListener('click', function (e) { e.stopPropagation(); prev(); });

  lightbox.addEventListener('click', function (event) {
    if (event.target === lightbox) close();
  });

  document.addEventListener('keydown', function (event) {
    if (!lightbox.classList.contains('is-open')) return;
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowRight') next();
    else if (event.key === 'ArrowLeft') prev();
  });

  // Expose for debugging / external control.
  window.Lightbox = { open: open, close: close, next: next, prev: prev };
})();
