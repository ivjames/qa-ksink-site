# QA KSink Site

Target application for the QA Kitchen Sink demo.

This repo contains the system under test. It deliberately packs many distinct
QA surfaces into one small app so the bot (repo `ivjames/qa-ksink-bot`) has
plenty to exercise — and so the `bug-lab` branch has plenty of places to seed
regressions.

Stack:

- Frontend: Vite + TypeScript (vanilla DOM, hash-routed single page app)
- Backend: FastAPI + SQLite
- QA bot: separate repo, ivjames/qa-ksink-bot

## Demo accounts

All accounts share the passphrase `demo`.

| Email | Role | Can |
|---|---|---|
| admin@example.com | admin | everything, incl. delete products + audit log |
| editor@example.com | editor | create/update products, import CSV, manage orders |
| viewer@example.com | viewer | read-only (browse products/orders) |

## QA surfaces

### Pages (hash-routed: `#/dashboard`, `#/login`, `#/forms`, `#/products`, `#/orders`, `#/upload`, `#/async`, `#/admin`)

- **Dashboard** — live metrics from `/api/stats` (product counts, stock, inventory value, pending orders).
- **Authentication Lab** — login form, session persisted in localStorage, session
  chip + sign-out in the top bar, role-gated navigation (Admin only for admins).
- **Form Gauntlet** — text/email/number/date/currency/select/radio/textarea/checkbox
  fields with per-field client-side validation messages and server-side 422 handling.
- **Data Grid Lab** — search (debounced), status filter, sortable columns with
  `aria-sort`, pagination (page size 5/10/20), CSV export, product detail modal,
  create/edit modal (editor+), delete with confirm dialog (admin only), toasts.
- **Orders Desk** — requires login; place orders (editor+) with live stock
  checks, ship/cancel transitions, status filter. Cancelling restores stock.
- **Upload Lab** — file inspector (.csv/.txt/.png, 64 KiB cap, 400/413/415 errors
  surfaced) and product CSV bulk import with per-line rejection reporting.
- **Async Lab** — slow request with configurable delay + AbortController cancel,
  parallel batch requests, deterministic flaky endpoint with retry loop.
- **Admin Audit** — admin-only audit trail of every write (who/what/when).

All modals implement focus trap, Escape-to-close, focus restore, and
`aria-modal`. Toasts render into an `aria-live` region.

### API

| Endpoint | Notes |
|---|---|
| `GET /api/health`, `GET /api/build-info` | liveness + branch/bugProfile |
| `POST /api/auth/login`, `GET /api/auth/me` | demo tokens `demo-token-<role>` |
| `GET /api/products` | q/category/status filters, sort, direction, pagination |
| `GET /api/products/{id}` | detail |
| `POST/PATCH /api/products` | editor or admin (401 anonymous / 403 viewer) |
| `DELETE /api/products/{id}` | admin only |
| `GET /api/products/export.csv` | same filters as list, streams CSV |
| `POST /api/products/import` | editor+, CSV multipart, per-line validation report |
| `GET /api/orders` | any signed-in role; status filter |
| `POST /api/orders` | editor+; 409 on insufficient stock or archived product |
| `POST /api/orders/{id}/status` | pending→shipped/cancelled only; cancel restores stock |
| `GET /api/stats` | dashboard metrics |
| `GET /api/audit` | admin only |
| `POST /api/upload` | .csv/.txt/.png only (415), 64 KiB cap (413), empty → 400 |
| `POST /api/forms/complex` | validation gauntlet, currency normalization |
| `GET /api/slow?delay_ms=` | latency simulation |
| `GET /api/flaky?key=&fail_times=` | deterministic: fails N times per key, then succeeds |
| `GET /api/error?code=` | forced HTTP errors |
| `POST /api/test/reset` | reseed DB + clear flaky counters (X-QA-Demo-Key header) |

## Local backend

Run from the backend folder:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Local frontend

Run from the frontend folder:

```bash
npm install
npm run dev
```

The dev server defaults `API_BASE` to `http://localhost:8000/api`. Production
builds must set `VITE_API_BASE_URL=/api` (see DEPLOY.md).

## Bug-seeding candidates for `bug-lab`

Each surface above is a place the `bug-lab` branch can seed a regression the
bot should catch. Ideas the new surface area enables:

- Role gates: let viewer delete (403 → 204), or drop the 401 on anonymous writes.
- Orders: skip the stock decrement, allow ordering archived products, allow
  shipped→cancelled transitions, or don't restore stock on cancel.
- Export CSV: drop the header row, ignore active filters, wrong rounding.
- Import: off-by-one line numbers in rejections, accept invalid rows.
- Upload: raise the size cap silently, accept any extension.
- Grid: sort direction inverted, pagination total miscounted, filter+search
  combined with OR instead of AND.
- Modal: focus trap broken (Tab escapes), Escape doesn't close, focus not restored.
- Flaky: succeed one attempt early/late (retry logic looks broken).
- Stats: inventory value uses price+stock instead of price*stock.
- Audit: writes missing from the log, actor recorded as wrong user.
