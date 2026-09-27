// Small progressive enhancements shared by every page. Page-specific
// scripts live beside this one (browse.js, listing.js, listing-form.js,
// chat.js).
(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  // ---------- Cookie consent + analytics ----------
  // GA4 / Meta Pixel only load after the visitor accepts. Until then,
  // window.frontageTrack queues events (see lib/analytics.js).
  var CONSENT_KEY = "frontage_consent";
  function getConsent() {
    try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }
  function setConsent(v) {
    try { localStorage.setItem(CONSENT_KEY, v); } catch (e) {}
  }
  var META_EVENTS = { sign_up: "CompleteRegistration", contact_seller: "Lead", view_listing: "ViewContent", publish_listing: "SubmitApplication" };

  function loadAnalytics() {
    var cfg = window.FRONTAGE_ANALYTICS;
    if (!cfg || window.__frontageAnalyticsLoaded) return;
    window.__frontageAnalyticsLoaded = true;
    if (cfg.ga4) {
      var s = document.createElement("script");
      s.async = true;
      s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(cfg.ga4);
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag("js", new Date());
      window.gtag("config", cfg.ga4);
    }
    if (cfg.pixel) {
      /* Meta Pixel base code */
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      window.fbq("init", cfg.pixel);
      window.fbq("track", "PageView");
    }
    window.frontageTrack = function (name, params) {
      params = params || {};
      if (window.gtag) window.gtag("event", name, params);
      if (window.fbq) {
        if (META_EVENTS[name]) window.fbq("track", META_EVENTS[name], params);
        else window.fbq("trackCustom", name, params);
      }
    };
    (window.__frontageQueue || []).forEach(function (e) { window.frontageTrack(e[0], e[1]); });
    window.__frontageQueue = [];
  }

  function cookieBanner() {
    if (!window.FRONTAGE_ANALYTICS) return;
    var consent = getConsent();
    if (consent === "yes") return loadAnalytics();
    if (consent === "no") return;
    var bar = document.createElement("div");
    bar.className = "cookie-banner";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Cookie preferences");
    bar.innerHTML =
      '<p>We use cookies to see how Frontage is used and to measure our ads. <a href="/privacy" class="link">Privacy Policy</a></p>' +
      '<div class="cookie-actions"><button type="button" class="btn btn-outline btn-sm" data-consent="no">Decline</button>' +
      '<button type="button" class="btn btn-primary btn-sm" data-consent="yes">Accept</button></div>';
    document.body.appendChild(bar);
    bar.addEventListener("click", function (e) {
      var v = e.target.getAttribute && e.target.getAttribute("data-consent");
      if (!v) return;
      setConsent(v);
      bar.remove();
      if (v === "yes") loadAnalytics();
    });
  }

  ready(function () {
    cookieBanner();

    // Flash banner fades after a few seconds.
    var flash = document.querySelector(".flash");
    if (flash) setTimeout(function () { flash.style.transition = "opacity .4s"; flash.style.opacity = "0"; }, 4000);

    // Show/hide password buttons.
    document.querySelectorAll("[data-reveal]").forEach(function (btn) {
      var input = document.getElementById(btn.getAttribute("data-reveal"));
      if (!input) return;
      btn.addEventListener("click", function () {
        var showing = input.type === "text";
        input.type = showing ? "password" : "text";
        btn.textContent = showing ? "Show" : "Hide";
        btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      });
    });

    // "Passwords match" hints.
    document.querySelectorAll("[data-match]").forEach(function (confirm) {
      var pw = document.getElementById(confirm.getAttribute("data-match"));
      var hint = document.querySelector('[data-match-hint="' + confirm.id + '"]');
      if (!pw || !hint) return;
      function check() {
        if (!confirm.value) { hint.textContent = ""; confirm.setCustomValidity(""); return; }
        var ok = pw.value === confirm.value;
        hint.textContent = ok ? "✓ Passwords match" : "Passwords don't match";
        hint.style.color = ok ? "var(--green)" : "var(--red)";
        confirm.setCustomValidity(ok ? "" : "Passwords don't match");
      }
      pw.addEventListener("input", check);
      confirm.addEventListener("input", check);
    });

    // Sign up / Log in tabs.
    var tabs = document.querySelectorAll(".auth-tab");
    if (tabs.length) {
      var showTab = function (name) {
        tabs.forEach(function (t) { t.classList.toggle("is-active", t.getAttribute("data-tab") === name); t.setAttribute("aria-selected", t.getAttribute("data-tab") === name); });
        document.querySelectorAll(".auth-panel").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== name; });
      };
      tabs.forEach(function (t) { t.addEventListener("click", function () { showTab(t.getAttribute("data-tab")); }); });
      showTab(window.FRONTAGE_AUTH_TAB || "signup");
    }

    // Account settings sections (deep-linkable via #security etc).
    var navLinks = document.querySelectorAll(".settings-nav a");
    if (navLinks.length) {
      var showSection = function (name) {
        var found = false;
        document.querySelectorAll(".settings-section").forEach(function (s) {
          var match = s.getAttribute("data-section") === name;
          s.hidden = !match;
          if (match) found = true;
        });
        if (!found) return showSection("profile");
        navLinks.forEach(function (l) { l.classList.toggle("is-active", l.getAttribute("data-section") === name); });
      };
      navLinks.forEach(function (l) {
        l.addEventListener("click", function (e) {
          e.preventDefault();
          var name = l.getAttribute("data-section");
          showSection(name);
          if (history.replaceState) history.replaceState(null, "", "#" + name);
        });
      });
      showSection((location.hash || "#profile").slice(1));
    }

    // <form data-autosubmit>: submit as soon as a select changes (the
    // browse country switcher). A <noscript> button covers no-JS visitors.
    document.querySelectorAll("form[data-autosubmit] select").forEach(function (sel) {
      sel.addEventListener("change", function () { sel.form.submit(); });
    });

    // Dropdowns (<details class="nav-dropdown">) close on an outside click.
    document.addEventListener("click", function (e) {
      document.querySelectorAll("details.nav-dropdown[open]").forEach(function (d) {
        if (!d.contains(e.target)) d.removeAttribute("open");
      });
    });

    // Confirm before destructive submits.
    document.addEventListener("submit", function (e) {
      var form = e.target;
      var submitter = e.submitter;
      var msg = (submitter && submitter.getAttribute("data-confirm")) || form.getAttribute("data-confirm");
      if (msg && !window.confirm(msg)) { e.preventDefault(); return; }
      // Stop double submits on forms that opt in.
      if (form.hasAttribute("data-single-submit")) {
        if (form.__submitted) { e.preventDefault(); return; }
        form.__submitted = true;
        setTimeout(function () {
          form.querySelectorAll('button[type="submit"], button:not([type])').forEach(function (b) { b.disabled = true; });
        }, 0);
      }
    });

    // Character counters: <input data-counter="80">.
    document.querySelectorAll("[data-counter]").forEach(function (el) {
      var max = el.getAttribute("data-counter");
      var counter = document.createElement("div");
      counter.className = "hint counter";
      el.insertAdjacentElement("afterend", counter);
      function update() { counter.textContent = el.value.length + " / " + max; }
      el.addEventListener("input", update);
      update();
    });
  });
})();
