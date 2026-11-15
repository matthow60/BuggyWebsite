# Mavs Merch Store (buggy demo target)

A small UTA Mavs merch store built with Node and Express plus plain HTML/JS. It has **five deliberate server crashes**, used for the HackUTA auto-patcher demo.

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
| 4 | `POST /api/checkout/place` | `contact.js` | `TypeError: Cannot read properties of undefined (reading 'trim')` |
| 5 | `POST /api/cart/shipping` | `shipping.js` | `RangeError: Invalid time value` |

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

# 4. Place an order with the email left blank (email omitted; crashes even with an empty cart)
curl -X POST localhost:3000/api/checkout/place -H "content-type: application/json" \
  -H "x-session-id: repro-4" -d '{"name":"Maverick"}'

# 5. Delivery estimate for a ZIP it doesn't know: outside Texas, malformed ("abc"), or blank
curl -X POST localhost:3000/api/cart/shipping -H "content-type: application/json" \
  -H "x-session-id: repro-5" -d '{"zip":"10001"}'
```

### Reproduce in the UI

1. **Cart page** with an empty cart: type `MAVS10` and click **Apply**.
2. **Checkout page**: leave "Friends splitting with you" blank and click **Calculate split**.
3. **Shop page**: on *Mavs Classic Tee*, pick **XXL** (or no size) and click **Add to cart**.
4. **Checkout page** (with something in the cart): leave **UTA email** blank and click **Place order**.
5. **Cart page**: under **Delivery estimate**, type `10001` (any non-Texas ZIP), a bad ZIP like `abc`, or nothing, and click **Estimate**. A Texas ZIP like `76019` works.

A 500 shows a "Something went wrong — our team has been notified." toast, and the full stack is printed in the server console.

Promo codes: `MAVS10` (10% off), `MAVS20` (20% off), `BLUEORANGE` (20% off), `GOMAVS` ($15 off orders of $75 or more).

## Crash reporting → AutoFix engine

```
user clicks → recorder.js keeps the last 15 actions → /api call returns 500
  → crashCatcher.js answers 500, then inserts an incident (status "open") into MongoDB hackuta.incidents
  → the AutoFix engine picks it up, replays the actions, patches, opens a PR
```

| Piece | File | What it does |
|---|---|---|
| Browser recorder | `server/public/sdk/recorder.js` | Keeps the last 15 actions (`navigate`, `click`, `input`, `select`, `check`, `uncheck`, `submit`, `keypress` for Enter) in `sessionStorage` and sends them with every `/api/*` fetch in the `x-autofix-actions` header (JSON). Passwords are recorded as `***`. |
| Crash catcher | `server/src/middleware/crashCatcher.js` | Last Express middleware. Responds 500, then fire-and-forget inserts one incident per crash. Never throws, never delays the response. |
| Helpers | `server/src/capture/` | Config, the shared MongoClient, stack parsing, incident builder, optional webhook. |

**Turning it on.** Copy `server/.env.example` to `server/.env` (or `.env` at the repo root; both are git-ignored) and set `CRASH_REPORT_MONGODB_URI` to the Atlas connection string.
Reporting is off when that variable is empty **or when `AUTOFIX_REPLAY` is set**. It deliberately does not read `MONGODB_URI`: the engine passes its own `MONGODB_URI` to the replay copy of this app, and reporting from replays would loop forever.

**Every interactive element needs a `data-testid`.** The engine replays actions by `target` selector, and `[data-testid="..."]` is the only kind that stays stable.

### Incident document (`hackuta.incidents`)

```js
{
  incidentId: 'incident-1794697366281-ow9w',
  status: 'open',                       // the engine only picks up "open"
  createdAt: Date,
  route: 'POST /cart/promo',            // `${req.method} ${req.route?.path ?? req.path}`
  error: {
    message: 'Reduce of empty array with no initial value',
    stack: 'TypeError: ...',            // raw Node stack
    file: 'server/src/services/pricing.js',   // top in-repo, non-node_modules frame
    line: 15
  },
  actions: [                            // last 15, oldest first
    { t: 1794697360000, type: 'input', target: '[data-testid="promo-input"]', value: 'MAVS10', url: 'http://localhost:3000/cart' },
    { t: 1794697361000, type: 'click', target: '[data-testid="promo-apply"]', value: null, url: 'http://localhost:3000/cart' }
  ],
  request: { method: 'POST', path: '/api/cart/promo', body: { code: 'MAVS10' }, headers: { 'content-type': 'application/json' } }
}
```

### Scripts (run inside `server/`)

```bash
npm run check-actions                     # show the stored actions of the newest incident and flag problems
npm run check-actions <incidentId>        # a specific incident
npm run reset-demo                        # delete all incidents, check the bugs still crash on main
npm run reset-demo -- --check-only        # only check that the bugs are still there
npm run seed-incident                     # backup demo incident (bug 1, 15 replayable steps)
npm run seed-incident -- --out seed.json  # same incident as a JSON file, no database needed
npm run mock-webhook                      # optional: fake webhook receiver on :4000
npm run retry-webhook <incidentId>        # optional: re-send a webhook (only if WEBHOOK_URL is used)
```

Or open `server/scripts/check-actions.mongodb.js` in VS Code with the MongoDB extension connected and click Run.
