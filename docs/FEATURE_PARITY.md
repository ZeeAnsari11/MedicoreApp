# Feature parity checklist (web → Android)

Source of truth: `Medicore` repo @ `ae87687` (branch `Creating_Android_App`), audited from source (api controllers, web pages, hooks).
Status: ⬜ not started · 🟨 partial · ✅ done **and tested**. A module is only ✅ when every row in it is ✅.
Android location rule: `src/features/<module>`; routes in `src/app`.

## How this document is maintained
Every module gets an inventory of what the **web app** has (screens, menu items, filters, form fields, dialogs, actions, permissions, validations, backend rules), read from the web and backend source, with four separate status columns: **Implemented** · **Automated tests** (jest, mocked `fetch`: proves requests and UI states, not backend behaviour) · **Live API** (run against a real backend) · **Device** (run on an emulator or phone). Nothing is ✅ because a screen exists, and a module stays 🟨 until every row is ✅ in all four columns. Features found later on the web are added as new rows. Backend limitations and deliberate differences are listed per module, never silently dropped.

## Foundation
| Capability | Web source | Status | Notes |
|---|---|---|---|
| Login (username/password, show/hide) | `/login` | 🟨 | Implemented; needs on-device test against live API |
| Org code on 409 | `/login` | 🟨 | Implemented + same flow; untested live |
| Session persist (SecureStore), 401 → sign-in | `lib/api-client.ts` | 🟨 | Unit-tested (api client + store); no refresh endpoint exists on backend |
| Permissions from `/auth/me`, admin bypass | `use-permissions` | ✅ | Unit-tested |
| `X-Branch-Id` on non-POST only | `lib/api-client.ts` | ✅ | Unit-tested |
| Admin branch filter | `BranchFilter` | 🟨 | Chips on dashboard; not yet on every list screen |
| Permission-aware navigation | `nav-config.ts` | 🟨 | Mechanism done; only built modules are listed (Administration items tested in `admin-nav`) |
| Settings (read-only + logout) | `/settings` | 🟨 | Done; untested live |
| Dark mode | `use-dark-mode` | 🟨 | Follows system theme (web has a manual toggle — add toggle) |
| Impersonation banner/exit | `ImpersonationBanner` | ⬜ | with Platform module |
| No-modules empty state | AppShell | 🟨 | On dashboard |

## Dashboard — 🟨
Done: 9 KPI cards, finance KPIs, by-branch list, pull-to-refresh, client-day `todayStart/End`.
Missing: KPI deep links, date-range presets, sales report (cards, trend chart, category pie, top products, CSV), inventory report (cards, charts, table, CSV), live SSE updates + 15s poll fallback.

## Catalog — 🟨 (implemented; verified by automated tests only, not yet on a device/emulator)
Status key here: ✅ = implemented and exercised by unit/integration tests **and** a live run against the real API; "device" verification (emulator walkthrough) is still outstanding for every row, so the module stays 🟨.

| Area | Feature | Status | Evidence / notes |
|---|---|---|---|
| Manufacturers | List, search, branch filter, sort, load-more | ✅ | client-side (API list is unpaginated); `client-list.test` |
| | Create / edit (diff-only PATCH) / activate-deactivate with confirm | ✅ | `module-api`, `forms`, live |
| | "Save as Manufacturer + Vendor" (`alsoCreateVendor`, needs `vendors:create`) | ✅ | live: vendor appears in `/vendors` |
| | Duplicate name → 409 shown verbatim | ✅ | live |
| Vendors | List, search, branch filter, sort, load-more | ✅ | |
| | Create (branch field, create only) / edit / status with confirm; duplicate company → 409 | ✅ | live |
| | "View ledger" row action | ✅ | opens `/accounting/vendor-ledger`; disabled without `acc_vendor_ledger:read`; automated test `accounting-entrypoints`; not live-API or device tested |
| Vendor pricing | Vendor list + reverse product search, linked products per vendor | ✅ | `/vendor-products`, `/search`, `/summary`; live |
| | Link (409 on duplicate), edit price / preferred / active, unlink (204) with confirm | ✅ | live; web has no unlink confirm (deliberate mobile addition) |
| | Add product from vendor view | 🟨 | product branch locked to the vendor's branch |
| Categories | List + inline create from the product form | ✅ | live |
| Products | List, name/generic/barcode search, manufacturer + category filters, sort, load-more | ✅ | live (`?search=`) |
| | Create with TP≥CP and RP≥TP checks (client and server messages), barcode unique per branch (409) | ✅ | `products-schema`, live |
| | Edit; price fields omitted without `products:edit_prices` (server returns 403 if forced) | ✅ | live with a restricted role |
| | Discontinue / reactivate with confirm | ✅ | live |
| | Inline create of manufacturer, category and vendor; vendor required and linked at CP when `vendors:create` | ✅ | `forms.test` |
| | Vendor pricing section on the product form (hidden without `vendors:read`) | ✅ | |
| | Barcode labels: Code128/EAN-13, 1–100 labels, product id fallback, print via `expo-print` | 🟨 | encoding/HTML tested (`barcode.test`); print dialog not run on a device |
| Cross-cutting | Branch rules (branch users pinned, foreign `X-Branch-Id` → 403, admin create needs `branchId`) | ✅ | live |
| | Duplicate-submit guard; mutations never auto-retried; timeouts say "may have been saved" | ✅ | `submit-guard.test` |

Deviations from web: empty min-stock is omitted instead of sent as 0; vendor pricing is hidden without `vendors:read`; unlink asks for confirmation.

## Customers — 🟨 (implemented; automated + live-API verified, not yet run on a device/emulator)
| Area | Feature | Status | Evidence / notes |
|---|---|---|---|
| List | Search (name/phone/address/branch), sort (name, outstanding, type), type filter (all/retail/dealer), "owes money" filter, branch filter, load-more, pull-to-refresh | ✅ | client-side (API list is unpaginated); `customers.test`, `client-list.test` |
| | Ledger-derived `outstandingBalance` shown per customer (never `totalDue`) | ✅ | live: 0 → 500 after an opening balance |
| Create / edit | Name ≥2, optional phone/address, dealer switch, required Branch field on create only (never prefilled from the filter, locked for branch users) | ✅ | `customers.test`, live (403 for a foreign branch) |
| | Edit sends the **full** field set (see backend gap 1) | ✅ | live |
| Delete | Confirm dialog; backend 409 "outstanding balance" shown verbatim, never reported as success | ✅ | live |
| Details | Customer info + balance | ✅ | no equivalent web page; built from the list + ledger endpoints |
| Ledger | Period presets (today / this month / last month / this year), summary (opening, invoiced, received, returns, voids, advances, adjustments, closing), paged rows with running balance | ✅ | `GET /accounting/customers/:id/ledger`, needs `acc_customer_ledger:read` (403 otherwise, section hidden); live |
| Payment history | Payments, advances, returns and voids appear as ledger rows (document type badge) | ✅ | read-only here; recording and voiding payments is in Accounting → Payments (built, see Accounting) |
| | Ledger export (CSV / PDF / statement) | ✅ | lives on the Accounting → Customer Ledger page (as on the web), with `acc_customer_ledger:export`; the customer detail screen has no export |
| | Party balances list (`/accounting/customers/balances`, search/sort/paging) | ✅ | Accounting → Customer Ledger → "All customers"; the Customers list gets a "View ledger" action (`acc_customer_ledger:read`) |

