# Medicore Android app: baseline rules

## What this is
- Android app (Expo / React Native) for Medicore, a pharma distribution SaaS. It must be a COMPLETE REPLICA of the web app: every web feature must exist here with the same behavior.
- Web app and API live in the monorepo at /Users/mac-16/Desktop/Medicore (apps/web = Next.js, apps/api = NestJS + MongoDB, packages/api-client, packages/shared-types, packages/ui; run with `pnpm local`).
- When working here, always use the web repo as the reference (start with `claude --add-dir /Users/mac-16/Desktop/Medicore`).

## Non-negotiable baseline
1. Web and Android use the SAME NestJS API and the SAME MongoDB. A change made in one must appear in the other. Never create a second backend, a mock API or separate data for mobile.
2. The API is the single source of truth for business rules (stock, batches/FEFO, tax, bonus schemes, outstanding balances, returns, permissions). Do NOT reimplement business logic in the app; call the API and display its results. Client-side code is for display, forms and validation only.
3. Same contract as web: same endpoint paths and query names, `Authorization: Bearer <token>`, and `X-Branch-Id` on every authenticated non-POST request. Same roles, permissions, tenant and branch isolation.
4. Types must match the web repo's @medicore/shared-types exactly. Before any feature, re-sync the types (scripts/sync-shared-types.sh) and check the API DTOs. Never edit the copied types by hand.
5. API URL only from EXPO_PUBLIC_API_URL (emulator: http://10.0.2.2:4000/api, phone: the Mac's LAN IP, production: HTTPS). The token lives in expo-secure-store only. Handle token expiry and 401 cleanly (on 401 while impersonating, drop only the impersonation token).

## How to work
- Before building or changing a feature: read the web implementation (page, form, hooks) and the API DTO/service, and match behavior, fields, validation and messages. Adapt only the layout for phones (cards/lists and detail screens instead of wide tables).
- Features are done only when they exist on BOTH web and Android. When a web feature is added or changed, make the matching Android change and update docs/FEATURE_PARITY.md (status per module, endpoints, notes).
- New API features go in this order: API, then web, then Android.
- Use React Query with correct invalidation after every create/edit/delete, refetch on app resume and reconnect, and pull-to-refresh on list screens.
- Run typecheck, lint and tests after changes. Use a LOCAL or TEST database only, never real data. Don't commit or push unless I ask. Show diffs first for big changes.

## Known gaps (from the audit on 2026-11-17; delete each when fixed)
- On a 401 while impersonating, `signOut()` also deletes the admin's own SecureStore session; it should drop only the impersonation token (src/features/auth/use-auth.ts, src/app/_layout.tsx).
- Business logic copied from web in sales/purchases (batch allocation, below-cost check, outstanding balance, return settlement) should move to API responses.
- Plan: merge this app into the monorepo as apps/mobile to share @medicore/api-client and @medicore/shared-types.
- Move src/types/medicore/ssr.ts and permission-modules.ts into @medicore/shared-types when merging the app into the monorepo (until then scripts/sync-shared-types.sh keeps them as Android-only files).

## Planned features (build on web and Android together)
- Configurations menu with bonus schemes (qty, repeating, percentage, price; per product/company/all; sale and purchase).
- Customer NTN field and an optional FBR Digital Invoicing integration with an enable/disable setting.
