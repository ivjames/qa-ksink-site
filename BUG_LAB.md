# Bug Lab

This branch intentionally contains defects for the external QA bot to catch.
Running the bot against `main` should pass; running it against this branch
(deployed at qa-bugs.lab980.com) should fail the checks below. The site must
still load and be broadly usable — every defect is a subtle regression, not
an outage.

## Seeded regressions — intentional-regression-set-002

### Build info

1. Build info reports the intentional regression profile (marker, not a bug).

### Authentication (backend/app/main.py)

2. Login accepts ANY password for the viewer account (`viewer@example.com`).
3. `/api/auth/me` accepts any `Bearer` prefix, not just `Bearer demo-token-*`.
4. `/api/auth/me` falls back to returning the ADMIN user for an unknown
   token instead of rejecting it with 401 (privilege-escalation flavor).

### Products API (backend/app/main.py)

5. Search is case-SENSITIVE (`instr` instead of lowered `LIKE`) — searching
   `anvil` no longer finds `Anvil`.
6. Search strips apostrophes from the query — searching `Foo's` matches
   nothing (the stored name still has the apostrophe).
7. Search no longer matches the `status` field.
8. Invalid `sort` values are silently accepted (falls back to `id`) instead
   of being rejected with 422.
9. `total` reports the number of rows on the CURRENT page, not the true
   filtered count — wrong whenever results span multiple pages.
10. Create rounds `price` to a whole number (`round(price)` not
    `round(price, 2)`) — 49.99 is stored as 50.
11. Update silently ignores `stock` — the column is dropped from the UPDATE
    statement, so stock changes never persist.
12. Delete returns HTTP 200 with a body instead of 204 No Content.

### Forms (backend/app/main.py)

13. Email validation is gutted — any string passes (no `@`/`.` check).
14. The `terms` accepted-check is gone — `terms: false` submits fine.
15. Quantity minimum dropped from 1 to 0 — zero-quantity orders accepted.
16. Currency normalization subtracts a fudge factor before rounding
    (`round(x - 0.0049, 2)`) — e.g. 10.005 comes back 10.0.

### Async (backend/app/main.py)

17. `/api/slow` reports `delayMs` 250ms higher than the actual delay.

### UI copy / status (frontend/src/main.ts)

18. Login success message renders `Signed in as undefined` (reads
    `result.role` instead of `result.user.role`).
19. Grid status is off by one: `Loaded N+1 products` — also breaks the
    zero-result state (`Loaded 1 products` on an empty grid).
20. Async completion copy changed from `Completed after Xms` to
    `Finished in Xms`.

### Accessibility (frontend)

21. `<html>` lost its `lang` attribute (index.html).
22. Main navigation `<nav>` lost its accessible name (`aria-label` removed).
23. Grid search input lost its `<label>` — placeholder-only.
24. Dashboard heading is now an `<h1>`, duplicating the page-level app-title
    `<h1>` (two h1s per page).
25. Nav buttons shrunk below the 24x24 CSS-pixel minimum target size
    (styles.css).
26. Grid/async status text and build info render in low-contrast gray
    (#b3b9c6 on white — fails WCAG AA contrast, styles.css).

## Expected behavior

- Smoke checks (page loads, title, dashboard, build info) still pass.
- Everything listed above should be caught by the bot or the QA engine's
  accessibility/UX pipelines.
