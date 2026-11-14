// Shared helpers for every page: session id, API calls, header, toasts, product art.

const Mavs = (() => {
  const SESSION_KEY = 'mavs-session-id';
  let memorySession = null;

  function newId() {
    return 's-' + Math.random().toString(36).slice(2, 10);
  }

  function sessionId() {
    try {
      let id = localStorage.getItem(SESSION_KEY);
      if (!id) {
        id = newId();
        localStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch (e) {
      memorySession = memorySession || newId();
      return memorySession;
    }
  }

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-session-id': sessionId() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* empty body */
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || res.statusText);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function money(n) {
    return '$' + Number(n || 0).toFixed(2);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- Toasts ----------
  function toast(message, kind = 'info', title) {
    let box = document.querySelector('.toasts');
    if (!box) {
      box = document.createElement('div');
      box.className = 'toasts';
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = (title ? `<span class="title">${escapeHtml(title)}</span>` : '') + message;
    box.appendChild(el);
    setTimeout(() => el.remove(), kind === 'error' ? 8000 : 3500);
  }

  function showError(err) {
    if (err.status >= 500) {
      const name = (err.data && err.data.name) || 'Error';
      toast(`<code>${escapeHtml(name)}: ${escapeHtml(err.message)}</code>`, 'error', `Server error ${err.status}`);
      console.error('Server stack:', err.data && err.data.stack);
    } else if (err.status) {
      toast(escapeHtml(err.message), 'warn');
    } else {
      toast('Could not reach the store server.', 'error', 'Network error');
    }
  }

  // ---------- Header ----------
  function renderHeader(active) {
    const header = document.getElementById('site-header');
    const link = (href, label, icon, extra = '') =>
      `<a href="${href}" class="${active === href.slice(1) ? 'active' : ''}">${icon}<span class="label">${label}</span>${extra}</a>`;
    header.innerHTML = `
      <div class="site-header">
        <div class="inner">
          <a class="brand" href="/shop">
            <span class="brand-mark">M</span>
            <span>MAVS MERCH<small>UT ARLINGTON</small></span>
          </a>
          <nav class="nav">
            ${link('/shop', 'Shop', ICONS.shop)}
            ${link('/cart', 'Cart', ICONS.cart, ' <span class="cart-count" id="cart-count">0</span>')}
            ${link('/checkout', 'Checkout', ICONS.card)}
          </nav>
        </div>
        <div class="stripe"></div>
      </div>`;
    refreshCount();
  }

  function setCount(n) {
    const el = document.getElementById('cart-count');
    if (el) el.textContent = n;
  }

  async function refreshCount() {
    try {
      const cart = await api('/cart');
      setCount(cart.count);
    } catch (e) {
      /* header count is best-effort */
    }
  }

  const ICONS = {
    shop: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/></svg>',
    cart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h12L22 7H6.2"/></svg>',
    card: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
  };

  // ---------- Product art (inline SVG, no image requests) ----------
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, v + amt));
    const r = c(n >> 16), g = c((n >> 8) & 255), b = c(n & 255);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  function art(type, color) {
    const dark = shade(color, -40);
    const accent = color.toLowerCase() === '#f58025' ? '#ffffff' : '#F58025';
    const word = (y, size = 22, fill = accent) =>
      `<text x="100" y="${y}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${size}" fill="${fill}">MAVS</text>`;
    const shapes = {
      tee: `<path d="M62 42 L84 30 Q100 46 116 30 L138 42 L170 72 L150 94 L138 84 L138 172 L62 172 L62 84 L50 94 L30 72 Z" fill="${color}"/>
            <path d="M84 30 Q100 46 116 30" fill="none" stroke="${dark}" stroke-width="5"/>${word(112)}`,
      crew: `<path d="M62 42 L84 32 Q100 44 116 32 L138 42 L166 140 L148 146 L138 90 L138 172 L62 172 L62 90 L52 146 L34 140 Z" fill="${color}"/>
             <path d="M84 32 Q100 48 116 32" fill="none" stroke="${dark}" stroke-width="6"/>
             <rect x="62" y="162" width="76" height="10" fill="${dark}"/>${word(108, 22, '#F58025')}`,
      hoodie: `<path d="M62 52 L80 40 L120 40 L138 52 L166 142 L148 148 L138 96 L138 172 L62 172 L62 96 L52 148 L34 142 Z" fill="${color}"/>
               <path d="M78 42 Q100 6 122 42 Q100 62 78 42 Z" fill="${dark}"/>
               <path d="M76 132 L124 132 L130 160 L70 160 Z" fill="${dark}" opacity=".55"/>
               <line x1="94" y1="58" x2="92" y2="82" stroke="#fff" stroke-width="3"/><line x1="106" y1="58" x2="108" y2="82" stroke="#fff" stroke-width="3"/>
               ${word(118, 20, '#ffffff')}`,
      jersey: `<path d="M66 40 L86 32 L100 52 L114 32 L134 40 L150 64 L140 76 L140 172 L60 172 L60 76 L50 64 Z" fill="${color}"/>
               <path d="M86 32 L100 52 L114 32" fill="none" stroke="#0064B1" stroke-width="6"/>
               <rect x="60" y="150" width="80" height="6" fill="#0064B1"/>
               <text x="100" y="132" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="46" fill="#fff" stroke="#0064B1" stroke-width="2">10</text>`,
      cap: `<path d="M48 122 Q48 62 100 62 Q152 62 152 122 Z" fill="${color}"/>
            <path d="M100 62 L100 122" stroke="${dark}" stroke-width="3"/>
            <path d="M40 122 Q110 108 176 130 Q150 146 104 136 Q64 130 40 122 Z" fill="${dark}"/>
            <circle cx="100" cy="62" r="6" fill="${accent}"/>
            <text x="100" y="108" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="30" fill="${accent}">M</text>`,
      beanie: `<circle cx="100" cy="46" r="16" fill="#fff" stroke="${dark}" stroke-width="3"/>
               <path d="M52 132 Q52 58 100 58 Q148 58 148 132 Z" fill="${color}"/>
               <rect x="46" y="122" width="108" height="34" rx="8" fill="${dark}"/>
               <path d="M60 128v22M72 128v22M84 128v22M96 128v22M108 128v22M120 128v22M132 128v22M144 128v22" stroke="${color}" stroke-width="3" opacity=".5"/>
               ${word(108, 18, '#ffffff')}`,
      mug: `<path d="M136 82 Q172 82 168 112 Q164 140 134 136" fill="none" stroke="${dark}" stroke-width="12"/>
            <rect x="48" y="60" width="92" height="106" rx="12" fill="${color}"/>
            <rect x="48" y="60" width="92" height="12" rx="6" fill="${dark}"/>
            <text x="94" y="126" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="38" fill="${accent}">M</text>`,
      pennant: `<rect x="34" y="40" width="10" height="140" rx="4" fill="#8a5a2b"/>
                <path d="M44 56 L176 100 L44 144 Z" fill="${color}"/>
                <rect x="44" y="56" width="14" height="88" fill="${dark}"/>
                <text x="104" y="108" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="22" fill="#fff">MAVS</text>`,
    };
    return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${shapes[type] || shapes.tee}</svg>`;
  }

  return { api, money, escapeHtml, toast, showError, renderHeader, setCount, refreshCount, art };
})();
