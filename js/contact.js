// contact.js — contact form. Per-field errors and a top-level success state
// are rendered differently; success clears the form, errors keep input.

import { initStore } from "./store.js";
import { loadBaseData, resolveSiteState } from "./data.js";
import { markActiveNav, escapeHtml } from "./ui.js";

async function boot() {
  initStore();
  await loadBaseData();
  resolveSiteState();
  markActiveNav("contact");

  const form = document.querySelector("[data-contact-form]");
  const alertBox = form.querySelector("[data-form-alert]");
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const validators = {
    name: (v) => (!v.trim() ? "Please tell us your name." : ""),
    email: (v) => {
      if (!v.trim()) return "An email address is required.";
      if (!EMAIL_RE.test(v.trim())) return "That email address doesn't look valid.";
      return "";
    },
    subject: (v) => (!v ? "Please choose a subject." : ""),
    message: (v) => {
      if (!v.trim()) return "Please write a short message.";
      if (v.trim().length < 10) return "The message should be at least 10 characters.";
      return "";
    },
  };

  function showFieldError(name, msg) {
    const field = form.elements[name].closest(".form-field");
    field.classList.toggle("invalid", !!msg);
    field.querySelector(".field-error").textContent = msg;
  }

  function showAlert(kind, html) {
    alertBox.className = `form-alert ${kind}`;
    alertBox.innerHTML = html;
  }

  function clearAlert() {
    alertBox.className = "form-alert";
    alertBox.innerHTML = "";
  }

  // Validate on blur / input so errors clear as soon as they're fixed.
  Object.keys(validators).forEach((name) => {
    const el = form.elements[name];
    el.addEventListener("blur", () => {
      showFieldError(name, validators[name](el.value));
    });
    el.addEventListener("input", () => {
      if (el.closest(".form-field").classList.contains("invalid")) {
        showFieldError(name, validators[name](el.value));
      }
      if (alertBox.classList.contains("error")) clearAlert();
    });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearAlert();

    let firstInvalid = null;
    Object.entries(validators).forEach(([name, fn]) => {
      const msg = fn(form.elements[name].value);
      showFieldError(name, msg);
      if (msg && !firstInvalid) firstInvalid = name;
    });

    if (firstInvalid) {
      showAlert(
        "error",
        `<strong>Message not sent.</strong> Please fix the highlighted fields and try again.`
      );
      form.elements[firstInvalid].focus();
      return;
    }

    // Static site: no backend. Simulate a successful submission.
    const name = form.elements.name.value.trim();
    showAlert(
      "success",
      `<strong>Thank you, ${escapeHtml(name)}.</strong> Your message has been received — ` +
        `replies usually arrive within two working days.`
    );
    form.reset();
    Object.keys(validators).forEach((n) => showFieldError(n, ""));
  });
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