## Inventory — 🟨 (implemented; automated + live-API verified, not yet run on a device/emulator)
| Area | Feature | Status | Evidence / notes |
|---|---|---|---|
| Overview | Per-product rollup: on hand, unit, barcode, low-stock / out-of-stock / expired badges, nearest expiry with days-left badge, vendor prices (needs `vendors:read`) | ✅ | live; `inventory.test` |
| | Search, sort (product, on hand, nearest expiry), six stock-status filters (same rules as the web), branch filter | ✅ | `inventory.test` |
| Batches | Batch list per product and branch (batch #, expiry + badge, quantity, purchase/sale price); emptied batches hidden like the web | ✅ | live |
| Adjustments | Add / subtract / set, new batch creation, optional prices and reason, branch field, product list per branch, confirm dialog, duplicate-submit guard | ✅ | live: 400 "not enough quantity", "does not exist", "different expiry date"; 403 without `inventory:adjust`; stock only changes on backend confirmation |
| Expiry tracking | Expiring-stock screen (30/60/90 days, includes already expired) | ✅ | `GET /inventory/expiring` exists in the API but is not used by the web page; live |
| Transfers | List (sent + received), detail, create (source/destination branch, batch lines with quantity, note), confirm dialog | ✅ | API-only in the backend (no web UI). Live: stock moved atomically, number `TR-MN-000001`, refusals move nothing, 403 without `inventory:adjust` |
| | Transfer PDF slip (`/inventory/transfers/:id/pdf`) | ✅ | share + print via the shared file helper; live: backend returns a real `%PDF` |
| Movements / history | Stock movement history | ⬜ **backend gap** | movements are written (purchase, sale, transfer, adjustment) but **no endpoint exposes them**; not invented |

### Backend gaps found in this phase (documented, unchanged)
1. `PATCH /customers/:id` returns **500** for a partial body (the service assigns every DTO property, undefined included, onto the document → "name is required"). The web always sends all four fields, so the app does too. A backward-compatible fix would be to skip `undefined` values in `updateCustomer`.
2. No stock-movement read endpoint, so no movement history screen.
3. `GET /inventory` lists every product of the tenant (not only the branch's), so a transferred product appears once per branch copy, with zero quantity where the branch has none.
4. Stock transfers have no shared type; the app declares `StockTransfer` locally (the API returns the raw document, id = `_id`).
5. Customers/inventory lists are unpaginated (search, sort and paging run on the device).

Deviations from web: Adjust Stock asks for confirmation; the expiry date is typed as `YYYY-MM-DD` (no date picker yet); transfers and the expiring screen are new (the web has no UI for them).

## Sales — 🟨 (implemented; automated + live-API verified, not yet run on a device/emulator)
| Area | Feature | Status | Evidence / notes |
|---|---|---|---|
| New sale | Branch (locked for branch users), customer picker (walk-in, create-new inline), Order Booker (own, or any with `sales:book_for_others`), payment method, paid / partial / unpaid | ✅ | `sale-form.test`, live |
| | Product search, stock shown per product (sellable only: expired/empty batches excluded), FEFO by default, optional manual batch with spill-over to the next batches | ✅ | `sales-logic.test`; live: FEFO took B1, manual took B2 |
| | Price, discount (field locked without `sales:discount`), tax, last-price hint for the chosen customer | ✅ | live; unit price is only sent when typed or taken from the last invoice, otherwise the backend resolves it |
| | Totals | ✅ | shown as an **estimate** only; the server's subtotal, discount, tax and total are what the invoice shows (live: grandTotal = server price × qty) |
| | Placement | ✅ | confirm dialog, duplicate-submit guard, never retried, success toast only after a 2xx. Live: three simultaneous presses deducted stock once. A failed placement keeps the form |
| List | Server paging (20/page), search (invoice / customer), customer, Order Booker (`sales:view_all`), payment, return status and date filters, branch filter | ✅ | `sales-api.test` (query params), live |
| | Sort | ⬜ **backend gap** | the endpoint has no sort parameter (newest first) |
| Detail | Items with batches, totals, payments, returns, lock reason, outstanding | ✅ | live |
| | Invoice PDF: share and print | ✅ | live: backend returns a real `%PDF`; shared file helper |
| Edit | Unpaid invoices only (the server's `isEditable`), re-allocated by the backend, invoice number unchanged | ✅ | live; a locked invoice returns 409 and the server reason is shown |
| Payments | Record payment (amount ≤ outstanding, method, reference) | ✅ | live; shown with `sales:record_payment` (the web ties it to `sales:return`, an existing web quirk) |
| Returns | Partial return per batch with Restock / Damaged / Expired, reason, notes, settlement (reduce balance or refund + method), return-everything-left | ✅ | live: stock restored, return recorded, over-return refused (400). Amounts are computed by the backend |
| Void | Void an invoice (restores stock, reverses entries) with a destructive confirm | ✅ | live; needs `sales:void`. The web has no void button; the API supports it |
| Reassign | Reassign Order Booker | ✅ | admin only, as the backend enforces |
| Security | Branch users pinned to their branch; foreign branch → 403; no `sales:void`/`update` → 403 | ✅ | live |
| Numbers | New sales are **PENDING orders** (`PO-…`), exactly like the web: no invoice number, PDF or list entry until confirmed in **Process Orders** | ⚠️ by design | the app never invents an invoice number; confirmation is done by the backend through the Process Orders module (below) |

### Reusable file layer (added in this phase)
`src/lib/files.ts` + `useDocumentFile()`: authenticated download → cache → system share sheet or print. Unit-tested with mocked Expo modules; used for invoice and transfer-slip PDFs, ready for Purchases, Accounting exports, customer statements.

### Backend gaps / limits found in this phase (documented, unchanged)
1. No sort parameter on `GET /sales`.
2. `GET /sales` excludes pending orders, and there is no "my pending orders" read for a booker.
3. The payment endpoint takes a cumulative amount and a client-chosen status, so the app derives PARTIAL/PAID from the outstanding amount like the web.
4. No idempotency key on `POST /sales`: duplicate protection is a client guard only.
5. Confirmed-sale flows (edit/pay/return/void/PDF) were exercised live by confirming through the backend's Process Orders endpoint as test setup; the app screen for that now exists (see Process Orders), but those live runs predate it.

Not verified: on-device behaviour of share/print (needs an emulator/device), and a sale created by an Order Booker without `sales:view_all` was only tested for create/403 paths.

## Process Orders — 🟨 (implemented; automated-tested only; **not** live-API tested, **not** device tested)
Source of truth: web `apps/web/src/app/(app)/sales/process-orders/page.tsx`, hooks `use-sales.ts`, backend `sales.controller.ts` / `sales.service.ts` (`confirmOrders`, `rejectOrders`), read from source.
Permission: only `process_orders:read` (gates viewing **and** confirm/reject; admins bypass; not granted by any `sales:*` key).

| Area | Feature | Implemented | Automated tests | Live API | Device |
|---|---|---|---|---|---|
| Access | Screen shows Loading (never "No access") while `/auth/me` loads; error + retry if `/auth/me` fails; "No access" only for a user who really lacks `process_orders:read` (no `/sales/orders*` calls made) | ✅ | ✅ screen tests | ⬜ | ⬜ |
| Nav | "Process Orders" under Operations, visible with `process_orders:read` (not with `sales:*` alone) | ✅ | ✅ `process-orders-logic.test.ts` | n/a | ⬜ |
| Day + branch | Date defaults to the Pakistan (UTC+5) day like the web `karachiToday()`, validated locally (real calendar date, not in the future); admin `BranchFilter`; branch users pinned to their branch | ✅ | ✅ | ⬜ | ⬜ |
| Booker summary | `GET /sales/orders/summary` → bookers with counts; empty state; error + retry | ✅ | ✅ | ⬜ | ⬜ |
| Order list | `GET /sales/orders` per booker (oldest first); select one / select all (checked, mixed, unchecked); selection pruned to orders still listed; tap an order → existing sale detail screen | ✅ | ✅ | ⬜ | ⬜ |
| Preview | `GET /sales/orders/preview`, fetched only while the preview is open | ✅ | ✅ (query only enabled when open) | ⬜ | ⬜ |
| Confirm | `POST /sales/orders/confirm` `{saleIds, branchId?}`; web dialog wording; success toast uses the backend's `processed` count, only after a 2xx; selection cleared on success, kept on error | ✅ | ✅ | ⬜ | ⬜ |
| Reject | `POST /sales/orders/reject`, destructive confirm; stock restoration is done by the backend only | ✅ | ✅ (request/response handling only) | ⬜ | ⬜ |
| Safety | One request per action, never retried; `branchId` in the body (POSTs carry no `X-Branch-Id`); double press → one request; 409/403/500/network shown verbatim with no success toast; lists refetched afterwards (also after a timeout, which may have been processed) | ✅ | ✅ | ⬜ | ⬜ |

Nothing is computed in the app: invoice numbers, journal entries and stock restoration all happen in the backend transaction. "Automated tested" means jest with a mocked `fetch`; it proves the requests and UI states, **not** the backend's behaviour. The live test for this module (confirm → invoice number issued, reject → stock restored) has **not been written or run** (no `LIVE_API_URL` in this environment).

### Verified against the web/backend source
- Confirm (one Mongo transaction): per-branch invoice number from the sequence (`PO-…` → `0001`), status CONFIRMED, sale journal entry posted; **no stock change** (stock was deducted when the order was booked).
- Reject (one transaction): batch quantities restored with `ADJUSTMENT_ADD` movements, the sale is **hard-deleted**.
- Bulk is all-or-nothing; any stale id → 409 "Some of the selected orders are no longer pending — refresh and try again".

### Backend limitations (documented, unchanged)
No idempotency key (a repeat gets 409); one stale id fails the whole batch; `saleIds` not validated as Mongo ids (max 500); response is only `{processed}` (no invoice numbers); reject is a hard delete with no REJECTED status or audit row besides the stock movements; the same permission gates viewing and mutating; the order-booker own-orders scope is not applied to these endpoints; the date regex accepts non-calendar dates; the web has no tests for confirm/reject (the backend has only pure-helper specs), so there is no existing suite to compare against.

### Test results (actual, this environment)
- Final run, after the last code change: `npx tsc --noEmit` exit 0 · `npx expo lint` exit 0 · `npx jest` 18 suites / 164 tests passed, 3 live suites (18 tests) skipped because there is no `LIVE_API_URL` · `npx expo export --platform android` exit 0 · `npx expo-doctor` 20/20 checks passed.
- Process Orders screen suite: 16/16 (includes the `/auth/me` loading and failure cases). No regression in the Sales, auth, permissions, inventory or customers suites (all in the 164).
- Known noise: the "double press" screen test prints React `act()` "overlapping act() calls" warnings (test-harness only; the test passes and no longer leaks into later tests). Two earlier failures were a test-isolation bug in that test, not an app bug.
- **Not done:** live-API verification, emulator or physical-device testing.

## Purchases — 🟨 (implemented; automated-tested only; live suite run against a real backend and passed on 2026-11-16 (row-level Live API cells not yet updated); **not** device tested)
Source of truth: web `apps/web/src/app/(app)/purchases/page.tsx`, `use-purchases.ts`, backend `purchases.controller.ts` / `purchases.service.ts`, read from source.
Permissions: `purchases:read` (list/detail/PDF), `purchases:create`, `purchases:update`, `purchases:return`, `purchases:record_payment`; admins bypass.

| Area | Feature | Implemented | Automated tests | Live API | Device |
|---|---|---|---|---|---|
| Access | Loading (never "No access") while `/auth/me` loads; error + retry if it fails; "No access" only for a user who really lacks the permission (list, new, edit, return all gated; no purchase calls made) | ✅ | ✅ `purchases-screens` | ⬜ | ⬜ |
| Nav | "Purchases" under Operations, needs `purchases:read` | ✅ | ✅ `purchases-nav` | n/a | ⬜ |
| List | Server paging; page size 10/25/50/100/250/500; filters vendor, payment, returns (All/Any/Partial/Full), status, date from/to, PO # search; clear filters; admin `BranchFilter`, branch users pinned; card per purchase with payment / return / status badges; empty, filtered-empty and error+retry states; "New Purchase" needs `purchases:create` | ✅ | ✅ (filter params, paging reset, pinning, empty/error) | ⬜ | ⬜ |
| Form: header | Branch (locked for branch users, read-only on edit; changing it clears vendor and lines), vendor, vendor invoice #, purchase date; "Change vendor?" confirm clears lines | ✅ | ✅ | ⬜ | ⬜ |
| Form: lines | Product list limited to the vendor's active links; price and sale price prefilled from product cost / trade price; last-price hint or "First purchase"; batch, expiry, qty, price, sale price, disc %, tax %; web validation messages shown after the first attempt; committed lines can be edited or removed; running estimate | ✅ | ✅ (`purchase-lines`, form) | ⬜ | ⬜ |
| Form: price decrease | Create-only dialog "Purchase price decreased": Approve & save / Save without updating prices / Cancel → `priceUpdates` | ✅ | ✅ all three paths | ⬜ | ⬜ |
| Form: payment | Create-only Unpaid / Partial / Paid; amount only for Partial | ✅ | ✅ | ⬜ | ⬜ |
| Create | `POST /purchases`, `branchId` in the body (no `X-Branch-Id`), confirm first, one request on double press, form kept on error, reset after success, toast (incl. price changes) only after 2xx | ✅ | ✅ | ⬜ | ⬜ |
| Edit | `PATCH /purchases/:id?branchId=` only while `isEditable` (needs `purchases:update`); 409 "locked" leaves the form; other errors keep it | ✅ | ✅ | ⬜ | ⬜ |
| Detail | Items with returned qty, totals, outstanding, payment history, returns list, "Not editable: reason", 403 shown as an error | ✅ | ✅ | ⬜ | ⬜ |
| Record payment | Amount, "Full amount", method Cash / Card / Bank transfer, date, reference; sends the **cumulative** `amountPaid`; over-outstanding message; fully-paid state; form reset after success; double press → one request; server error keeps the amount | ✅ | ✅ | ⬜ | ⬜ |
| Returns | Per-batch rows, select all, qty 1..returnable, reason (Damaged / Expired / Wrong item / Excess / Other), notes, settlement choice (vendor credit / refund + method) only when the return exceeds the outstanding, summary figures; Full return confirm; over-return server error shown, no success toast | ✅ | ✅ (`purchase-returns`, screens) | ⬜ | ⬜ |
| PDFs | PO PDF and per-return slip: share and print through the shared file layer | ✅ | 🟨 request path and filename only; file output not tested | ⬜ | ⬜ |
| Totals / stock / journal | Computed only by the backend (client figures are display estimates) | ✅ | n/a | ⬜ | ⬜ |

### Differences from the web (re-verified against the web and backend source)
- **Record payment gate.** Backend: `PATCH /purchases/:id/payment` needs only `purchases:record_payment`, ignores the sent `paymentStatus` (recalculated from amounts) and rejects a lower cumulative `amountPaid` ("Reducing a recorded payment isn't supported here…"). Web is inconsistent: the payment inputs panel is shown with `purchases:return`, while its "Record payment" button needs `purchases:record_payment`, so a user with only one of them gets a broken panel. Android gates the whole panel by `purchases:record_payment`, which matches the backend; this is a deliberate fix, not parity with the web quirk.
- **Cancel Purchase.** Confirmed: the web hook has `cancelPurchase` / "Purchase cancelled and stock reversed", but **nothing in the web UI calls it** (no button on the list, detail or form); a purchase can only become CANCELLED through the API (`DELETE /purchases/:id`, `purchases:cancel`). Android shows the CANCELLED state (no payment/return actions) and has no cancel button, like the web.
- **`notes` / `paymentTerms`.** Confirmed absent from the web purchase form, detail and hook (the API, DTOs and schema accept them; so does `notes` on the payment DTO). Not an Android omission; neither is sent.
- Android keeps the server order (newest first); the web can also sort the visible page client-side.
- Android passes the purchase's own `branchId` to detail, payments, returns and PDFs instead of the web's "selected branch or none".
- Opening a purchase from a ledger row (the web's `/purchases?open=<id>`) now works: the Accounting ledgers link to `purchases/detail` with the purchase id.

### Backend limitations (documented, unchanged)
No idempotency key on create/payment/return (client guard only) · `GET /purchases` is unpaginated server-side work and list search matches the PO number only · `updatePayment` checks the outstanding outside its transaction · expiry check uses the server-local date on create but UTC on edit · receiving into an existing batch overwrites its prices · the `vendorId` filter is not validated · the seed may lack the cancel / return / record_payment permission rows (not verified).

### Test results (actual, this environment)
- `npx tsc --noEmit` exit 0 · `npx expo lint` exit 0 · `npx jest` 24 suites / 256 tests passed, 4 live suites (23 tests) skipped for lack of `LIVE_API_URL` · `npx expo export --platform android` exit 0 · `npx expo-doctor` 20/20.
- New Purchases suites: `purchase-lines`, `purchase-returns`, `purchases-api` (15), `purchases-screens` (34), `purchases-form` (18, run three times in a row without a failure), `purchases-nav` (3). No regressions in Process Orders, Sales, Inventory, Customers, auth or permissions.
- Test hygiene: RNTL 14 `fireEvent` is async, so presses are awaited, except presses whose handler waits for a dialog or a gated request (those are awaited at the end). The suites no longer print "overlapping act()" warnings.
- **Not done:** `src/__tests__/live/purchases.live.test.tsx` was **run against a live backend on 2026-11-16 and passed** (setup in the Administration test results). No emulator or device testing. PDF share/print output was not exercised.
- Row-by-row comparison with the web is from source reading, not from running the web app side by side.

## Cash Receipt — 🟨 (implemented; automated-tested only; live suite run against a real backend and passed on 2026-11-16 (row-level Live API cells not yet updated); **not** device tested)
Source of truth: web `apps/web/src/app/(app)/sales/cash-receipt/page.tsx`, `hooks/use-cash-receipts.ts`, backend `sales.controller.ts` (routes), `cash-receipts.service.ts`, `payments.service.ts` (`recordQuickPayment`), read from source.
**What it is on the web:** one keyboard-driven entry sheet, not a list/CRUD module. There is no list, detail, edit, delete, status, sort, pagination, export or reprint of saved receipts, and no backend endpoint for any of those.
Permissions: `cash_receipt:read` (page, lookup, PDF), `cash_receipt:create` (save). Default roles Cashier and Order Booker have both. Endpoints: `GET /sales/invoices/lookup?q=&branchId=`, `POST /sales/cash-receipts`, `GET /sales/cash-receipts/:id/pdf?invoiceId=&branchId=`.

| Area | Feature | Implemented | Automated tests | Live API | Device |
|---|---|---|---|---|---|
| Access | Loading (never "No access") while `/auth/me` loads; error + retry if it fails; "No access" without `cash_receipt:read` (no lookup made) | ✅ | ✅ | ⬜ | ⬜ |
| Nav | "Cash Receipt" under Operations, `cash_receipt:read` | ✅ | ✅ | n/a | ⬜ |
| Branch | Branch users pinned; admins choose one branch (no "all"); "Select a branch to enter receipts." and voucher box disabled until chosen; branch locked once the sheet has entries | ✅ | ✅ | ⬜ | ⬜ |
| Voucher lookup | Invoice-number typeahead, 300 ms debounce, lookup scoped to the branch; "Searching..." / "No outstanding invoices found"; paid invoices muted with a "Paid" badge; tap or Enter picks (exact number wins) | ✅ | ✅ | ⬜ | ⬜ |
| Entry | Read-only invoice date; Amount (decimal pad), disabled for a paid invoice ("Already paid"); "Full" fills the balance; "Add"; web validation messages verbatim; tiles Account Balance / S-Invoice Amount / S-I-Received Amount / Balance | ✅ | ✅ (`cash-receipt-sheet`, screen) | ⬜ | ⬜ |
| Sheet | Entries with customer, S-Invoice#, invoice and received amounts, running Cust. Bal. / Final Bal. per customer, editable amount, remove, "Already in sheet", "Entries: n / Total: Rs. x", empty text | ✅ | ✅ | ⬜ | ⬜ |
| Draft | Unsaved sheet (rows, batchId, branch) kept across restarts and restored; cleared on success | ✅ AsyncStorage per tenant **and user** | ✅ | n/a | ⬜ |
| Save | One `POST /sales/cash-receipts` `{batchId, date: today, method: CASH, rows}`; no `branchId` and no branch header (backend takes the branch from the invoices, like the web); rows re-validated first ("Fix the highlighted rows before saving"); double press → one request; same `batchId` on a repeat; new `batchId` after success; no success claim unless 2xx | ✅ | ✅ | ⬜ | ⬜ |
| Server rejection | `errors[]` mapped onto rows ("Nothing was saved. Some rows failed validation."), sheet and `batchId` kept; 400/403/404 shown verbatim once, never retried | ✅ | ✅ | ⬜ | ⬜ |
| Voucher banner | "{n} receipt(s) saved, total Rs. {x} ({CR-000001})", share/print the voucher, share each invoice's receipt, Dismiss | ✅ | 🟨 request path/filename only; file output not tested | ⬜ | ⬜ |
| Accounting | Payments, journal entries (Dr Cash/Bank, Cr Accounts Receivable by customer), sale `amountPaid`/status, voucher numbering: all done by the backend transaction; nothing computed in Android | ✅ | n/a | ⬜ | ⬜ |

### Differences from the web (not silently accepted)
- **Confirm before saving** (added): the web saves immediately on Ctrl+S; on a phone a stray tap on a financial write is easy, so a confirm dialog shows the entry count and total. Remove it if you want exact parity.
- **Keyboard shortcuts** (F2, Ctrl+S, arrows, Delete, Esc) have no mobile equivalent; their actions are buttons ("Full", "Save cash receipt", "Remove row", tap a suggestion).
- **Leave guard:** the web warns on `beforeunload`; Android instead keeps the draft, so nothing is lost on leaving.
- The web has a dismissible banner only; Android's banner is the same (a saved receipt cannot be reopened, because the backend has no list/get endpoint).

### Backend limitations (documented, unchanged)
Web UI hard-codes method CASH and never sends the per-row `method` / `reference` the API accepts · saved receipts cannot be listed or reprinted after the banner is dismissed (no endpoint) · lookup returns at most 10 rows · the receipt `date` is the client's today while the sheet shows the invoice date · a receipt cannot be voided as a receipt; its payments are voided in Accounting → Payments (`acc_payments:void`, built) and that does not update the `cash_receipts` document · no unit tests for `CashReceiptsService` (one branch e2e test only) · idempotency is per tenant + branch + `batchId`.

### Test results (actual, this environment)
- `npx tsc --noEmit` exit 0 · `npx expo lint` exit 0 · `npx jest` 27 suites / 316 tests passed, 5 live suites (28 tests) skipped for lack of `LIVE_API_URL` · `npx expo export --platform android` exit 0 · `npx expo-doctor` 20/20. No "overlapping act()" warnings.
- New: `cash-receipt-sheet` (20), `cash-receipt-api` (12), `cash-receipt-screen` (28, two runs in a row without a failure). No regressions in Purchases, Process Orders, Sales, Inventory, Customers, auth or permissions.
- **Not done:** `src/__tests__/live/cash-receipt.live.test.tsx` was **run against a live backend on 2026-11-16 and passed** (setup in the Administration test results). No emulator/device testing. PDF output not exercised.

## SSR (Secondary Sales Report) — 🟨 (every web feature is implemented; automated-tested only; live suite run against a real backend and passed on 2026-11-16 (row-level Live API cells not yet updated); **not** device tested)
SSR is the **Secondary Sales Report** ("Sale & Stock Report (Regular)" on the PDF): what was sold, by manufacturer / vendor / product, with stock movement columns. One web page in the "Insights" menu. Source of truth: web `apps/web/src/app/(app)/reports/ssr/page.tsx`, `components/ssr/{ssr-table,ssr-drilldown,user-filter,multi-select}.tsx`, `hooks/use-ssr.ts`; backend `apps/api/src/modules/reports/ssr/` (`ssr.controller.ts`, `ssr.service.ts`, `ssr-rollup.ts`, `ssr-export.service.ts`, `tz.ts`), read from source.
Android: `src/features/ssr/` (`ssr-screen.tsx`, `ssr-drilldown.tsx`, `order-booker-filter.tsx`, `use-ssr.ts`, `ssr-dates.ts`, `ssr-columns.ts`), types `src/types/medicore/ssr.ts` (the web declares them locally, not in shared-types), route `src/app/(app)/reports/ssr.tsx`. **Every figure comes from the backend; Android only formats.**
Permissions: `ssr:read` (page, drilldown), `ssr:export` (files), `ssr:view_cost` (server strips cost/profit/CP without it; the page reads `report.canViewCost`), `sales:view_all` (shows the Order Booker filter). Only the default Accountant role template has SSR keys; admins pass every check.

| Feature | Web source → Android source | Endpoint | Rule | Implemented | Automated tests | Live API | Device |
|---|---|---|---|---|---|---|---|
| Access + menu | `PageAccessGuard ssr:read`, nav "SSR" under Insights → `RequirePermission`, `nav-config.ts` "Insights" | – | no request without `ssr:read` | ✅ | ✅ | ⬜ | ⬜ |
| Views | tabs Manufacturer (default) / Vendor / Product / "Manufacturer > Vendor > Product" → `ChipRow` | `GET /reports/ssr?view=` | rows expand: manufacturer/vendor → products, grouped → vendor → product, product → batches | ✅ | ✅ | ⬜ | ⬜ |
| Period + presets | Today, Yesterday, Last 7/30 days, This month (default), Last month, This year, From/To → `ssr-dates.ts` | `from`, `to` as `yyyy-mm-dd` | **Pakistan time, UTC+5, no DST** (`Date.now()+5h`), exactly the web math; active preset highlighted by exact match | ✅ | ✅ (`ssr-dates`) | ⬜ | ⬜ |
| Invalid range | "The From date must be on or before the To date." | – | `from > to` sends no request and disables export | ✅ | ✅ | ⬜ | ⬜ |
| Branch | `BranchFilter` | `branchId` | non-admins locked to their branch; foreign branch → 403 shown verbatim | ✅ | ✅ | ⬜ | ⬜ |
| Order Booker filter | `UserFilter` + `MultiSelect` → `order-booker-filter.tsx` | `salesmanIds=a,b`; options `GET /sales/order-bookers` | only with `sales:view_all`; options not fetched otherwise; "All order bookers" / "Order Booker (n)" | ✅ | ✅ | ⬜ | ⬜ |
| Search | "Search in table..." 300 ms debounce | `search` | server-side; narrows rows and totals; total row "Total (matching search)"; one request per settled input | ✅ | ✅ | ⬜ | ⬜ |
| Sort | header click → sort chips (visible sortable columns) | `sort=field:asc` or `field:desc`, default `netSaleValue:desc` | new column desc first, same column flips to asc; Pack/Rate/Bonus/Exp Brk not sortable | ✅ | ✅ | ⬜ | ⬜ |
| Columns | Pack, Rate, Opening Qty, Pur Qty, Total Stock, Gross Sale, Bonus N. Sale, Net Sale, **Net Sale Value**, Exp Brk, Trnf IN, Trnf OUT, Closing Qty, Closing Stock (TP) → `ssr-columns.ts` | – | Closing Stock (CP) only with `canViewCost`; Prev. net sales / Change only when `totals.prevNetSales` exists; formats en-US (2 decimals / up to 2) | ✅ | ✅ | ⬜ | ⬜ |
| Columns menu | "Columns" checkbox menu → switch list | – | the hidden set also drives the export `columns` | ✅ | ✅ | ⬜ | ⬜ |
| Grand total | totals row | `report.totals` | server totals over all rows, not the page | ✅ | ✅ | ⬜ | ⬜ |
| Pager (product view) | "Page x of y (n products)" | `page` (only for the product view), 50 per page | other views unpaged | ✅ | ✅ | ⬜ | ⬜ |
| Warnings + footnote | `report.warnings` alerts, returns-attribution footnote | – | RETURN_DATE / SALE_DATE wording, "Dates are Pakistan time." | ✅ | ✅ | ⬜ | ⬜ |
| States | spinner, dim while refetching, error alert with stale report kept, "No sales found for these filters." | – | previous report stays visible while filters change | ✅ | ✅ | ⬜ | ⬜ |
| Invoice drilldown | FileText icon on product rows → `ssr-drilldown.tsx` | `GET /reports/ssr/product/:id/invoices` | filters only (from, to, branchId, salesmanIds), up to 1000 invoices; Invoice (opens the sale), Date, Customer, Batch "no (qty)", Units, Value, Returned "units (value)", Voided badge | ✅ | ✅ | ⬜ | ⬜ |
| Export | Export menu Excel / CSV / PDF (`ssr:export`) → three buttons via `useDocumentFile` | `GET /reports/ssr/export?...&columns=&format=xlsx|csv|pdf` | server-built, same filters/sort/search, unpaged, 50,000-row cap ("Too many rows to export; narrow the filters."); file `ssr-{from}-to-{to}.{ext}`; disabled with no report or an invalid range | ✅ | ✅ (request path, params, columns, names, MIME; file bytes mocked) | ⬜ | ⬜ |

### Behaviour that matters (enforced by the backend)
- Calculations (`ssr-rollup.ts`): sales from non-pending, non-deleted sales in the Karachi day range, batch allocations split pro-rata; returns by return date (or the original sale date); `netSales = sales − returns` (tax-inclusive); cost from batch `purchasePrice`; vendor split pro-rata by purchased quantity (unassigned / no-manufacturer buckets); opening and closing rebuilt from stock movements; `bonus` and `expBrk` are always 0; every view reconciles to the grand total or a warning is returned.
- Tenant isolation on every aggregation stage; branch scope via `resolveBranchScope`. There is **no per-user scoping**: anyone with `ssr:read` sees the whole branch; the Order Booker filter is only a convenience.

### Differences from the web (not silently accepted)
- **Layout**: the web's 17-column table is a card per row on the phone (every visible column is listed on the card); the Columns menu is a switch list; sorting uses a chip bar instead of header clicks.
- **Export**: three buttons instead of a dropdown; files are written to the app cache and opened in the share sheet (the web downloads or opens a PDF tab).
- **Drilldown**: dates are shown as the Pakistan day (the web uses the browser's zone, which can differ from the report's day boundaries); a failed request shows the server's error (the web shows the "empty" message).
- **State** (filters, view, sort, page) lives in screen state; the web keeps it in the URL, so SSR links cannot be shared or restored.
- Not built because the web UI never uses them: manufacturer/vendor/product/customer/category filters, payment type, compare, include voided/zero/inactive, attribute-to-sale, `summary` and `chart` payloads, and `GET /reports/ssr/stock-statement`.

### Backend notes (documented, unchanged)
SSR types are not in shared-types · `ADJUSTMENT_SET` and `WRITE_OFF` movements are ignored in the stock rebuild · date DTO validation checks only the `yyyy-mm-dd` shape, not calendar validity · the export footnote "Voided invoices are excluded from totals." appears when `includeVoided` is set, which looks inverted · drilldown is capped at 1000 invoices.

### Test results (actual, this environment)
- `npx tsc --noEmit` exit 0 · `npx expo lint` exit 0 · `npx jest` 37 suites / 460 tests passed, 7 live suites (38 tests) skipped for lack of `LIVE_API_URL` · `npx expo export --platform android` exit 0 · `npx expo-doctor` 20/20. No "overlapping act()" warnings.
- New: `ssr-dates` (6), `ssr-screen` (23; run twice in a row without a failure). Covers screens/navigation, presets and Pakistan-time day boundaries, params sent (view, sort, search debounce, page only for the product view, order bookers, branch), cost/compare columns, columns menu, export request path/columns/file names/MIME for all three formats, permission gating, empty/error/warning states and the drilldown. No regressions in Accounting, Cash Receipt, Purchases, Process Orders, Sales, Inventory, Customers, auth or permissions (all in the 460).
- **Not done:** `src/__tests__/live/ssr.live.test.tsx` (report reconciliation across views, drilldown, reversed-range refusal, CSV export, permission and branch refusals) was **run against a live backend on 2026-11-16 and passed** (setup in the Administration test results). No emulator/device testing. Export file bytes and the share sheet are mocked, not exercised.

## Accounting — 🟨 (every web page is implemented; automated-tested only; live suite run against a real backend and passed on 2026-11-16 (row-level Live API cells not yet updated); **not** device tested)
Source of truth: web `apps/web/src/app/(app)/accounting/**`, `components/ledger/**`, `hooks/use-{accounts,payments,expenses,journal-entries,ledgers,ledger-reports,returns}.ts`; backend `apps/api/src/modules/accounting/**`, read from source. Android never calculates or posts accounting entries: every posting, void, reversal, balance and report figure comes from the backend; client sums are display-only and mirror only when the web enables a button.
Permissions are `acc_<slug>:<action>` (`read`, `create`, `update`, `delete`, `export`, `void`); admins bypass. The chart of accounts is tenant-wide and lazily seeds 15 system accounts on first read. Accounting stays 🟨 until every row below is ✅ in all four columns (Live API and Device are still ⬜ everywhere).

| # | Feature (web page) | Android route | Endpoints | Permissions | Implemented | Automated tests | Live API | Device |
|---|---|---|---|---|---|---|---|---|
| A | Overview: 4 KPI cards (Accounts Receivable → customer list with "Has balance", Accounts Payable → vendor list, Cash + Bank, Net income this month) and 11 permission-filtered link cards | `/accounting` | `GET /accounting/reports/overview` | `acc_overview:read`; each card `acc_<slug>:read` | ✅ | ✅ (`accounting-chart`) | ⬜ | ⬜ |
| B | Chart of Accounts: list, search, create (code, type, name, description), edit (name + description only), deactivate | `/accounting/chart-of-accounts` | `GET/POST /accounting/accounts`, `PATCH/DELETE /accounting/accounts/:id` | read / create / update / delete | ✅ | ✅ (16) | ⬜ | ⬜ |
| C | Payments: list (party-type filter, search, advance badge), Record Payment (party, amount, method, cash/bank account, date, reference, notes, allocation to open invoices with the unapplied remainder shown), **Void** | `/accounting/payments` | `GET/POST /accounting/payments`, `DELETE /accounting/payments/:id` (void), open invoices from `GET /sales` / `GET /purchases` | read / create / void | ✅ | ✅ (22) | ⬜ | ⬜ |
| D | Expenses: list, search, record (branch, category, amount, method, paid-from account, date, vendor, description, reference) | `/accounting/expenses` | `GET/POST /accounting/expenses` | read / create | ✅ | ✅ (11) | ⬜ | ⬜ |
| E | Journal Entries: list + search, entry detail (lines, party, totals, reversal links), New Entry (Manual or Opening Balance, ≥ 2 lines, balanced within 0.01, party per line, branch), `?open=<id>` deep link | `/accounting/journal-entries`, `/accounting/journal-detail?id=` | `GET /accounting/journal-entries`, `GET .../:id`, `POST /accounting/journal-entries`, `POST /accounting/opening-balances` | read / create | ✅ | ✅ (14) | ⬜ | ⬜ |
| F | Customer Ledger and Vendor Ledger: "All customers/vendors" list (search, "Has balance only", sort name/balance, 25 per page, unattributed-balance alert) and the Ledger view (party picker, period presets + custom range, branch, 5 summary cards + extras, rows with opening/closing, 25–200 rows per page, links to the entry and the sale/purchase); Excel/CSV, Print/PDF and Statement exports | `/accounting/customer-ledger`, `/accounting/vendor-ledger` (params `view`, `party`, `bal`) | `GET /accounting/{customers,vendors}/balances`, `.../:id/ledger`, `.../:id/ledger/export?format=csv|pdf|statement` | `acc_customer_ledger:read|export`, `acc_vendor_ledger:read|export` | ✅ | ✅ (17, with G) | ⬜ | ⬜ |
| G | General Ledger: account picker, period, branch, rows with opening/closing, CSV/PDF export | `/accounting/general-ledger` | `GET /accounting/general-ledger`, `.../export` | `acc_general_ledger:read|export` | ✅ | ✅ (in the 17 above) | ⬜ | ⬜ |
| H | Returns: Sale / Purchase mode, document picker, per-batch return quantity (0..returnable), date, reason, history of recorded returns | `/accounting/returns` | `GET .../returns/{sale,purchase}/returnable`, `GET/POST /accounting/returns/{sale,purchase}` | `acc_returns:read` / `:create` | ✅ | ✅ (14) | ⬜ | ⬜ |
| I | Trial Balance: as-of date, totals, Balanced / Out of balance badge, search, Export CSV | `/accounting/trial-balance` | `GET /accounting/reports/trial-balance?asOfDate` | `acc_trial_balance:read` / `:export` | ✅ | ✅ (17, with J and K) | ⬜ | ⬜ |
| J | Profit & Loss: from/to (opens on the last 30 days), revenue, expenses, net income | `/accounting/profit-loss` | `GET /accounting/reports/profit-loss?startDate&endDate` | `acc_profit_loss:read` | ✅ | ✅ (in the 17) | ⬜ | ⬜ |
| K | Balance Sheet: as-of date, assets / liabilities / equity, balanced badge, net income | `/accounting/balance-sheet` | `GET /accounting/reports/balance-sheet?asOfDate` | `acc_balance_sheet:read` | ✅ | ✅ (in the 17) | ⬜ | ⬜ |
| L | Entry points: "View ledger" on the Customers and Vendors lists; ledger rows open the journal entry, sale or purchase; Accounting menu section | list screens, `nav-config.ts` | – | `acc_customer_ledger:read`, `acc_vendor_ledger:read` | ✅ | ✅ (`accounting-entrypoints` 4, plus nav assertions in each suite) | n/a | ⬜ |

### Behaviour that matters (all enforced by the backend, verified in the code)
- **Payment**: Dr cash/bank, Cr Accounts Receivable (customer) or Dr Accounts Payable, Cr cash/bank (vendor); any unapplied remainder goes to Customer/Vendor Advances. The payment lands in the party's branch, so Android (like the web) sends no `branchId`. Sale/purchase `amountPaid` and status are updated by the backend.
- **Void a payment** (`DELETE /accounting/payments/:id`, `acc_payments:void`, no body): the backend reverses every journal entry sharing the payment's `sourceId` (originals become REVERSED), subtracts the allocations from the invoices, and soft-deletes the payment. An invoice with no other payment becomes editable again. Refused with 409 "Cannot void: the advance from this payment has already been applied elsewhere" or "Cannot void: an invoice paid by this payment has returns"; a repeat void is 404. Android asks first (web wording), shows the server's message verbatim and reports success only after a 2xx.
- **Expense**: Dr expense account, Cr paid-from account; there is no edit or void on the web or the backend. **Journal entries**: posted entries are immutable; a correction is a new reversing entry (made by the backend for voids), there is no reverse button on the web.
- Chart of Accounts: code is unique including soft-deleted accounts (409); only name/description/active can change; system accounts cannot be deactivated.
- Writes are single requests that are never retried, guarded against a second tap while one is in flight (`useSubmitGuard` + inert loading button) and keep the form open on error. No idempotency keys exist for these endpoints (only the cash receipt `batchId`).

### Differences from the web (not silently accepted)
- **Chart of Accounts**: the web gates "New" on `acc_chart_of_accounts:update` although the API needs `:create`; Android gates it on `:create` (what the backend enforces). Android also asks for confirmation before Deactivate (the web does not) and shows update errors (the web hides them).
- **Payments**: no allocate action. The web `allocate` hook (`PATCH /accounting/payments/:id/allocate`) has no UI on the web either, so it was not invented. Open invoices offered for allocation are the newest 200 per status (UNPAID and PARTIAL), filtered by `grandTotal - amountPaid > 0.01` like the web.
- **Returns**: the document picker shows the newest 50 matches and has a server-side search box; the web lists every document in one unpaged dropdown. Like the web, only `reason` and `returnDate` are sent (no reason code, no settlement; the backend defaults to ADJUST), and no `branchId` (the backend uses the document's branch).
- **Journal Entries**: besides the detail modal opened from the list (and `?open=`), Android has a detail route that loads one entry by id, so ledger links also work for entries that are not in the current list.
- **Ledgers and reports**: list/ledger state, filters and paging live in screen state (the web keeps them in the URL); only `view`, `party` and `bal` are accepted as entry parameters. "Today" and "30 days ago" use the device's local date (the web uses the UTC date). The Customers → detail ledger keeps its own implementation (it was not refactored onto the shared ledger components); behaviour is unchanged.
- **Exports**: files are written to the app cache and opened in the system share sheet (the web downloads or opens a tab). The Trial Balance CSV is built on the device exactly like the web's client-side `exportToCsv` (every cell quoted, amounts to 2 decimals) because the backend has no Trial Balance export.
- **Overview**: KPI cards are requested without `?branchId` (the viewing-branch header scopes them).

### Backend limitations (documented, unchanged)
No fiscal periods, period lock or year-end close · no payment audit trail or void reason · allocations are not validated against the party or the invoice's outstanding amount · voiding a payment does not touch the `cash_receipts` document, so the cash receipt voucher still shows the old amount · walk-in quick payments (no customer) have no Payment document and cannot be voided here · Trial Balance, Profit & Loss and Balance Sheet treat a bare end date as midnight, so the end date itself is excluded, while ledgers include the whole day · export permissions exist for Profit & Loss and Balance Sheet but there is no server export for them (nor a button on the web) · ledger exports are capped at 20,000 rows · manual journal lines are not validated against account existence · expense journal entries have no `sourceId` · no unit tests exist in the backend for payments, returns, reports or ledger export · expenses and journal entries cannot be voided or edited.

### Test results (actual, this environment)
- `npx tsc --noEmit` exit 0 · `npx expo lint` exit 0 · `npx jest` 35 suites / 431 tests passed, 6 live suites (32 tests) skipped for lack of `LIVE_API_URL` · `npx expo export --platform android` exit 0 · `npx expo-doctor` 20/20. No "overlapping act()" warnings. Jest prints a "worker failed to exit gracefully" notice (run with `--forceExit`); it predates this module and does not fail the run.
- New Accounting suites: `accounting-chart` (16, includes the hub), `accounting-payments` (22), `accounting-expenses` (11), `accounting-journal` (14), `accounting-ledgers` (17), `accounting-reports` (17), `accounting-returns` (14), `accounting-entrypoints` (4) = 115 tests; the suites written this session ran twice in a row without a failure. No regressions in Cash Receipt, Purchases, Process Orders, Sales, Inventory, Customers, auth or permissions (all their suites are in the 431).
- **Update 2026-11-16:** `src/__tests__/live/accounting.live.test.tsx` (payment create/void restoring the invoice, backend rejection of an unbalanced journal entry, trial balance / balance sheet agreement, customer balances) has now been **run against a live backend and passed** (see the Administration test results for the setup). The Live API cells in the table above have not been updated row by row yet. No emulator/device testing. File output of exports (CSV/PDF share) is mocked in tests, not exercised.

## Administration — 🟨 (implemented; automated + live-API verified; not yet run on a device/emulator)
Web: `apps/web/src/app/(app)/administration/{branches,roles,users,permissions}/` (page + `components/`), hooks `apps/web/src/hooks/use-{branches,roles,users,permission-catalog,permission-modules}.ts`, `apps/web/src/components/permissions/menu-picker.tsx`, nav `apps/web/src/components/layout/nav-config.ts:76-83`.
API: `apps/api/src/modules/{branches,roles,users,permissions}/`, per-user permissions in `modules/roles/user-permissions.controller.ts`, guards in `common/guards/`.
Android: routes `src/app/(app)/administration/*.tsx`, screens and hooks in `src/features/{branches,roles,users,permissions}/`, shared dialog submit in `src/features/administration/dialog-submit.tsx`.

Every rule below is enforced by the backend. Android only mirrors it by disabling buttons, and shows the server's message as sent when the server refuses. Permission checks re-read the user and role from the database on every request. Admins (`TENANT_SUPER_ADMIN`, `SUPER_ADMIN`) bypass all permission checks.

Live API column: "✅" means the behaviour was exercised against a real API in `src/__tests__/live/administration.live.test.tsx` (18 tests). Device is ⬜ everywhere.

### Branches — `/administration/branches` (`branches:read`)
| Feature | Web | Android | Endpoint · permission | Implemented | Automated tests | Live API | Device |
|---|---|---|---|---|---|---|---|
| List: name, Main badge, code, address, status, Active switch | `branches/components/branches-table.tsx` | `features/branches/branches-screen.tsx` | `GET /branches` · `branches:read` (also readable with `purchases:create`, `sales:create` or `inventory:adjust` for pickers, but the screen needs `branches:read`) | ✅ | ✅ | ✅ | ⬜ |
| Loading, empty ("No branches yet"), error + retry, pull to refresh | page.tsx | same | — | ✅ | ✅ | n/a | ⬜ |
| Create: name and code required, min 2; address, phone, Main | `branch-dialog.tsx` | `BranchDialog`, `branch-schema.ts` | `POST /branches` · `branches:create` | ✅ | ✅ | ✅ | ⬜ |
| Code stored uppercase; duplicate code → 409 `A branch with code "X" already exists` | — | sent uppercase | service l.33/70 | ✅ | ✅ | ✅ | ⬜ |
| Edit: changed fields only | `branch-dialog.tsx` | `buildBranchUpdate` | `PATCH /branches/:id` · `branches:update` | ✅ | ✅ | ✅ | ⬜ |
| Setting Main clears the previous main branch (list refetched) | — | `use-branch-admin.ts` | service l.36/80-85 | ✅ | ✅ | — | ⬜ |
| Activate / deactivate (with confirmation); main branch switch disabled; 409 `The main branch cannot be deactivated` | table l.92 | screen | `PATCH /branches/:id/status` · `branches:update` | ✅ | ✅ | ✅ | ⬜ |
| Delete with destructive confirmation; main branch Delete disabled; 409 messages: main branch, `assigned to N user(s)`, `has <collection> on record` | table l.42/108 | screen | `DELETE /branches/:id` · `branches:delete` | ✅ | ✅ | ✅ (main, in use, empty) | ⬜ |
| Toasts: created / updated / activated / deactivated / deleted, or the server text | `use-branches.ts` | `use-branch-admin.ts` | — | ✅ | ✅ | ✅ | ⬜ |

### Roles — `/administration/roles` (`roles:read`)
| Feature | Web | Android | Endpoint · permission | Implemented | Automated tests | Live API | Device |
|---|---|---|---|---|---|---|---|
| List: name, description, "N module(s)" (counts keys, like the web), status, Active switch | `roles-table.tsx` | `features/roles/roles-screen.tsx` | `GET /roles` · `roles:read` | ✅ | ✅ | ✅ | ⬜ |
| Loading, empty, error + retry | page.tsx | same | — | ✅ | ✅ | n/a | ⬜ |
| No built-in or system roles: every role can be edited and deleted (no `isSystem` on Role) | — | — | — | ✅ | ✅ | — | ⬜ |
| Create: name min 2, description, menus | `role-dialog.tsx` | `RoleDialog`, `role-schema.ts` | `POST /roles` · `roles:create` | ✅ | ✅ | ✅ | ⬜ |
| Menu picker: ticking a menu adds all its action keys, a menu is on when it holds `:read`, the Accounting parent toggles its sub-pages, "Select all menus" | `components/permissions/menu-picker.tsx` | `menu-picker.tsx`, `menu-picker-logic.ts` | `GET /permissions/modules` (no permission) | ✅ | ✅ | ✅ (catalogue keys) | ⬜ |
| Server normalisation: any action implies `:read` | — | — | `permission-definitions.ts:247-266` | n/a | — | ✅ | — |
| Edit: name and description when changed, `allowedModules` always | `role-dialog.tsx:73` | `buildRoleUpdate` | `PATCH /roles/:id` · `roles:update` | ✅ | ✅ | — | ⬜ |
| Duplicate name → 409 `A role named "X" already exists` | — | dialog shows it | service l.33/72 | ✅ | ✅ | ✅ | ⬜ |
| Activate / deactivate with confirmation (deactivating removes every permission from its users) | table | screen | `PATCH /roles/:id/status` · `roles:update` | ✅ | ✅ | ✅ | ⬜ |
| Delete with confirmation; in use → 409 `This role is assigned to N user(s)…` | table l.29 | screen | `DELETE /roles/:id` · `roles:delete` | ✅ | ✅ | ✅ | ⬜ |
| "Permissions catalog" link (web has the page but no menu entry) | — | screen header, shown only with `permissions:read` | — | ✅ | ✅ | n/a | ⬜ |

### Users — `/administration/users` (`users:read`)
| Feature | Web | Android | Endpoint · permission | Implemented | Automated tests | Live API | Device |
|---|---|---|---|---|---|---|---|
| List: full name, username, phone, tenant role (Admin/User), assigned role, status, Active switch | `users-table.tsx` | `features/users/users-screen.tsx` | `GET /users` · `users:read` (tenant-wide, not branch-scoped) | ✅ | ✅ | ✅ | ⬜ |
| Loading, empty, error + retry | page.tsx | same | — | ✅ | ✅ | n/a | ⬜ |
| Create: username 3–50 chars of `[a-zA-Z0-9._-]`, full name min 2, phone, tenant role, user role, branch | `user-dialog.tsx` | `UserDialog`, `user-schema.ts` | `POST /users` · `users:create` | ✅ | ✅ | ✅ | ⬜ |
| Username stored lowercase; duplicate → 409 `A user with this username already exists in this organization.` | — | dialog shows it | service l.15 | ✅ | ✅ | ✅ | ⬜ |
| Role and branch pickers list active entries only, and load only with `roles:read` / `branches:read` | dialog l.213/236 | same | — | ✅ | ✅ | — | ⬜ |
| Tenant role Admin clears and disables the role picker ("Not applicable for Admin", "Admin has access to all menus") | dialog l.92-96 | same | — | ✅ | ✅ | — | ⬜ |
| Temporary password (12 characters) shown once, with Copy; never cached, toasted or stored | `users/page.tsx:99-128` | `temporary-password-dialog.tsx` | create response | ✅ | ✅ | ✅ (logs in) | ⬜ |
| Edit: username locked; changed fields only; `null` clears role or branch | dialog | `buildUserUpdate` | `PATCH /users/:id` · `users:update` | ✅ | ✅ | ✅ | ⬜ |
| Role or branch from another tenant → 404 `Role not found` / `Branch not found` | — | — | service l.37-47 | n/a | — | ✅ | — |
| Self and last-admin rules (409, server only): own access level, own role, demote / deactivate the last active admin | — | shown verbatim | service l.166/192/201 | ✅ | ✅ | ✅ (own level; last admin via a non-admin) | ⬜ |
| Activate / disable (`ACTIVE` / `DISABLED`) with confirmation; gated by `users:deactivate`; self → 409 `You cannot deactivate your own account` | table l.77 | screen | `PATCH /users/:id/status` · `users:deactivate` | ✅ | ✅ | ✅ | ⬜ |

### Permissions catalog — `/administration/permissions` (`permissions:read`, not in nav)
| Feature | Web | Android | Endpoint · permission | Implemented | Automated tests | Live API | Device |
|---|---|---|---|---|---|---|---|
| List: key, name, module, System/Custom, status; system entries plus the tenant's own | `permissions-table.tsx` | `features/permissions/permissions-screen.tsx` | `GET /permissions` · `permissions:read` | ✅ | ✅ | ✅ | ⬜ |
| View (read-only; system rows note "System permissions cannot be edited") | `permission-dialog.tsx` | `PermissionDialog` | — | ✅ | ✅ | n/a | ⬜ |
| Create: key matches `^[a-z][a-z0-9]*(:[a-z][a-z0-9-]+)+$`, name min 2, module min 2; duplicate → 409 | dialog | `permission-schema.ts` | `POST /permissions` · `permissions:create` | ✅ | ✅ | ✅ | ⬜ |
| Edit custom rows only (key locked) | table l.49 | same | `PATCH /permissions/:id` · `permissions:update` | ✅ (sends all fields; see below) | ✅ | ✅ | ⬜ |
| System or foreign id → 404 `Permission not found or does not belong to your organization` | — | shown verbatim | service | ✅ | ✅ | ✅ | ⬜ |

### Navigation and security
| Feature | Implemented | Automated tests | Live API | Device |
|---|---|---|---|---|
| More menu: Branches, Roles and Users shown per read key; section hidden with none; admin sees all (`admin-nav.test.tsx`) | ✅ | ✅ | n/a | ⬜ |
| Every screen is wrapped in `RequirePermission`: Loading while `/auth/me` loads, retry if it fails, "No access" only when the permission is really missing | ✅ | ✅ | n/a | ⬜ |
| Double taps ignored on every submit, toggle and delete (`useSubmitGuard`, `useDialogSubmit`) | ✅ | ✅ | n/a | ⬜ |
| Backend 403 `Insufficient permissions` for a clerk on `/users`, `/roles`, `/permissions` and `POST /branches` | n/a | ✅ (UI shows 403 text) | ✅ | — |
| Branch isolation: a branch user sending a foreign `X-Branch-Id` gets 403 `You do not have access to that branch` | n/a | — | ✅ | — |
| Tenant isolation: another tenant can't list, patch or assign this tenant's branches, roles or users (404); a foreign `X-Branch-Id` gets 403 `Branch does not belong to your tenant` | n/a | — | ✅ | — |
| Deactivating a role removes its users' permissions on the next request | n/a | — | ✅ | — |

### Differences from the web (deliberate)
- **Confirmations**: Android asks before every status toggle. The web asks only before deleting, using a browser `confirm`.
- **Dialog titles and labels** match the web ("Create X" / "Edit X", "Branch (Optional)", the role-picker hints).
- **Error toasts on delete**: a 409 on delete shows one toast with the server's text. The web shows two, and for roles one of them is a hard-coded "Role is assigned to users".
- **Catalog toasts**: Android also toasts success in the permission catalog; the web relies on the dialog closing.
- **Inactive assigned role or branch**: when editing a user whose assigned role or branch has since been deactivated, Android still lists it as "Name (inactive)", so the picker shows the real assignment. The web shows an empty select. Saving without touching it sends nothing for that field on both clients.
- **Permission ids**: the catalog maps `_id` → `id`, and edit always sends `name`, `description` and `module`. Both work around backend bugs listed below. The same two workarounds were applied to the web client on 2026-11-16 (`apps/web/src/hooks/use-permission-catalog.ts`, `permissions/components/permission-dialog.tsx`), so both clients now behave the same. Checked against the live API: the old web request returns a 500, and the new requests succeed and keep every field.

### API-only (no web UI, so not built)
- `DELETE /users/:id` (`users:delete`)
- Per-user permission overrides: `GET`/`PUT /users/:id/permissions`
- Role templates from `/permissions/modules`
- `PATCH /permissions/:id/status`
- `DELETE /permissions/:id`
- `GET /users/:id`

### Backend limitations (documented, unchanged; paths under `apps/api/src`)
**Verified against the live backend:**
- **Self-grant.** Anyone with `users:update` can `PUT /users/<own id>/permissions` and grant themself any built-in key. The only check is that they keep `users:update` (`modules/roles/user-permissions.controller.ts:95`). Nothing checks that the caller holds the keys they grant.
- **Admin promotion.** Anyone with `users:create` or `users:update` can set `tenantRole: TENANT_SUPER_ADMIN`; there is no admin-only check (`modules/users/users.service.ts`). The live test showed a user with `users:create` creating an admin. Non-admins can also demote, disable or delete other admins, as long as one active admin remains.
- **Disabled users can still log in.** Login does not check `status`, and `jwt.strategy.ts:35-51` doesn't either. Routes that need a permission refuse them (403); `/auth/me`, `/me/permissions` and `/permissions/modules` still answer.
- **Permission ids.** `PermissionsService` returns raw documents with `_id` and no `id` (`modules/permissions/permissions.service.ts:19-27`), unlike branches, roles and users.
- **Partial permission edits fail.** `updateForTenant` does `Object.assign(permission, dto)` (l.60). The DTO's omitted fields are own `undefined` properties (ES2022 class fields), so a PATCH without `name` or `module` fails with a 500, and one without `description` erases it.

**From source:**
- **Role editors can grant anything.** They can put any keys into a role, including keys they don't hold, and unknown or custom keys are accepted without validation (`roles.service.ts` → `normalizePermissions`).
- **Custom catalog keys do nothing on their own.** They can be put into roles, but no guard checks them, and `PUT /users/:id/permissions` rejects them as unknown.
- **`/auth/me` returns `permissions: []` for admins.** `/me/permissions` returns every key instead, so the two disagree.
- **No password change, reset or forced change.** Only the super admin can reset a tenant's admin password, through Platform.
- **No user limit.** `Plan.maxUsers` is stored (`plans/schemas/plan.schema.ts:24`) but never enforced, and there is no branch limit.
- **Inactive assignments.** Users can be assigned an inactive role or branch, and a branch can be deactivated while users are still assigned to it.
- **Unreachable messages.** The "Cannot edit / modify / delete system permissions" 404s can never be returned, because the tenant-filtered lookup returns "not found" first.
- **Hard delete.** `DELETE /users/:id` deletes the user outright, with no check for linked data.

### Test results (actual, this environment, 2026-11-16)
- `npx tsc --noEmit` exit 0 · `npx expo lint` exit 0, no warnings (two older warnings in admin files were fixed: an expression statement in `menu-picker-logic.ts`, and `watch` replaced with `useWatch` in the users dialog).
- `npx jest` without a backend: 43 suites / 546 tests passed, 8 live suites skipped.
- With `LIVE_API_URL`: **51 suites / 602 tests passed, all 8 live suites included**.
- `npx expo export --platform android` exit 0 · `npx expo-doctor` 20/20.
- New Administration suites, 104 tests in total:
  - `admin-schemas` (15)
  - `admin-branches-screen` (19)
  - `admin-roles-screen` (17)
  - `admin-users-screen` (22)
  - `admin-permissions-screen` (9)
  - `admin-nav` (4)
  - `live/administration.live` (18)
- **Live backend used.** The Medicore API at the source commit, compiled into a scratch folder (nothing in the web repo was changed), ran on port 4100 against a separate, throwaway MongoDB replica set (port 27018, scratch data directory). The developer's `medicore_dev` database was not touched. A platform admin was seeded through environment variables.
- **Live suites for other modules.** Catalog, customers-inventory, sales, purchases, cash-receipt, SSR and accounting ran in the same run. All passed after one fix: two Purchases tests called `refetch()` before `/auth/me` had loaded, and now wait for the data instead. That was a test-timing problem, not an app bug.
- **Not done:** no emulator or device testing.

## Remaining modules — all ⬜
Platform (super admin): Dashboard · Tenants (+impersonate) · Subscriptions · Plans · Settings

## API-only in backend, no web UI (not built unless you confirm)
Administration items are listed in its own section. Stock transfers (list/detail/create now built on mobile at your request; PDF slip still pending) · sale void (`DELETE /sales/:id`) · purchase cancel UI (web hook exists but is never wired to a button) · payment allocate · user permission overrides · opening-balance-only flows beyond journal dialog.

## Not in web (will not be built)
Password change/reset, profile edit, image upload, Bluetooth/network printing (web prints barcode labels via browser print only → Android equivalent: system print via expo-print).

## Known backend limitations (documented, unchanged)
No refresh token (24h session) · no logout endpoint · no idempotency keys on most POSTs (client guard only) · most lists unpaginated · dashboard ignores order-booker own-sales scope · SSE needs Bearer header.
