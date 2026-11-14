# Mavs Merch Store (buggy demo target)

A small UTA Mavs merch store built with Node and Express plus plain HTML/JS. It has **three deliberate server crashes**, used for the HackUTA auto-patcher demo.

## Run

```bash
cd server && npm ci && cd ..   # install once
node server/index.js          # from the repo root; listens on $PORT (default 3000)
```

It needs no database or API keys. All state (products, carts, orders) is kept in memory, and carts are keyed by the `x-session-id` request header. A new session ID always starts with an empty cart.

Pages: `/shop`, `/cart`, `/checkout`. Health check: `GET /health`.

## The bugs

Each bug lives in its own file under `server/src/services/`, and each fix is 1–3 lines.

| # | Endpoint | File | Exception |
|---|----------|------|-----------|
| 1 | `POST /api/cart/promo` | `pricing.js` | `TypeError: Reduce of empty array with no initial value` |
| 2 | `POST /api/checkout/split` | `split.js` | `TypeError: Cannot read properties of undefined (reading 'map')` |
| 3 | `POST /api/cart/add` | `inventory.js` | `TypeError: Cannot read properties of undefined (reading 'stock')` |

### Reproduce from the request alone

```bash
# 1. Promo on an empty cart (any new session id is empty)
curl -X POST localhost:3000/api/cart/promo -H "content-type: application/json" \
  -H "x-session-id: repro-1" -d '{"code":"MAVS10"}'

# 2. Split with the friends field left blank (payers omitted)
curl -X POST localhost:3000/api/checkout/split -H "content-type: application/json" \
  -H "x-session-id: repro-2" -d '{}'

# 3. Add a size the product doesn't carry (or send no size at all)
curl -X POST localhost:3000/api/cart/add -H "content-type: application/json" \
  -H "x-session-id: repro-3" -d '{"productId":"classic-tee","size":"XXL"}'
```

### Reproduce in the UI

1. **Cart page** with an empty cart: type `MAVS10` and click **Apply**.
2. **Checkout page**: leave "Friends splitting with you" blank and click **Calculate split**.
3. **Shop page**: on *Mavs Classic Tee*, pick **XXL** (or no size) and click **Add to cart**.

A 500 shows a "Something went wrong — our team has been notified (incident-0042)" toast, and the full stack is printed in the server console.

Promo codes: `MAVS10` (10% off), `MAVS20` (20% off), `BLUEORANGE` (20% off), `GOMAVS` ($15 off orders of $75 or more).

## Crash capture (Member 1) → AutomatedFix

```
user clicks → recorder.js keeps the last 15 actions → /api call returns 500
  → crashCatcher.js saves an incident (status "open") in MongoDB  hackuta.incidents
  → AutomatedFix patcher sees the insert (change stream), replays the actions, patches, opens a PR
  → AutomatedFix dashboard reads the same document
```

| Piece | File | What it does |
|---|---|---|
| **Records the user's last 15 actions** | `server/public/sdk/recorder.js` (section marked *RECORDS THE USER'S LAST 15 ACTIONS*) | Keeps the last 15 navigate/click/input actions in `sessionStorage`, attached to every `/api/*` call as the `X-User-Actions` header. Shows "our team has been notified (incident-0042)" on a 5xx. |
| Saves them | `server/src/capture/parse.js` (section marked *USER'S LAST 15 ACTIONS*) | Decodes and cleans the header (max 15) before saving. |
| Crash catcher | `server/src/middleware/crashCatcher.js` | Last Express middleware. Saves the incident and answers `500 { error, incidentId }`. |
| Helpers | `server/src/capture/` | Config, MongoDB connection, stack/request parsing, dedupe, optional webhook. |

**Turning it on.** Copy `server/.env.example` to `server/.env` and set `CAPTURE_ENABLED=1` plus the team's `MONGODB_URI`. Capture is **forced off when the AutomatedFix patcher starts the app** (it detects `TARGET_REPO` / `LLM_MODE` / … in the environment), so replays never create new incidents.

**Every clickable element needs a `data-testid`.** The patcher replays actions by clicking `target` selectors, and `[data-testid="..."]` is the only kind that stays stable. Add `data-track="Readable label"` to control the human label.

### Incident document (`hackuta.incidents`), the shape AutomatedFix reads

```js
{
  _id: 'incident-0042', incidentId: 'incident-0042',   // counter in hackuta.counters { _id: 'incident', seq }
  status: 'open',              // then the patcher sets: reproducing → patching → verifying → fixed | failed | not_reproducible
  createdAt, route: 'POST /api/cart/promo',
  error: { message: 'TypeError: Reduce of empty array…', name, stack, file: 'server/src/services/pricing.js', line: 15 },
  actions: [                   // the user's last 15 actions, oldest first
    { t: 1794690435150, type: 'click', target: '[data-testid="promo-apply"]', value: null, url: '/cart', label: 'Apply promo code' },
    { t: …, type: 'input', target: '[data-testid="promo-input"]', value: 'MAVS20', url: '/cart', label: 'Promo code' },
    { t: …, type: 'navigate', target: null, value: null, url: '/cart', label: 'Cart · Mavs Merch' },
  ],
  request: { method, path, query, body, headers: { 'content-type', 'user-agent', 'x-session-id' }, sessionId },
  fingerprint, occurrences, lastSeenAt, updatedAt, source, topFrame, repo: { url, commit, branch }, app,
  fix: { … }, summary: { … }   // written later by the patcher and the dashboard
}
```

Repeat crashes of the same bug while it is `open`/`reproducing`/`patching`/`verifying` only bump `occurrences`: five clicks on "Apply" give one incident and one PR.

### Check that the actions reach MongoDB

```bash
cd server
npm run check-actions            # newest incident: lists every stored action and flags problems
npm run check-actions incident-0042   # a specific incident
```

Or open `server/scripts/check-actions.mongodb.js` in VS Code with the MongoDB extension connected and click Run.

### Scripts (run inside `server/`)

```bash
npm run check-actions                     # show the stored actions of the newest incident
npm run reset-demo                        # delete incidents, next ID = incident-0042, check bugs still crash on main
npm run reset-demo -- --check-only        # only check that the bugs are still there
npm run seed-incident                     # backup demo incident (bug 1, 15 replayable steps)
npm run seed-incident -- --out seed.json  # same incident as a JSON file, no database needed
npm run mock-webhook                      # optional: fake webhook receiver on :4000
npm run retry-webhook incident-0042            # optional: re-send a webhook (only if WEBHOOK_URL is used)
```
