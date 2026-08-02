# Bug Lab

This branch intentionally contains defects for the external QA bot (repo
`ivjames/qa-ksink-bot`) and the qa-engine repo pipeline to catch. Running the
bot against `main` should pass; running it against this branch (deployed at
qa-bugs.lab980.com) should fail the checks below. The site must still load
and be broadly usable — every defect is a subtle regression, not an outage.

Rebuilt from the expanded `main` (roles, orders, files, async, audit). Where
a bug from set-002 still applied it was re-anchored; the rest are new-surface
regressions from the "Bug-seeding candidates" list in README.md.

## Seeded regressions — intentional-regression-set-003

Bot tests that catch each bug are named in parentheses; "engine" marks bugs
aimed at the qa-engine repo pipeline (diff review vs main) rather than any
current bot assertion.

### Build info

1. `bugProfile` reports `intentional-regression-set-003`; `APP_BRANCH`
   defaults to `bug-lab` (marker, not a bug).

### Authentication & roles (backend/app/{main,auth}.py, frontend)

2. Login accepts ANY password for the viewer account (engine).
3. Token check accepts any `Bearer` prefix, and an unknown token falls back
   to the ADMIN user instead of 401 — privilege escalation via garbage
   tokens, and it feeds every role gate via `current_user` (engine).
4. Product DELETE is opened to editors (was admin-only) and returns
   HTTP 200 with a body instead of 204
   (test_products_create_update_delete_contract).
5. UI: the grid shows Edit controls to viewers — the client role gate lists
   viewer as an editing role; the server still 403s
   (test_viewer_sees_no_write_controls_in_grid).
6. UI: the Admin nav entry appears for ANY signed-in user, not just admins
   (test_admin_nav_hidden_for_viewer).

### Products API (backend/app/main.py)

7. Search is case-SENSITIVE (`instr` instead of lowered `LIKE`), strips
   apostrophes from the query, and no longer matches `status`
   (test_products_support_search, test_products_support_case_insensitive_search,
   test_products_support_special_character_search, grid UI search tests).
8. Invalid `sort` values are silently accepted (fall back to `id`) instead
   of 422 (test_products_reject_invalid_sort).
9. `total` reports the CURRENT page's row count, not the filtered total —
   also collapses the grid's pagination to one page
   (test_products_paginate, test_grid_pagination_controls).
10. Create rounds `price` to whole dollars (`round(price)`) (engine).
11. Update silently ignores `stock` — dropped from the UPDATE statement
    (test_products_create_update_delete_contract).

### Orders (backend/app/main.py)

12. Placing an order decrements stock by 1 regardless of quantity
    (test_order_lifecycle_updates_stock).
13. Cancelling an order no longer restores stock
    (test_order_lifecycle_updates_stock).
14. Shipped orders may be cancelled — the transition table gained
    `shipped -> cancelled` (engine).

### Files: export / import / upload (backend/app/main.py)

15. CSV export ignores the active filters — always exports every product
    (test_export_csv_respects_filters).
16. CSV import reports rejected line numbers off by one (starts at 1, the
    header row) (test_import_reports_per_line_validation).
17. Upload size cap silently raised 10x — 64 KiB files no longer 413
    (test_upload_rejects_oversize_file).

### Forms (backend/app/main.py)

18. Email validation is gutted — any string passes
    (test_complex_form_rejects_invalid_email).
19. The `terms` accepted-check is gone
    (test_complex_form_rejects_terms_false).
20. Quantity minimum dropped from 1 to 0
    (test_complex_form_rejects_quantity_below_minimum).
21. Currency normalization subtracts a fudge factor before rounding
    (`round(x - 0.0049, 2)`) — 10.005 comes back 10.0
    (test_complex_form_rounds_currency_correctly,
    test_ui_form_submission_shows_normalized_amount,
    test_form_submission_normalizes_currency).

### Async / flaky (backend/app/main.py)

22. `/api/slow` reports `delayMs` 250ms higher than the actual delay
    (test_async_lab_shows_completion — UI shows "Completed after 1000ms").
23. `/api/flaky` recovers one attempt EARLY (`<` instead of `<=`) — retry
    accounting is wrong and a fresh cycle starts after the early success
    (test_flaky_endpoint_is_deterministic, test_flaky_ui_recovers_with_retry).

### Stats / audit (backend/app/main.py)

24. Dashboard inventory value sums `price + stock` instead of
    `price * stock` (engine).
25. Product deletions are no longer written to the audit log (engine).

### UI copy / status (frontend/src/pages/products.ts)

26. Grid status is off by one: `Loaded N+1 products` — also breaks the
    zero-result state (test_grid_shows_empty_result_state_count,
    test_grid_filters_by_product_name,
    test_admin_creates_and_deletes_product_via_ui).

### Accessibility (frontend)

27. `<html>` lost its `lang` attribute (test_page_has_language_and_title).
28. Main navigation `<nav>` lost its accessible name
    (test_navigation_has_accessible_name).
29. Grid search input lost its `<label>` — placeholder-only
    (test_form_controls_have_labels[grid]).
30. Dashboard heading is an `<h1>`, duplicating the page-level app-title
    `<h1>` (test_each_view_has_programmatic_heading[dashboard]).
31. Nav buttons shrunk below the 24x24 CSS-pixel minimum target size
    (test_interactive_targets_are_at_least_24px, all views).
32. Grid/async status text and build info render in low-contrast gray —
    #b3b9c6 on white fails WCAG AA
    (test_visible_text_meets_minimum_contrast, all views).
33. Modal dialogs no longer trap keyboard focus — Tab walks out of the
    dialog; Escape still closes it
    (test_product_detail_modal_focus_trap_and_escape).

## Expected behavior

- Smoke checks (page loads, title, build info) still pass.
- Login, orders placement/shipping, uploads, imports, dashboards, and the
  admin audit page all still broadly WORK — the defects above are the only
  deviations.
- The qa-engine repo pipeline run as `ivjames/qa-ksink-site` `bug-lab` vs
  `main` reviews exactly this seeded diff.
