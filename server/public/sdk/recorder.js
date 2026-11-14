/*
 * AutoFix crash recorder. Load it on every page, in <head>, before other scripts:
 *   <script src="/sdk/recorder.js"></script>
 *
 * 1. Records the user's LAST 15 ACTIONS in sessionStorage (survives page navigations).
 * 2. Sends them with every same-origin /api/* fetch in the `x-autofix-actions` header (JSON string),
 *    so the server can save them with the incident if that request crashes.
 * 3. Shows a friendly toast when an API call returns 5xx.
 *
 * Action shape (the AutoFix engine replays these in a headless browser; do not change it):
 *   { t, type, target, value, url }
 *     t       Date.now() epoch milliseconds
 *     type    'navigate' | 'click' | 'input' | 'select' | 'check' | 'uncheck' | 'submit' | 'keypress'
 *     target  CSS selector, preferring [data-testid="..."]; null for navigate
 *     value   final value for input/select (passwords are '***'), else null
 *     url     location.href of the page the action happened on
 *   keypress is recorded for Enter only.
 *
 * Give every interactive element a data-testid: it is the selector used on replay.
 */
(function () {
  'use strict';
  if (window.AutofixRecorder) return;

  var SESSION_KEY = 'mavs-session-id';
  var ACTIONS_KEY = 'autofix-actions';
  var MAX_ACTIONS = 15;
  var MAX_HEADER_CHARS = 12000; // stays well under Node's 16 KB header limit
  var memoryActions = [];

  // ---------- helpers ----------
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

  // A selector the engine can replay. data-testid first; never shortened.
  function selectorFor(el) {
    var testId = el.getAttribute('data-testid');
    if (testId) return '[data-testid="' + attrValue(testId) + '"]';
    if (el.id) return '#' + esc(el.id);
    var name = el.getAttribute('name');
    if (name && document.querySelectorAll(el.tagName + '[name="' + attrValue(name) + '"]').length === 1) {
      return el.tagName.toLowerCase() + '[name="' + attrValue(name) + '"]';
    }
    // Last resort: a path up to the nearest ancestor with a test id or id.
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

  function inputType(el) {
    return (el.getAttribute('type') || '').toLowerCase();
  }

  function isToggle(el) {
    var type = inputType(el);
    return el.tagName === 'INPUT' && (type === 'checkbox' || type === 'radio');
  }

  function isTextField(el) {
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName !== 'INPUT') return false;
    return !/^(checkbox|radio|submit|button|reset|image|file|hidden|range|color)$/.test(inputType(el));
  }

  function fieldValue(el) {
    if (inputType(el) === 'password') return '***'; // never record passwords
    return String(el.value == null ? '' : el.value);
  }

  // Adds one action and keeps only the newest 15.
  function record(type, target, value) {
    var list = getActions();
    list.push({
      t: Date.now(),
      type: type,
      target: type === 'navigate' ? null : target || null,
      value: type === 'input' || type === 'select' ? (value == null ? '' : String(value)) : null,
      url: location.href,
    });
    saveActions(list.slice(-MAX_ACTIONS));
  }

  // ---------- RECORDING ----------
  var lastValues = {}; // selector -> last recorded value, so change + Enter don't record twice
  var lastSubmitTrigger = 0; // time of a recorded click/Enter that submits a form
  var lastEnter = { form: null, t: 0 }; // last recorded Enter inside a form

  function recordField(el) {
    var target = selectorFor(el);
    var value = fieldValue(el);
    if (lastValues[target] === value) return;
    lastValues[target] = value;
    record(el.tagName === 'SELECT' ? 'select' : 'input', target, value);
  }

  // CLICK: only on things a user can actually click. Fields and toggles are recorded on change.
  var CLICKABLE =
    '[data-testid], button, a, [role="button"], input[type="submit"], input[type="button"], input[type="image"], label, summary';

  document.addEventListener(
    'click',
    function (e) {
      var el = e.target && e.target.closest ? e.target.closest(CLICKABLE) : null;
      if (!el) return; // ignore clicks on empty space so they don't push real steps out
      if (el.tagName === 'SELECT' || el.tagName === 'FORM' || isTextField(el) || isToggle(el)) return;
      if (el.tagName === 'LABEL' && el.control) return; // the control's own change is recorded
      var submits = el.form && (el.type === 'submit' || el.type === 'image');
      // Enter in a field makes the browser fire a synthetic click on the form's submit button;
      // the Enter keypress is already recorded, so recording this too would submit twice on replay.
      if (submits && e.detail === 0 && lastEnter.form === el.form && Date.now() - lastEnter.t < 500) return;
      if (submits) lastSubmitTrigger = Date.now();
      record('click', selectorFor(el));
    },
    true
  );

  // INPUT / SELECT / CHECK / UNCHECK: the "change" event (fires once per edit, on commit/blur).
  document.addEventListener(
    'change',
    function (e) {
      var el = e.target;
      if (!el || !el.tagName) return;
      if (isToggle(el)) {
        record(el.checked ? 'check' : 'uncheck', selectorFor(el));
      } else if (el.tagName === 'SELECT' || isTextField(el)) {
        recordField(el);
      }
    },
    true
  );

  // KEYPRESS: Enter in a text field (commits the typed value first, since change may not have fired yet).
  document.addEventListener(
    'keydown',
    function (e) {
      if (e.key !== 'Enter' || e.isComposing) return;
      var el = e.target;
      if (!el || el.tagName !== 'INPUT' || !isTextField(el)) return;
      recordField(el);
      if (el.form) {
        lastSubmitTrigger = Date.now();
        lastEnter = { form: el.form, t: Date.now() };
      }
      record('keypress', selectorFor(el));
    },
    true
  );

  // SUBMIT: only when no recorded click/Enter caused it, so replay doesn't submit twice.
  document.addEventListener(
    'submit',
    function (e) {
      if (Date.now() - lastSubmitTrigger < 1000) return;
      if (e.target && e.target.tagName === 'FORM') record('submit', selectorFor(e.target));
    },
    true
  );

  // NAVIGATE: every page load, back/forward, hash changes and history route changes.
  function recordNavigate() {
    record('navigate', null);
  }
  recordNavigate();
  window.addEventListener('popstate', recordNavigate);
  window.addEventListener('hashchange', recordNavigate);
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) recordNavigate(); // restored from the back/forward cache
  });
  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    if (typeof original !== 'function') return;
    history[name] = function () {
      var before = location.href;
      var result = original.apply(this, arguments);
      if (location.href !== before) recordNavigate();
      return result;
    };
  });

  // Header value: JSON with non-ASCII escaped as \uXXXX (header values must be Latin-1;
  // JSON.parse on the server turns the escapes back into the same characters).
  function toHeaderJson(list) {
    return JSON.stringify(list).replace(/[\u007f-￿]/g, function (c) {
      return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
    });
  }

  function encodeActions() {
    var list = getActions().slice(-MAX_ACTIONS);
    var encoded = toHeaderJson(list);
    while (encoded.length > MAX_HEADER_CHARS && list.length) {
      list.shift(); // drop the oldest until it fits
      encoded = toHeaderJson(list);
    }
    return encoded;
  }

  // ---------- toast ----------
  function toast(message) {
    if (!document.getElementById('autofix-recorder-style')) {
      var style = document.createElement('style');
      style.id = 'autofix-recorder-style';
      style.textContent =
        '.autofix-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;' +
        'max-width:calc(100vw - 32px);background:#1b1f27;color:#fff;padding:12px 18px;border-radius:12px;' +
        'font:600 14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);' +
        'border-left:5px solid #ff5a5a;animation:autofix-in .2s ease}' +
        '@keyframes autofix-in{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}';
      document.head.appendChild(style);
    }
    var el = document.createElement('div');
    el.className = 'autofix-toast';
    el.setAttribute('role', 'alert');
    el.setAttribute('data-testid', 'crash-toast');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 7000);
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
        headers.set('x-autofix-actions', encodeActions());
      } catch (e) {
        /* never block the request because of the recorder */
      }
      opts.headers = headers;

      return nativeFetch(input, opts).then(function (res) {
        if (res.status >= 500) {
          toast('Something went wrong — our team has been notified.');
          window.dispatchEvent(new CustomEvent('autofix:crash', { detail: { status: res.status, url: url.pathname } }));
        }
        return res;
      });
    };
  }

  window.AutofixRecorder = {
    sessionId: sessionId,
    getActions: getActions,
    record: record,
    clear: function () {
      saveActions([]);
      lastValues = {};
    },
  };
})();
