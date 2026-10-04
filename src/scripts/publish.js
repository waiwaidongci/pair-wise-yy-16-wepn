// scripts/publish.js
//
// Publish-batch admin UI. Freeze / re-select / publish batches. On write
// failure the draft is preserved and a retry button is offered.

(function () {
  'use strict';

  var root = document.querySelector('.publish-page');
  if (!root) return;

  var statusEl = document.getElementById('publish-status');

  function showStatus(kind, message) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.className = 'publish-status publish-status--' + kind;
    statusEl.textContent = message;
  }

  function clearStatus() {
    if (!statusEl) return;
    statusEl.hidden = true;
    statusEl.className = 'publish-status';
    statusEl.textContent = '';
  }

  function setLoading(button, loading, label) {
    if (!button) return;
    if (loading) {
      button.dataset.originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = label || '处理中…';
    } else {
      button.disabled = false;
      button.textContent = button.dataset.originalLabel || button.textContent;
    }
  }

  function reload() {
    // Reload to reflect server-rendered state after a successful mutation.
    window.location.reload();
  }

  function post(url, payload) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res.json().then(function (data) {
        return { ok: res.ok && data.ok !== false, data: data };
      });
    });
  }

  /**
   * Run a mutation with retry. On failure the draft is preserved and a retry
   * button is shown.
   */
  function runWithRetry(button, url, payload, successMessage) {
    var attempt = 0;
    var maxAttempts = 3;

    function attemptOnce() {
      attempt++;
      setLoading(button, true, attempt > 1 ? ('重试 ' + attempt + '…') : '处理中…');
      clearStatus();

      post(url, payload).then(function (result) {
        setLoading(button, false);
        if (result.ok) {
          showStatus('success', successMessage);
          setTimeout(reload, 700);
        } else {
          var message = result.data && result.data.error ? result.data.error : '操作失败';
          if (result.data && result.data.retryable && attempt < maxAttempts) {
            showStatus('error', message + '（草稿已保留，可重试）');
            renderRetry(button, function () {
              attemptOnce();
            });
          } else {
            showStatus('error', message + '（草稿已保留，请稍后重试）');
          }
        }
      }).catch(function (err) {
        setLoading(button, false);
        showStatus('error', '网络错误：' + err.message + '（草稿已保留，可重试）');
        renderRetry(button, function () {
          attemptOnce();
        });
      });
    }

    attemptOnce();
  }

  function renderRetry(button, onRetry) {
    if (!button) return;
    // Replace the button with a retry control.
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn--small btn--primary';
    retry.textContent = '重试';
    retry.addEventListener('click', function () {
      retry.remove();
      onRetry();
    });
    button.insertAdjacentElement('afterend', retry);
  }

  // Event delegation for batch actions.
  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-action]');
    if (!button) return;
    if (!button.closest('.publish-series')) return;

    var action = button.getAttribute('data-action');
    var seriesEl = button.closest('.publish-series');
    var seriesId = seriesEl ? seriesEl.getAttribute('data-series-id') : null;
    var row = button.closest('tr[data-batch-id]');
    var batchId = row ? row.getAttribute('data-batch-id') : null;

    if (action === 'freeze') {
      if (!seriesId) return;
      runWithRetry(button, '/api/batches/freeze', { seriesId: seriesId }, '已冻结新批次（草稿）。');
    } else if (action === 'refreeze') {
      if (!batchId) return;
      runWithRetry(button, '/api/batches/refreeze', { batchId: batchId }, '已重选批次（草稿）。');
    } else if (action === 'publish' || action === 'republish') {
      if (!batchId) return;
      var message = action === 'republish' ? '已重新发布，站点内容已更新。' : '已发布，站点内容已更新。';
      runWithRetry(button, '/api/batches/publish', { batchId: batchId }, message);
    }
  });
})();
