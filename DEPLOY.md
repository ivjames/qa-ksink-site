# Deploying qa-ksink-site

This repo is the QA Kitchen Sink target application. Two deployments run from
it on the shared lab980 droplet, differing only by which branch they serve:

| Site                   | Branch    | Purpose                          |
|------------------------|-----------|----------------------------------|
| `qa-demo.lab980.com`   | `main`    | clean build, expected to pass    |
| `qa-bugs.lab980.com`   | `bug-lab` | seeded regressions (see BUG_LAB.md) |

Both follow the same shape. It differs from the default lab980 Node/pm2
convention in two ways, so read this before redeploying:

- The git checkout lives in a **`source/` subdirectory** of the site dir
  (`/var/www/<fqdn>/source`), not the site dir itself.
- The backend runs under **systemd**, not pm2 (`pm2 list` will not show it).
  The frontend is a static Vite build served directly by nginx.

## Per-site layout

| | `qa-demo` | `qa-bugs` |
|---|---|---|
| Site dir | `/var/www/qa-demo.lab980.com` | `/var/www/qa-bugs.lab980.com` |
| Checkout | `<site>/source` | `<site>/source` |
| Branch | `main` | `bug-lab` |
| Frontend root (nginx `root`) | `<site>/source/frontend/dist` | `<site>/source/frontend/dist` |
| Backend | uvicorn on `127.0.0.1:8010` | uvicorn on `127.0.0.1:8020` |
| systemd unit | `qa-demo-api.service` | `qa-bugs-api.service` |

nginx serves the built frontend from `.../frontend/dist` and proxies
`location /api/` to the backend port (`proxy_pass http://127.0.0.1:80X0/api/;`).
The backend uvicorn is launched from `<site>/source/backend` under its own
`.venv`; check the exact interpreter/flags with `systemctl cat <unit>`.

## Frontend build gotcha (the one that looks like "site not loading")

`frontend/src/main.ts` defaults `API_BASE` to `http://localhost:8000/api` for
local dev. The **deployed** bundle must call the relative `/api` that nginx
proxies instead. Build with the base set explicitly (or via a `frontend/.env`
that sets `VITE_API_BASE_URL=/api`):

```bash
VITE_API_BASE_URL=/api npm run build
```

If this is omitted, the site loads but every API call goes to `localhost:8000`
and silently fails — the grid never populates and login does nothing.

## Redeploy (run as root on the droplet)

Replace `<fqdn>`/`<branch>`/`<unit>` with the row from the table above. Example
shows `qa-bugs`.

```bash
FQDN=qa-bugs.lab980.com
BRANCH=bug-lab
UNIT=qa-bugs-api
S=/var/www/$FQDN/source

# 1. Sync the checkout to the branch tip.
#    reset --hard intentionally discards any drift/hand-edits made on the box,
#    so the running site matches the branch exactly (avoids the "build-info
#    says X but behavior says Y" split we hit once).
cd "$S"
git fetch origin "$BRANCH"
git checkout "$BRANCH" 2>/dev/null || git checkout -B "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH"
git log --oneline -1

# 2. Rebuild the frontend into the dir nginx serves (source/frontend/dist).
cd "$S/frontend"
npm install
VITE_API_BASE_URL=/api npm run build   # or rely on frontend/.env if present

# 3. Refresh the backend venv and restart the service.
#    (Confirm the venv path with `systemctl cat $UNIT` if unsure.)
cd "$S/backend"
[ -d .venv ] && .venv/bin/pip install -r requirements.txt
systemctl restart "$UNIT"
systemctl --no-pager status "$UNIT" | head -5
```

`systemctl restart` briefly drops the backend; a request in that ~1s window
gets a **502 from nginx** — expected, not a failure. Confirm with the smoke
test below rather than the restart-window curl.

## Smoke test

Generic (both sites):

```bash
curl -s https://<fqdn>/api/build-info; echo        # app/branch/version/bugProfile
curl -s https://<fqdn>/api/health                  # {"status":"ok"}
```

`qa-bugs` specifically — these prove the **seeded-bug** code is live, which
`build-info` alone cannot (build-info can be right while the rest is stale):

```bash
curl -s https://qa-bugs.lab980.com/api/build-info; echo
#   bugProfile: intentional-regression-set-003

curl -s "https://qa-bugs.lab980.com/api/products?q=anvil" \
  | python3 -c "import json,sys; print('items:', len(json.load(sys.stdin)['items']))"
#   0  (case-sensitive-search regression; clean main returns 1)

curl -s -o /dev/null -w '%{http_code}\n' -X POST https://qa-bugs.lab980.com/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"viewer@example.com","password":"WRONG"}'
#   200 (viewer-any-password regression; clean main returns 401)

curl -s "https://qa-bugs.lab980.com/api/slow?delay_ms=100"; echo
#   delayMs: 350 (async overreport)
```

Then load the page in a browser: the grid should populate (confirms the
`VITE_API_BASE_URL=/api` build), and on `qa-bugs` the seeded UI/accessibility
regressions are visible (low-contrast status text, missing labels, etc.).

## Notes

- **systemd, not pm2.** Manage the backend with
  `systemctl restart|status qa-<site>-api` and read logs with
  `journalctl -u qa-<site>-api -n 50 --no-pager`. It will never appear in
  `pm2 list`.
- **APP_BRANCH.** `build-info` reports `branch` from the `APP_BRANCH` env
  (default is the branch name baked into `main.py`). If the unit sets it,
  `systemctl cat` shows it; the `bugProfile` string is fixed per branch and
  does not depend on it.
- **First-time provision** used the shared `provision-site` tool (nginx vhost
  + TLS) with the static-root + `/api` proxy wired by hand and a systemd unit
  per site; this repo ships no provision script of its own.
