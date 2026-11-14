/*
 * Crash recorder SDK. Load it on every page, in <head>, before other scripts:
 *   <script src="/sdk/recorder.js"></script>
 *
 * 1. Records the user's LAST 15 ACTIONS (navigate, click, input) in sessionStorage, so they
 *    survive the real page loads between /shop, /cart and /checkout.
 * 2. Adds X-Session-Id and X-User-Actions (base64 JSON) to every same-origin /api/* fetch,
 *    so a crashing request carries its own history and the server saves it in one write.
 * 3. Shows a friendly "our team has been notified (incident-0042)" toast when an API call returns 5xx.
 *
 * Action shape (the format AutomatedFix replays in a headless browser and shows on the dashboard):
 *   { t, type, target, value, url, label }
 *     t       epoch milliseconds
 *     type    'navigate' | 'click' | 'input'
 *     target  CSS selector, e.g. [data-testid="promo-apply"] (null for navigate)
 *     value   typed value, inputs only (passwords, cards and emails are "•••")
 *     url     path + query of the page, e.g. /cart
 *     label   readable text for people, e.g. "Apply promo code"
 *
 * Give every interactive element a data-testid (stable selector for replay) and,
 * optionally, a data-track (readable label).
 */
(function () {
  'use strict';
  if (window.MavsRecorder) return;

  var SESSION_KEY = 'mavs-session-id';
  var MAX_HEADER_CHARS = 12000; // stays well under Node's 16 KB header limit

  // ---------- small helpers ----------
  function clip(value, max) {
    var s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  function esc(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '\\$&');
  }

  function attrValue(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function sessionId() {
    try {
      var id = localStorage.getItem(SESSION_KEY);
      if (!id) {
        id = 's-' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch (e) {
      window.__mavsSession = window.__mavsSession || 's-' + Math.random().toString(36).slice(2, 10);
      return window.__mavsSession;
    }
  }

  // ╔═══════════════════════════════════════════════════════════════════════════════════╗
  // ║  RECORDS THE USER'S LAST 15 ACTIONS                                               ║
  // ║  Everything between this banner and "END: USER'S LAST 15 ACTIONS" below.          ║
  // ║  Storage: sessionStorage["mavs-recorder-actions"], oldest first, max 15 entries.  ║
  // ╚═══════════════════════════════════════════════════════════════════════════════════╝
  var MAX_ACTIONS = 15;
  var ACTIONS_KEY = 'mavs-recorder-actions';
  var LIMIT = { label: 60, value: 60, url: 200 };
  var MASK = '•••';
  var SENSITIVE_RE = /pass|card|cc-|cvv|cvc|csc|secret|ssn|\bpin\b/i;
  var memoryActions = [];

  function getActions() {
    try {
      var stored = JSON.parse(sessionStorage.getItem(ACTIONS_KEY) || 'null');
      if (Array.isArray(stored)) return stored;
    } catch (e) {
      /* storage blocked or corrupt: fall back to memory */
    }
    return memoryActions.slice();
  }

  function saveActions(list) {
    memoryActions = list;
    try {
      sessionStorage.setItem(ACTIONS_KEY, JSON.stringify(list));
    } catch (e) {
      /* memory copy still works for this page */
    }
  }

  function currentUrl() {
    return clip(location.pathname + location.search + location.hash, LIMIT.url);
  }

  // A selector the patcher can replay. Most stable first; never shortened.
  function replaySelector(el) {
    var testId = el.getAttribute('data-testid');
    if (testId) return '[data-testid="' + attrValue(testId) + '"]';
    if (el.id) return '#' + esc(el.id);
    var name = el.getAttribute('name');
    if (name && document.querySelectorAll(el.tagName + '[name="' + attrValue(name) + '"]').length === 1) {
      return el.tagName.toLowerCase() + '[name="' + attrValue(name) + '"]';
    }
    // Fallback: a path up to the nearest ancestor with a test id or id.
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      var anchor = node.getAttribute('data-testid')
        ? '[data-testid="' + attrValue(node.getAttribute('data-testid')) + '"]'
        : node.id
          ? '#' + esc(node.id)
          : null;
      if (anchor && node !== el) {
        parts.unshift(anchor);
        break;
      }
      var part = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function (c) {
          return c.tagName === node.tagName;
        });
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ') || el.tagName.toLowerCase();
  }

  function clickLabel(el) {
    return clip(
      el.getAttribute('data-track') || el.getAttribute('aria-label') || el.innerText || el.value || el.title || el.tagName.toLowerCase(),
      LIMIT.label
    );
  }

  function fieldLabel(el) {
    var explicit = el.getAttribute('data-track') || el.getAttribute('aria-label');
    if (explicit) return clip(explicit, LIMIT.label);
    if (el.id) {
      var forLabel = document.querySelector('label[for="' + attrValue(el.id) + '"]');
      if (forLabel) return clip(forLabel.innerText, LIMIT.label);
    }
    var wrap = el.closest('label');
    if (wrap) return clip(wrap.innerText, LIMIT.label);
    return clip(el.placeholder || el.name || el.id || el.tagName.toLowerCase(), LIMIT.label);
  }

  function isSensitive(el) {
    var type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'password' || type === 'email') return true;
    var hints = [el.name, el.id, el.getAttribute('autocomplete'), el.placeholder].join(' ');
    return SENSITIVE_RE.test(hints) || /email/i.test(el.getAttribute('autocomplete') || '');
  }

  function fieldValue(el) {
    if (isSensitive(el)) return MASK;
    var type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'checkbox' || type === 'radio') return el.checked ? 'true' : 'false';
    return clip(el.value, LIMIT.value); // for <select> this is the option value, which replay selects by
  }

  // Adds one action and keeps only the newest 15.
  function record(action) {
    var entry = {
      t: Date.now(),
      type: action.type,
      target: action.type === 'navigate' ? null : action.target || null,
      value: action.type === 'input' ? (action.value == null ? '' : String(action.value)) : null,
      url: currentUrl(),
      label: clip(action.label, LIMIT.label),
    };
    var list = getActions();
    list.push(entry);
    saveActions(list.slice(-MAX_ACTIONS));
  }

  // CLICK: capture phase on document, only on things a user can actually click.
  var CLICKABLE =
    '[data-testid], [data-track], button, a, [role="button"], input[type="submit"], input[type="button"], ' +
    'input[type="checkbox"], input[type="radio"], label, summary';

  document.addEventListener(
    'click',
    function (e) {
      var el = e.target && e.target.closest ? e.target.closest(CLICKABLE) : null;
      if (!el) return; // ignore clicks on empty space so they don't push real steps out
      if (el.matches('input[type="text"], input:not([type]), textarea, select')) return; // recorded on change
      record({ type: 'click', target: replaySelector(el), label: clickLabel(el) });
    },
    true
  );

  // INPUT: the "change" event (once per edit, not every keystroke).
  document.addEventListener(
    'change',
    function (e) {
      var el = e.target;
      if (!el || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
      record({ type: 'input', target: replaySelector(el), value: fieldValue(el), label: fieldLabel(el) });
    },
    true
  );

  // NAVIGATE: every page load, back/forward, and hash changes.
  function recordNavigate() {
    record({ type: 'navigate', label: document.title || currentUrl() });
  }
  recordNavigate();
  window.addEventListener('popstate', recordNavigate);
  window.addEventListener('hashchange', recordNavigate);
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) recordNavigate(); // restored from the back/forward cache
  });

  // Packs the last 15 actions for the X-User-Actions header (UTF-8 → base64 JSON).
  function toBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function encodeActions() {
    var list = getActions().slice(-MAX_ACTIONS);
    var encoded = toBase64(JSON.stringify(list));
    while (encoded.length > MAX_HEADER_CHARS && list.length) {
      list.shift(); // drop the oldest until it fits
      encoded = toBase64(JSON.stringify(list));
    }
    return encoded;
  }
  // ╔═══════════════════════════════════════════════════════════════════════════════════╗
  // ║  END: USER'S LAST 15 ACTIONS                                                      ║
  // ╚═══════════════════════════════════════════════════════════════════════════════════╝

  // ---------- toast ----------
  function toast(message) {
    if (!document.getElementById('mavs-recorder-style')) {
      var style = document.createElement('style');
      style.id = 'mavs-recorder-style';
      style.textContent =
        '.mavs-rec-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;' +
        'max-width:calc(100vw - 32px);background:#1b1f27;color:#fff;padding:12px 18px;border-radius:12px;' +
        'font:600 14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);' +
        'border-left:5px solid #ff5a5a;animation:mavs-rec-in .2s ease}' +
        '@keyframes mavs-rec-in{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}';
      document.head.appendChild(style);
    }
    var el = document.createElement('div');
    el.className = 'mavs-rec-toast';
    el.setAttribute('role', 'alert');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 7000);
  }

  function notifyCrash(res, url) {
    res
      .json()
      .catch(function () {
        return {};
      })
      .then(function (data) {
        var id = data && data.incidentId;
        toast(
          id
            ? 'Something went wrong — our team has been notified (' + id + ').'
            : 'Something went wrong. Please try again in a moment.'
        );
        window.dispatchEvent(new CustomEvent('mavs:crash', { detail: { incidentId: id || null, status: res.status, url: url } }));
      });
  }

  // ---------- fetch wrapper: attaches the actions to every /api/* call ----------
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  if (nativeFetch) {
    window.fetch = function (input, init) {
      var url;
      try {
        url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.href);
      } catch (e) {
        return nativeFetch(input, init);
      }
      if (url.origin !== location.origin || url.pathname.indexOf('/api/') !== 0) {
        return nativeFetch(input, init);
      }

      var opts = Object.assign({}, init);
      var headers = new Headers(opts.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has('X-Session-Id')) headers.set('X-Session-Id', sessionId());
      try {
        headers.set('X-User-Actions', encodeActions());
      } catch (e) {
        /* never block the request because of the recorder */
      }
      opts.headers = headers;

      return nativeFetch(input, opts).then(function (res) {
        if (res.status >= 500) notifyCrash(res.clone(), url.pathname);
        return res;
      });
    };
  }

  window.MavsRecorder = {
    sessionId: sessionId,
    getActions: getActions,
    record: record,
    clear: function () {
      saveActions([]);
    },
  };
})();
