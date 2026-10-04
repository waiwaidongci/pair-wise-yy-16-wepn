// scripts/form.js
//
// Contact form validation. Distinguishes error states (inline field errors,
// red styling) from success state (green confirmation message).

(function () {
  'use strict';

  var form = document.getElementById('contact-form');
  if (!form) return;

  var statusEl = document.getElementById('form-status');

  var validators = {
    name: function (value) {
      if (!value.trim()) return '请填写姓名';
      return null;
    },
    email: function (value) {
      if (!value.trim()) return '请填写邮箱';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return '邮箱格式不正确';
      return null;
    },
    subject: function (value) {
      return null; // optional
    },
    message: function (value) {
      if (!value.trim()) return '请填写留言';
      if (value.trim().length < 10) return '留言至少 10 个字符';
      return null;
    },
  };

  function fieldEl(name) {
    return form.querySelector('[name="' + name + '"]');
  }

  function errorEl(name) {
    return form.querySelector('[data-error-for="' + name + '"]');
  }

  function showFieldError(name, message) {
    var field = fieldEl(name);
    var error = errorEl(name);
    if (field) {
      var wrapper = field.closest('.form-field');
      if (wrapper) wrapper.classList.add('has-error');
      field.setAttribute('aria-invalid', 'true');
    }
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
  }

  function clearFieldError(name) {
    var field = fieldEl(name);
    var error = errorEl(name);
    if (field) {
      var wrapper = field.closest('.form-field');
      if (wrapper) wrapper.classList.remove('has-error');
      field.removeAttribute('aria-invalid');
    }
    if (error) {
      error.textContent = '';
      error.hidden = true;
    }
  }

  function clearAllErrors() {
    ['name', 'email', 'subject', 'message'].forEach(clearFieldError);
  }

  function showStatus(kind, message) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.className = 'form-status form-status--' + kind;
    statusEl.textContent = message;
  }

  function hideStatus() {
    if (!statusEl) return;
    statusEl.hidden = true;
    statusEl.className = 'form-status';
    statusEl.textContent = '';
  }

  // Clear error on input.
  form.addEventListener('input', function (event) {
    var name = event.target.name;
    if (name && validators[name]) {
      clearFieldError(name);
      hideStatus();
    }
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    hideStatus();
    clearAllErrors();

    var values = {};
    var firstError = null;
    var hasError = false;

    Object.keys(validators).forEach(function (name) {
      var field = fieldEl(name);
      var value = field ? field.value : '';
      values[name] = value;
      var error = validators[name](value);
      if (error) {
        showFieldError(name, error);
        hasError = true;
        if (!firstError) firstError = field;
      }
    });

    if (hasError) {
      showStatus('error', '请修正表单中的错误后再发送。');
      if (firstError) firstError.focus();
      return;
    }

    // Simulate async send with success state.
    var submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '发送中…';
    }

    setTimeout(function () {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '发送留言';
      }
      form.reset();
      showStatus('success', '留言已发送，感谢你的联系！我会尽快回复。');
    }, 600);
  });
})();
