# MerchTracker — Project Guide

## Overview
Full-stack Nuxt 4 app for planning merch purchases at anime conventions and travel destinations.
Two modes: **Convention** (halls + booths) and **Travel** (countries/cities + shops).

## Tech Stack
- **Framework**: Nuxt 4 with Vue 3 Composition API
- **UI**: @nuxt/ui (Tailwind-based component library)
- **State**: Pinia (`app/stores/events.ts`, `app/stores/auth.ts`, `app/stores/persons.ts`)
- **Database**: SQLite via `better-sqlite3` + Drizzle ORM
- **Auth**: Rolled in-house. `scrypt` password hash (Node built-in), httpOnly session cookies, no third-party dependency. See `server/utils/auth.ts`. `authStore.fetchMe` runs a defensive check: if the API returns a truthy object missing `username` or `role`, it's treated as null. Without this guard, a stale/partial Pinia hydration could render the navbar as `(no name) · (unknown role)` and the login banner as "Signed in as (no username)". The login banner additionally guards on `authStore.user?.username && authStore.user?.role` for belt-and-braces.
- **OCR**: `tesseract.js` (client-side, loaded lazily in `CatalogImageViewer.vue` and `HallPlanSetupModal.vue`)
- **QR scanning**: `qr-scanner` (~13 KB, BSD, bundled worker). Dynamically imported inside `QrScannerModal.vue` so it never runs at SSR.
- **Currency conversion**: server-side rate fetcher in [`server/utils/currency.ts`](../server/utils/currency.ts) with two providers — Visa's public Foreign-Exchange-Calculator JSON endpoint (`https://www.visa.com/cmsapi/fx/rates`, undocumented, can change without notice) and [Frankfurter](https://www.frankfurter.app) (free ECB-rates proxy). Provider is admin-selectable via `/admin/settings`; if the configured provider throws, the fetcher transparently falls back to Frankfurter so the app keeps rendering. **Historical lookups** are supported via an optional ISO `date` parameter on `getRate(from, to, date?)` — both providers accept a historical date (Visa via `exchangedate=MM/DD/YYYY`, Frankfurter via `/<YYYY-MM-DD>` path). Used by the settlement math so debts converted across receipts reflect the FX rate as of each receipt's payment date, not the current rate (which would drift after the trip). Rates are cached per (provider, pair, date) — **12h TTL for `'latest'`**, **~1y TTL for historical** dates since past rates don't change. `clearRateCache()` is called on any settings change AND by `POST /api/admin/settings/refresh-rates`. Client side: [`app/stores/currency.ts`](../app/stores/currency.ts) is a Pinia store that holds the public settings (`displayCurrency`, `provider`), a reactive `rates` map keyed `${from}->${to}@${date|'latest'}`, and `convert(amount, from, date?)` / `convertTotals(byCurrency, date?)` helpers — `convert` is **synchronous**: first call for a new pair/date returns null AND schedules a fetch, and the reactive map populates the value on the next tick. The tiny [`PriceConverted.vue`](../app/components/PriceConverted.vue) component is the canonical UI primitive — drop it anywhere with `:amount="N" :currency="JPY"` and it renders `≈ €X.XX` (or hides when same currency / rate not ready). Stored prices are NEVER mutated; conversion is display-only. Endpoint quick-ref: `GET /api/settings/public` (anyone — used by the client store), `GET /api/currency/rate?from=JPY&to=EUR&date=2026-05-26` (anyone, server-cached, `date` optional), `GET/PUT /api/admin/settings` + `POST /api/admin/settings/refresh-rates` (admin-only).
- **EXIF GPS**: `exifr`. Dynamically imported inside `UploadCatalogModal.vue` only when the user ticks the "Extract location from photo" checkbox (visible for `article` / `receipt` image types). Reads `latitude` / `longitude` via `exifr.gps(file)` — silently returns null on files with no GPS, on HEIC/PNG without EXIF, or on any parse failure. Coordinates ride along in the multipart upload as `latitude` / `longitude` fields; `POST /api/upload/image` validates the ranges (±90 / ±180) and persists to `catalog_images.latitude` / `catalog_images.longitude`. URL-based images (`POST /api/images/from-url`) do NOT extract GPS — there's no local file to read EXIF from. Install required `--legacy-peer-deps` due to the pre-existing `@pinia/nuxt@0.9` ↔ `pinia@3` peer conflict.
- **File uploads**: H3 multipart form data → `UPLOAD_DIR` (defaults to `public/uploads/`), served at `/uploads/[filename]` via a dynamic server route. Do NOT use Nitro `publicAssets` for this path — it pre-indexes at build time and 404s on runtime uploads. Cleanup is handled by [`server/utils/uploads.ts`](../server/utils/uploads.ts) `deleteUploadedFile(path)` — best-effort `unlink` that silently ignores external URLs, missing files, and anything outside UPLOAD_DIR. Wired into every endpoint that orphans a local file: image DELETE (incl. its sub-images), image replace, booth icon POST + booth PUT (`iconPath` change), floor plan POST + location PUT (`floorPlanImage` change), and the cascade-delete paths (booth/location/event DELETE walks the subtree FIRST to collect every uploaded path before the FK CASCADE wipes the rows).
- **Remote image URLs**: Both catalog images and floor plans accept external URLs as an alternative to file upload. The `catalogImages.path` / `locations.floorPlanImage` column stores the raw URL (`http(s)://…`); the browser fetches it directly, no server round-trip. Use `POST /api/images/from-url` for catalog images, `PUT /api/locations/[id]` with `floorPlanImage = <url>` for floor plans. `filename` is set to empty string for remote images so it's clear nothing local is owned.
- **i18n**: Hand-rolled `useLocale` composable in `app/composables/useLocale.ts` with `en` + `de`. `de: typeof en` enforces parity at compile time.
- **Responsive density**: `app/assets/css/responsive-scale.css` bumps `html { font-size }` via `clamp()` from 16px at the 1024px breakpoint up to a 22px ceiling on 4K displays. Because Tailwind's spacing / sizing utilities are rem-based, the whole UI scales together — visually equivalent to a 125-150% browser zoom on wide screens without making users opt in per device. Mobile/tablet keep the 16px default so touch targets aren't disturbed. If you ever hardcode a pixel size that NEEDS to stay fixed (e.g., a specific image overlay), use `px` rather than `rem`.

## Design System — "Nomad"
The UI runs on the **Nomad** system: a cool-slate dark theme with a **sky** primary accent (`#38bdf8`) and an **indigo** convention accent (`#818cf8`). Dark is the default & primary theme; light mirrors it. Fonts: **Sora** (display/headings, `font-display`), **Public Sans** (body, default `font-sans`), **IBM Plex Mono** (money/counts, `.mono` / `font-mono`) — loaded via Google Fonts in `nuxt.config.ts`.
- **Tokens** live as CSS variables in [`app/assets/css/nomad.css`](../app/assets/css/nomad.css) and are exposed as Tailwind utilities via [`tailwind.config.ts`](../tailwind.config.ts): surfaces `bg-app`/`bg-sidebar`/`bg-surface`/`bg-surface-2`; lines `border-line`/`-soft`/`-hair`/`-focus`; text `text-ink`/`-strong`/`text-muted`/`text-faint`/`-2`; accents `sky`/`sky-soft`/`indigo`/`conv`/`conv-soft`; semantics `planned` (amber), `bought` (emerald), `must` (rose) each with a `chip-*` bg; `text-on-accent` (`#04121c`) for text on bright fills. Radii `rounded-field`/`-card`/`-window`; shadows `shadow-elevated`/`-pop`. Gradient helpers: `.grad-primary` (sky→indigo), `.grad-conv` (indigo), `.grad-progress`/`-conv`, `.cover-travel`/`-conv`. **Prefer these tokens over raw `gray-*`/`purple-*` in new/edited components.**
- **Theme flip**: neutral tokens flip in light via `:root:not(.dark)` in nomad.css; the legacy [`light-mode.css`](../app/assets/css/light-mode.css) remaps still apply.
- **Legacy bridge** (also in nomad.css): components not yet hand-restyled still use `bg-gray-*`/`text-gray-*`/`border-gray-*` and raw `purple-*` accents. A `:root.dark` bridge remaps those grays to Nomad tokens, and a `:root` bridge remaps the purple *accent* shades to sky — **except `bg-purple-500`, which is left alone because it's the 'purple' person-colour dot.** Nuxt UI's primary/gray are aliased to `sky`/`slate` in [`app/app.config.ts`](../app/app.config.ts), and `color="purple"` was globally swapped to `color="primary"`, so `UButton`/`UBadge`/`UInput` accents are sky automatically.
- **App shell** ([`layouts/default.vue`](../app/layouts/default.vue)): a 222px left **sidebar** (brand + All trips/Travel/Conventions nav, Groups, a contextual "This trip/convention" location sub-list on detail pages, Settings, user card with popup menu) + a top utility bar (search + language pill + theme toggle + New-trip gradient button). On convention detail/booth pages the sidebar accent switches to indigo. Under `lg` the sidebar collapses to a **mobile bottom tab bar** (All-trips · Groups · center gradient `+` FAB · Settings · avatar) with a slim mobile top bar. `login.vue` opts out via `definePageMeta({ layout: false })` (full-bleed radial-glow auth screen).
- **Product list "scroll-hunt fix"** (booth detail): products not tied to a catalog image render in a Nomad list with a sticky toolbar (search + All/Planned/Bought/Must filter chips with counts + a Sort menu: priority/name/price) and category **sticky sub-headers** with per-group totals, plus a footer bar. Local UI state only (`productSearch`/`productFilter`/`productSort`); reuses existing store/marks logic. New i18n group `plist.*`.
- Design source of truth: `.claude/design_handoff_merchtracker_nomad/` (README + `.dc.html` mockups).

## Directory Structure (Nuxt 4 app/ layout)
```
app/
  app.vue                # Root component
  layouts/
    default.vue          # Navbar with login/user menu, person selector, language picker
  pages/
    index.vue            # Event dashboard
    login.vue            # Username + password sign-in
    account.vue          # Change password / view role
    admin/
      users.vue          # Admin-only: create/edit/delete users, change roles
      groups.vue         # Group management (owner or admin per row)
      persons.vue        # Admin-only: list all Person rows, delete orphans (no linked user), see mark/product counts per person
      permissions.vue    # Admin-only: bulk-grant share rights — pick multiple users/groups + multiple events or booths and grant in one go (cross-product)
    invite/
      [token].vue        # Magic-link landing page: introspect token, signup or accept
    booth-invite/
      [token].vue        # Booth-scoped magic-link landing page — same flow but creates a booth_shares row instead of event_shares
    events/
      create.vue         # New event form
      [slug]/
        index.vue        # Event detail (halls/locations + booths)
        hallplan.vue     # Interactive hall map
        booth/
          [boothSlug].vue # Booth detail with products & catalog images
  components/
    EventCard.vue           # Card on dashboard
    LocationCard.vue        # Hall/city collapsible section
    BoothCard.vue           # Booth mini-card with progress bar
    ProductItem.vue         # Single product row with cross-off
    HallPlan.vue            # Interactive canvas-free floor plan (CSS overlay on img)
    HallPlanSetupModal.vue  # OCR-based booth-number detection from floor plan
    CatalogImageViewer.vue  # Image viewer with split mode, annotation, OCR, fullscreen
    QrScannerModal.vue      # QR-code → booth jump (camera, convention events only)
    ShareBoothModal.vue     # Per-booth user-share + magic-link invite management (owner/admin only)
    EditBoothModal.vue      # Edit booth name / hall / booth nr / website / notes / categories / icon
    AddLocationModal.vue
    AddBoothModal.vue
    AddProductModal.vue
    UploadCatalogModal.vue
    UploadFloorPlanModal.vue
    EditEventModal.vue       # Edit name/date/location + public/private toggle
    ShareEventModal.vue      # Per-event sharing UI (users + groups, view/edit levels)
    LanguageSelector.vue
  composables/
    useLocale.ts            # i18n composable, en/de with typeof-enforced parity
  stores/
    auth.ts                 # Pinia auth store: user, role, isLoggedIn, isAdmin, isEditing (computed)
    events.ts               # Main events/booths/products store + API calls
    persons.ts              # "Person" labels (NOT users — purely a tagging concept)

server/
  db/
    schema.ts            # Drizzle schema definitions
    index.ts             # DB singleton + CREATE TABLE + admin seed + slug backfill
  api/
    auth/
      login.post.ts          # Username + password → session cookie
      logout.post.ts         # Destroy session
      me.get.ts              # Current user or null
      change-password.post.ts # Update password (requires current)
    events/                # CRUD for events
    locations/             # CRUD for halls/cities
    booths/                # CRUD for booths/shops
    products/              # CRUD for products
    persons/               # CRUD for the colored "Person" tags
    presets/               # Booth-level price preset CRUD
    images/                # Update / delete / move / replace catalog images
    upload/
      image.post.ts        # Upload catalog images (multipart)
      floorplan.post.ts    # Upload floor plan for a location
  routes/
    uploads/
      [filename].get.ts    # Dynamic file server — reads UPLOAD_DIR at request time.
                           # Sets Cache-Control: immutable, max-age=2147483648.
  utils/
    id.ts                  # generateId(), now(), toSlug() helpers
    auth.ts                # hashPassword, verifyPassword, session helpers, requireUser/requireRole

data/                # SQLite DB file (auto-created, gitignored)
public/uploads/      # Uploaded images when UPLOAD_DIR isn't set (auto-created, gitignored)
.env                 # Local secrets (gitignored). See .env.example.
```

## Database Schema
| Table | Purpose |
|-------|---------|
| `users` | Account records (username, scrypt-hashed password, role: admin/editor/user, `personId` linking to the user's auto-created person) |
| `sessions` | Session tokens with `expires_at` (30-day TTL) |
| `groups` | Named collections of users; `ownerId` is who manages it |
| `group_members` | Many-to-many between groups and users (UNIQUE on `group_id, user_id`) |
| `event_shares` | Per-user share of an event with `level` of `view` or `edit` |
| `event_group_shares` | Per-group share of an event with `level` of `view` or `edit` |
| `event_invites` | Magic-link invite tokens. Multi-use until expired/revoked; redeeming creates an `event_shares` row |
| `booths` | (existing table — column note) `icon_path` is an optional small image shown as a square avatar on the dashboard tile AND in the booth detail header. Stores either a `/uploads/icon-…` path (local upload) or an external URL. Set via `POST /api/booths/[id]/icon` (multipart, gated by `requireBoothEdit`) or `PUT /api/booths/[id]` with `iconPath: <url>` to set an external URL; pass `null` to clear. |
| `booth_shares` | Per-(booth, user) share grant — layers ON TOP of event-level access. Lets the event owner give a single artist edit rights on JUST their own booth without exposing the whole event. UNIQUE on (booth_id, user_id). `level` is `'view'` or `'edit'`. Cascades on booth or user delete. |
| `booth_group_shares` | Per-(booth, group) share grant — every member of the group inherits the level. UNIQUE on (booth_id, group_id). Cascades on booth or group delete. The booth's effective edit pool is `union(direct user-shares) ∪ union(group-shares)`. |
| `booth_invites` | Magic-link tokens for booth-level access. Mirrors `event_invites` (multi-use until expired/revoked; redeeming creates a `booth_shares` row). UNIQUE `token`. Cascades on booth delete; `created_by` is SET NULL if the inviter is deleted. |
| `persons` | Colored labels for tagging items. Every User gets one auto-created on signup (1:1 via `users.personId`). Legacy admin-managed standalone persons (no linked user) still exist for backwards compatibility |
| `events` | Top-level events. `date` is the start day; `date_to` is the optional end day for multi-day events (conventions span 2-3 days typically). When `date_to` is null or ≤ `date`, the UI renders a single date — the POST/PUT endpoints normalise this on write (drop `date_to` when it isn't strictly after `date`). `isPublic` flag and `ownerId` drive permissions. |
| `locations` | Halls (convention) or cities/areas (travel) |
| `booths` | Individual vendor booths or shops, with optional map coordinates |
| `catalog_images` | Uploaded product catalog pages per booth (catalog / article / receipt). Optional `latitude` / `longitude` (REAL, nullable) hold EXIF GPS coords when the uploader opted in via the geotag checkbox on the catalog upload modal. Article/receipt images can be opened in Google Maps via a pin button in the inline + fullscreen image headers (uses `galleryCurrent`, so on article carousels the link follows the currently-shown sub-image). |
| `app_settings` | Generic global key/value store for admin-managed app-wide preferences (no event/user scope). Currently holds `currency_provider` (`'visa'` or `'frankfurter'`) and `display_currency` (3-letter ISO code, default `'EUR'`). Default rows are INSERT-OR-IGNORE-d on every boot in [`server/db/index.ts`](../server/db/index.ts) so admins' manual changes survive restarts. Reads via `getAppSetting(key, fallback)` in [`server/utils/currency.ts`](../server/utils/currency.ts); writes happen ONLY through `PUT /api/admin/settings` (admin-only), which also clears the in-process FX rate cache so the next conversion picks up the new provider. |
| `location_receipts` | Travel-mode "city receipts" — one receipt image attached to a `locations` row instead of a booth. Used for shopping trips where a single bill / set of purchases spans multiple shops in the same city. Columns mirror catalog_images (filename, originalName, path, displayMode, splitCount, sortOrder, customName, latitude, longitude, createdAt) but the FK is `location_id` (ON DELETE CASCADE) — no `booth_id`. Additional column `paid_by_person_id` (FK persons, SET NULL) records who actually paid the bill; drives the settlement math. The viewer ([LocationReceiptModal.vue](../app/components/LocationReceiptModal.vue)) flattens every `products` row across every booth under the location AND any `location_receipt_items` rows into a single checklist; per-item person chips toggle marks via the existing `setMark` (for booth products) or `setReceiptItemMark` (for ad-hoc items). At the bottom of the modal an owe-summary lists "Person X owes Payer €Y" computed live from item assignments by `store.perReceiptDebts(receipt, location)`. Surface lives on `LocationCard.vue`: a green receipt-icon button on the location header (travel events only, disabled until the location has at least one booth) opens [UploadLocationReceiptModal.vue](../app/components/UploadLocationReceiptModal.vue), and a thumbnail strip above the booth grid lists existing receipts. Endpoints: `POST /api/upload/location-receipt` (multipart, gated by `requireEventEdit` via `eventIdForLocation`), `PUT /api/location-receipts/[id]` (rename / displayMode / splitCount / **paidByPersonId**), `DELETE /api/location-receipts/[id]`. The cascade-delete walkers in `server/api/events/[id].delete.ts` and `server/api/locations/[id].delete.ts` were both extended to collect `location_receipts.path` so disk files aren't orphaned. `GET /api/events/[id]` returns `receipts: LocationReceipt[]` (each with nested `items`) per location. |
| `location_receipt_items` | Ad-hoc items added directly to a receipt that aren't tied to any booth/product (e.g. tip, taxi, cover charge). `receipt_id` FK CASCADEs. Columns: name, price (REAL nullable), currency, sort_order, **split_among_marked** (boolean), created_at. Surface: "Add custom item" form at the bottom of [LocationReceiptModal.vue](../app/components/LocationReceiptModal.vue). Endpoints: `POST /api/location-receipts/[id]/items` (create), `PUT /api/location-receipt-items/[id]` (update), `DELETE /api/location-receipt-items/[id]`. All gated by `requireEventEdit`. |
| `event_persons` | Explicit travel-companion list for an event. Decoupled from `event_shares` (which controls view/edit access) so persons WITHOUT a user account can still be participants — useful for a friend who doesn't use the app. UNIQUE on (event_id, person_id), CASCADE on both sides. Endpoints: `GET /api/events/[id]/persons` (any viewer), `POST /api/events/[id]/persons` (owner/admin only — body `{ personId }`, idempotent), `DELETE /api/events/[id]/persons/[personId]` (owner/admin only). `GET /api/events/[id]` returns `participants: Person[]` at the top level. [LocationReceiptModal.vue](../app/components/LocationReceiptModal.vue) uses `event.participants` (falls back to every Person when empty) for the chip row + payer dropdown, so legacy events still work. New affordance: [EventParticipantsModal.vue](../app/components/EventParticipantsModal.vue) opens via a "Participants" button on the event header. |
| `location_receipt_item_marks` | Per-(receipt-item, person) claim: existence = "this person took (quantity) of this item." UNIQUE on (item_id, person_id). Mirrors `product_person_marks` shape but without `is_planned`/`is_purchased` since receipt items are purchased by definition. Endpoint `POST /api/location-receipt-items/[id]/marks` accepts `{ personId, quantity }`; `quantity <= 0` removes the row. Permission model matches the product marks endpoint — anyone for themselves, editors for anyone. |
| **Settlements** (computed, no table) | "Who owes who" math. `store.perReceiptDebts(receipt, location)` returns one entry per non-payer person who has assigned items, with a per-currency map of what they owe the receipt's payer. `store.eventSettlements()` rolls those up across every receipt in the event — for each receipt's debts, each currency is converted to the configured display currency **using the FX rate as of that receipt's `createdAt` date** (historical lookup), then accumulated per pair with reverse flows subtracted (A→B and B→A cancel; cross-currency reverse flows now cancel too because everything reduces to the display currency before netting). Returns one entry per pair with `{ converted, target, partial, byCurrency }`. `converted` is the NET amount in the display currency; `byCurrency` is the unsigned per-currency breakdown for transparency; `partial=true` if any rate hadn't loaded yet (the converted total is then under-counted, fallback rendering shows raw currencies). Surfaces: bottom of the receipt modal (uses receipt's `createdAt` for conversion) AND a settlements UCard on the event page (between the totals row and the locations list), shown only when `settlements.length > 0`. |
| `products` | Items to buy, with price, size, category, optional region overlay, `ownerId` (creator) for visibility filtering. `is_planned`/`is_purchased` are now MAINTAINED AS ANY-PERSON AGGREGATES (server-side) but the API substitutes them with the *requesting user's* per-person mark when returning the event tree — so existing single-perspective UIs (checkboxes, strike-through) keep working without per-call refactors. **`split_among_marked`** (boolean) flips settlement math: when true AND the product has ≥2 purchased markers on a receipt, the line is divided equally — each marker owes `price / N` (per-person quantity is intentionally ignored: "group pizza splits by headcount, not by hunger"). When false (default), each marker owes `price × their own quantity`. To split a multi-unit line, enter the price as the line total (e.g. 2 × €50 = €100), then split. Toggled per-row via the 🔀 button in `LocationReceiptModal.vue`. |
| `booth_price_presets` | Per-booth quick-fill price chips |
| `product_person_marks` | Per-(product, person) `is_planned`/`is_purchased` flags **plus a per-person `quantity`** ("I'm buying 2 of these"). UNIQUE on (product_id, person_id). Rows with both flags false are deleted by the marks endpoint to keep the table lean. Multiple persons can independently mark the same product — this is how view-share users contribute "I want this" without earning edit rights. The discount engine and booth totals multiply by `quantity`; `products.quantity` is now only used as the unmarked display default. |
| `booth_discounts` | Per-booth discount rules with two shapes distinguished by `type`. `'buy_get_free'` uses `trigger_qty` + `free_qty` (cheapest M go free per batch of N). `'bundle'` uses `trigger_qty` + `bundle_price` + `bundle_currency` (every batch of N is charged a flat total; only matches products priced in the same currency). `scope_type` is `'size'` or `'category'`, `scope_value` is the matching value. On legacy DBs `free_qty` has a leftover NOT NULL constraint; bundle rows write `0` as a placeholder. Discounts auto-apply when computing planned/paid totals. |

All IDs are UUIDs. SQLite with WAL mode + foreign keys enabled.

## Auth & Permissions (current state)

**Roles**: `admin`, `editor`, `user`.

- `authStore.isLoggedIn` — true if a session is active.
- `authStore.isAdmin` — true if `role === 'admin'`.
- `authStore.isEditing` — **legacy flag**, computed as `role === 'admin' || role === 'editor'`. Used by ~30 places (BoothCard, CatalogImageViewer, ProductItem, etc.) to decide whether to render edit affordances. Treat this as "can mutate" — eventually replaced by per-resource permission checks.

**Guest view** (split into two tiers since per-person marks landed):
- **Truly anonymous (logged out)**: travel events hidden on dashboard, person filter dropdown hidden, paid/spent totals hidden, person dots/labels hidden, catalog overlay boxes use neutral purple, **Plan?/Paid? buttons + "Planned from X" / "Paid from X" summary boxes hidden** (no person to mark for), product + receipt checkboxes disabled. Listed prices still visible.
- **Logged-in `role === 'user'`** (view-share or public viewer): still no edit affordances (no drawing, no creating products, no editing existing ones), but **CAN mark anything for their own person** — the checkbox in `ProductItem.vue`, the qty stepper, the article-gallery `Plan?` / `Paid?` buttons, and the planned/paid summary boxes are all gated on `canMark` (= `authStore.isLoggedIn && !!store.currentEvent?.viewerPersonId`), NOT on `authStore.isEditing`. Editing/drawing/deleting still requires `isEditing`.

**API enforcement** (Phase 3 + Phase 4 + booth-share — done):
- **Per-event permissions** live in [`server/utils/permissions.ts`](../server/utils/permissions.ts):
  - `canViewEvent(user, eventId)` — admin OR public OR owner OR direct share OR group share (any level)
  - `canEditEvent(user, eventId)` — admin OR editor role OR owner OR direct share `edit` OR group share `edit`
  - `requireEventMark(event, eventId)` — *softer than edit*. Requires `requireUser` AND `canViewEvent`. Used only by `POST /api/products/[id]/marks` so view-share users can mark for their own person without earning edit rights. The endpoint additionally enforces `personId` matches the requester's linked person unless they ALSO pass `canEditEvent` (editors can mark on others' behalf).
  - Helpers `requireEventView` / `requireEventEdit` throw 401/403/404 appropriately
  - Resource-to-event walkers: `eventIdForLocation`, `eventIdForBooth`, `eventIdForProduct`, `eventIdForImage`, `eventIdForPreset`, `eventIdForDiscount` — every nested mutation looks up the parent event and gates on it
  - `accessibleEventIds(user)` — used by `GET /api/events` to filter the list
- **Per-booth permissions** (layered on top of event-level):
  - `canViewBooth(user, boothId)` — canViewEvent on the parent OR a direct booth share (any level)
  - `canEditBooth(user, boothId)` — canEditEvent on the parent OR a direct booth-edit share
  - `requireBoothEdit(event, boothId)` — gates EVERY booth-scoped mutation: product create/edit/delete, catalog image upload/edit/delete/replace/move/from-url, preset create/delete, discount create/edit/delete, booth edit (PUT). Deleting the booth itself or creating new booths still uses `requireEventEdit` — that's event-level structural work.
  - `userBoothEditIds(user)` — returns the set of boothIds the user has direct edit-share on; consumed by `GET /api/events/[id]` to stamp `canEdit` per booth on the response so the client can light up affordances without rerunning permission logic.
  - **Share management**: `GET /api/booths/[id]/shares` returns `{ users, groups }` (mirrors `event_shares` response shape) — any logged-in viewer. `POST /api/booths/[id]/shares` accepts `{ userId?, groupId?, level }` and dispatches to either `booth_shares` or `booth_group_shares`. `DELETE /api/booths/[id]/shares/[shareId]` checks both tables since the URL shape is identical for user-shares and group-shares. Granting/revoking is owner-or-admin only — booth-edit-share users can't re-share onward. `boothShareLevel` (in permissions.ts) checks BOTH the direct user-share AND every group the user belongs to that has a booth-group-share, then picks the higher level (edit beats view).
  - **Magic-link invites**: `GET/POST /api/booths/[id]/invites` (owner/admin only — invite tokens are credentials) + `DELETE /api/booths/[id]/invites/[inviteId]` to revoke. Public-facing pair `GET /api/booth-invites/[token]` (introspection — shows booth + event name + level) and `POST /api/booth-invites/[token]/accept` (logged-in: just upserts the `booth_shares` row; logged-out: also creates a user + session from `{ username, password }`). Mirror of the event-invite flow; `/booth-invite/[token]` is the landing page.
- **Bulk permissions page** (`/admin/permissions`): admin-only matrix tool to grant share rights in bulk. Four independent sections — (1) users → events, (2) groups → events, (3) users → booths, (4) groups → booths — each with a multi-select user/group/event/booth list (checkbox lists with All / None shortcuts), a view/edit level picker, and a Grant button. The button fires `Promise.all` over the cross-product of selected subjects × targets, calling the existing per-resource share endpoints (`POST /api/events/[id]/shares` or `POST /api/booths/[id]/shares` — body shape decides user vs group). Reports `{ granted, failed }` counts in a small caption — failures usually mean the target already has equal-or-better access (the endpoints reject downgrades). Booth list is sourced from a dedicated `GET /api/admin/booths` (admin-only, flat list with parent event + location info baked in) so the multi-select can render "EventName › BoothName · H10 · S10L13" in one shot.
- **Event delete** + **share management** require owner-or-admin specifically (edit-shared collaborators cannot delete the event or change shares).
- **`persons` mutations** stay on `requireRole(['admin','editor'])` — they're global tags, not per-event.
- **Auth endpoints**: `login`/`logout`/`me` public; `change-password` uses `requireUser`.
- **Admin endpoints**: `/api/admin/users/*` uses `requireRole(['admin'])`. Last-admin and self-demotion safety rails enforced.
- **Sharing endpoints**: `/api/events/[id]/shares` (GET = any viewer; POST/DELETE = owner-or-admin). `/api/groups/*` membership managed by group owner or admin; members can leave their own group.
- **Client-side 401 handler**: [`app/plugins/auth-redirect.client.ts`](../app/plugins/auth-redirect.client.ts) wraps `$fetch`, on 401 clears `authStore.user` and `navigateTo('/login?redirect=…')`. Skips `/api/auth/me` and `/api/auth/login` so they can return 401 normally.

**Event creation**: any logged-in user can `POST /api/events`. They become the `ownerId` and immediately have full edit rights via the ownership rule.

**Legacy events backfill**: on first boot after Phase 4, any event with `NULL` owner_id is reassigned to the first admin so it remains visible (otherwise no one would qualify under the new rules).

**Per-product visibility (Phase 5)**:
- Every `products.ownerId` is set to the creator (`requireUser` runs on `POST /api/products` after the edit check).
- `GET /api/events/[id]` filters the returned product tree: viewers without edit access only see products where `ownerId IS NULL` (legacy), or matches `event.ownerId`, or matches the requesting user. Edit-access viewers (admin / event owner / edit-share) see everything.
- Mutation rules unchanged: `POST/PUT/DELETE` on products still requires `requireEventEdit`. View-share users cannot yet add their own products — that's a future refinement.

**Magic-link invites (Phase 5)**:
- Stored in `event_invites`. Multi-use (anyone with the URL can redeem) until revoked or expired.
- `POST/GET/DELETE /api/events/[id]/invites` — owner/admin only. Body `{ level, expiresInHours? }`.
- `GET /api/invites/[token]` — public introspection so the `/invite/<token>` landing page can show event name + level before signup.
- `POST /api/invites/[token]/accept`:
  - Logged-in: creates (or upgrades view→edit on) an `event_shares` row.
  - Logged-out: body provides `{ username, password }`, creates a new user with role `user`, opens a session, then shares.
- Frontend: invite-link section in [ShareEventModal](../app/components/ShareEventModal.vue); landing page at [pages/invite/[token].vue](../app/pages/invite/[token].vue).

**Default admin seed**: On first DB creation, if `users` is empty, seed an admin from `ADMIN_DEFAULT_USERNAME` (default `admin`) and `ADMIN_DEFAULT_PASSWORD`. If `ADMIN_DEFAULT_PASSWORD` is unset, a random one is generated and printed once to stdout. **Never hardcode the password in source.**

**Reset admin password without losing data**: `npm run reset-admin` (script in [`scripts/reset-admin.mjs`](../scripts/reset-admin.mjs)) — rewrites the admin user's password hash from `ADMIN_DEFAULT_*` env vars and clears all sessions. Operates directly on the SQLite file, so for Docker either:
- Stop the container first (`docker compose stop merch-tracker`) and run from the host, OR
- Run inside the container (the Dockerfile bakes in `scripts/` and installs `better-sqlite3` at `/app/node_modules` for this purpose): `docker compose exec merch-tracker node /app/scripts/reset-admin.mjs /app/data/merch-tracker.db`.

## Key Features
- **Drag-and-drop reorder (halls + booths + catalog images)**: On the event page, editors can reorder halls via a hamburger handle on each hall card, and reorder booths via a small handle on the top-right of each booth tile. Dragging a booth onto a different hall card moves it (cross-list drop), which fixes the "accidentally placed booth in the wrong hall" case without an explicit move dialog. On the booth detail page, the per-image hamburger handle to the left of each catalog image replaces the old up/down chevron arrows — same drag mechanic, persists via `catalogImages.sort_order`. Powered by [`vue-draggable-plus`](https://github.com/Alfred-Skyblue/vue-draggable-plus) (SortableJS under the hood, Vue 3 native ESM — works on mouse + touch). The older `vuedraggable@4` package ships only a UMD bundle that does `require('vue')` and breaks under Vite's CJS→ESM conversion with "module 'vue' does not provide an export named 'default'" — don't swap back. Persistence: `locations.sort_order` + `booths.sort_order` columns (set on creation to the end of their parent's list) and the existing `catalog_images.sort_order`. Endpoints `POST /api/events/[id]/reorder-locations` (body `{ ids: [...] }`), `POST /api/events/[id]/reorder-booths` (body `{ groups: [{ locationId, boothIds }, ...] }`), and `POST /api/booths/[id]/reorder-images` (body `{ ids: [...] }` — parent images only, sub-images keep their per-parent order) — all reject partial arrangements (the union of IDs sent must equal the current full set, so a stale client can't accidentally erase a concurrent add). Store actions `reorderLocations` / `reorderBooths` / `reorderImages` are fire-and-forget — on failure they refetch the event to restore the canonical order. The booth-page `draggableImages` mirrors `filteredImages` into a real ref so the in-place splice survives across renders; person-filter-hidden images keep their original slots when the drag finishes.
- **Hall Plan**: Upload a floor plan image, click to place booths as percentage-positioned overlays. Drag to reposition. Color-coded by purchase status.
- **Hall Plan OCR Setup**: Tesseract.js scans the floor plan for booth numbers and stores pixel positions so detected booths can be picked from the map. Pipeline in [`HallPlanSetupModal.vue`](../app/components/HallPlanSetupModal.vue) runs vanilla Tesseract (no preprocessing, default PSM, no whitelist) at confidence threshold 28, then merges adjacent horizontal word pairs to handle splits like `10N` + `18` → `10N18`. Previously tried image preprocessing / PSM tweaks / pattern broadening but those regressed accuracy on real convention floor plans, so the simpler pipeline stays. Manual fallback: pattern replication in [`HallPlan.vue`](../app/components/HallPlan.vue)'s Draw mode lets you create a whole row/column of booths from one drawn rectangle (auto-increments the booth number, skipping `I`).
- **Catalog Image Split**: Images can be displayed in "split" mode (N horizontal sections) to navigate large catalog pages.
- **Catalog Annotations**: Draw a rectangle on a catalog page → linked to a Product. Sizes can be added per region. Pickers also include an "Add rect" button (auto-draws a 20×20% pending rectangle at center, then drag the body or corner handles to position/resize) and an inline `+` button next to size/category pills that lets you type a custom value (kept in session memory; persisted automatically once a product is saved with that value via the reactive `SIZES`/`QUICK_CATS` derived from `boothProducts`).
- **Article gallery**: For figures/items with multiple price sources. Each source = a Product row with shop name, price, planned/paid flags. Layout: image left, sources right (side-by-side, same as catalog). When the article has multiple photos (primary + sub-images), the image cell renders as a **carousel** — one photo at a time with prev/next chevrons, dot pagination, a `n / total` counter, horizontal swipe (≥40px, vertical-dominant drags ignored so the page can still scroll), and ←/→ keyboard navigation while the fullscreen viewer is open. The replace/delete affordances act on the currently visible photo; deleting is hidden on index 0 since the primary image is owned by the article itself. Implementation lives in [`CatalogImageViewer.vue`](../app/components/CatalogImageViewer.vue) — both the inline and fullscreen viewers share the same `gallery` / `galleryIndex` / swipe handlers.
- **Receipt mode**: Image displays alongside a checklist of the booth's products for checking off purchases.
- **OCR Price Extraction**: Click the chip icon on any catalog image to run Tesseract.js OCR and extract detected prices. Results can be one-click added as products.
- **Cross-off**: Click checkbox on any product to mark it purchased. Products strike through.
- **QR scan to booth (convention events only)**: Floating bottom-left purple button on the event detail page opens [`QrScannerModal.vue`](../app/components/QrScannerModal.vue). Uses the [`qr-scanner`](https://github.com/nimiq/qr-scanner) library, dynamically imported on first open to keep SSR clean (the library is browser-only). Decode → normalize URL (strip `http(s)://`, `www.`, trailing slash, lowercase) → match against the event's booths: (1) exact `booth.website` normalized match, (2) startsWith either direction (so a QR for `twitch.tv/miaow/about` still hits a booth set to `twitch.tv/miaow`), (3) fallback: last URL path segment vs `booth.slug` exact, then `booth.name` case-insensitive substring. On hit: stop camera and `navigateTo` the booth page. On miss: a yellow UAlert shows the scanned URL and scanning continues. 800ms debounce between handled scans.
- **Per-person marks (multi-marker products + per-person quantity)**: Any logged-in user with view access on an event can mark any visible product as planned/purchased for THEIR own person — view-share users no longer need edit rights to contribute "I want this." Marks live in `product_person_marks` (one row per (product, person), plus a `quantity` column for "I'm buying 2 of these"). [ProductItem.vue](app/components/ProductItem.vue) shows three controls: a `Plan?` toggle (orange pill, same UX as the article-gallery `Plan?`), a `Bought?` checkbox, and a −/N/+ qty stepper that appears when the viewer's own mark is set ("−" at qty=1 un-marks the product entirely). The marks endpoint accepts `{ quantity? }` in the body — clamped to ≥ 1, preserved on update when omitted, defaults to 1 on first create. The discount engine (`unitsForBooth` / `applyBoothDiscounts`) expands each marking person's contribution by their mark quantity, so two people each wanting one A4 = 2 units in the same BOGO batch.
- **Mark privacy**: ProductItem deliberately does NOT render other-person mark dots — each viewer sees only their own mark state. The per-person cost breakdown on the booth detail page (`personBreakdown`) is admin-only for the same reason. Marks are still returned by `GET /api/events/[id]` so admin tooling can see them, but the rest of the UI keeps individual purchases private.
- **Per-person totals defaulting**: Event header totals + booth-page header costs default `effectivePersonId` to `personsStore.currentPersonId ?? store.currentEvent.viewerPersonId ?? authStore.user.personId ?? null`. So a logged-in user lands on "my budget" view automatically, even before they touch the /account "View as" picker. Two accounts looking at the same booth now see THEIR OWN spend — no more cross-account doubling in the booth header. Editors may also mark on behalf of other persons by passing `personId` in the body to `POST /api/products/[id]/marks` — view-share users hit 403 if they try. The endpoint upserts, deletes the row when both flags become false, and recomputes the legacy aggregate `products.is_planned`/`is_purchased` (any-person OR) so legacy checks keep working. The GET /api/events response then SUBSTITUTES `isPlanned`/`isPurchased` on each product with the requesting user's *own* mark and ships the raw per-person `marks: []` array alongside, so `ProductItem.vue` shows the viewer's checkbox state plus small colored dots for other markers (purchased dots get a green ring). `CatalogImageViewer.vue`'s `markAsPaid`/`markAsPlanned` also route through `store.setMark`, making the article-gallery "only one source can be planned" rule a per-person rule — two people can independently plan different sources for the same article. **SSR cookie forwarding**: `fetchEvent`/`fetchEvents` in the events store pass `useRequestHeaders(['cookie'])` to internal $fetch on the server, otherwise the SSR call goes anonymous → `viewerPersonId` resolves to null → every per-product `isPurchased` flag comes back false and checkbox state appears to "reset" on every refresh while the totals still count the existing marks (the doubling bug). Don't remove the `ssrHeaders()` helper.
- **My purchases page** (`/account`): a per-event list of every product the viewer has marked as purchased for their own person. Backed by `GET /api/me/purchases` (joins marks → products → booths → events, filters by `users.personId`). Each row links to the booth and has a single ✕ to un-mark. Each event card has a "Clear all in this event" button; a top-level "Clear all" button hits `DELETE /api/me/purchases` with `{ eventId? }` — pass `eventId` for one event, empty body for all. The endpoint flips `isPurchased=false` and deletes mark rows that end up with both flags false, then recomputes the legacy aggregate. Useful for cleaning up doubled-up marks left over from the legacy-person → user-person migration. **Export**: each event group has an Export ▾ menu and there's a top-level "Export all ▾" — both offer **CSV** and **Excel (.xlsx)**. Generation is fully client-side via [`app/composables/useExport.ts`](../app/composables/useExport.ts) (`exportCsv` / `exportXlsx`): CSV is UTF-8-BOM (so Excel reads ¥/€/umlauts); the .xlsx is a real, warning-free OOXML package hand-built and zipped with **`fflate`** (tiny pure-JS dep) — bold header row, numeric cells for qty/prices so totals sum. "Export all" → CSV is one flat sheet with an Event column; → Excel is one sheet per event. Columns: Booth, Item, Size, Category, Qty, Unit price, Currency, Line total, Planned. No backend endpoint needed (reuses the already-loaded `/api/me/purchases` data).
- **Admin person management** (`/admin/persons`): admin-only page listing every Person row with linked-user info + mark count + drawn-product count. Endpoints: `GET /api/admin/persons` (with derived counts), `DELETE /api/admin/persons/[id]` (refuses to delete a Person currently linked to a User — must remove the User first; cascades to marks; FKs `users.personId` and `products.personId` are SET NULL so accounts and drawings survive), `DELETE /api/admin/persons/orphans` (bulk-deletes all Person rows not referenced by any `users.personId` — wipes the legacy standalone Persons that pre-date the user/person merge). The public `GET /api/persons` endpoint INNER-JOINs on users, so it returns ONLY user-linked persons — orphans don't pollute the /account "View as" picker.
- **Booth discounts**: Editors can attach two kinds of discount rules to a booth, scoped by `size` OR `category`, via the Discounts section on the booth detail page. CRUD endpoints: `POST /api/booths/[id]/discounts`, `PUT /api/discounts/[id]`, `DELETE /api/discounts/[id]` (all gated by `requireEventEdit`).
  - **`buy_get_free`** — "Buy N get M free". Engine groups matching priced units per currency, sorts desc, and for every batch of `triggerQty` zeroes out the cheapest `freeQty` (vendor's typical rule).
  - **`bundle`** — "N for a fixed total". Engine takes matching units priced in `bundleCurrency` ONLY (you can't mix EUR and USD into one bundle), sorts desc, and for every batch of `triggerQty` savings = `max(0, sum(batch) - bundlePrice)` (never penalises — if the bundle is more expensive than the cheapest possible batch, savings is 0 for that batch).
  - All store helpers return GROSS amounts (`getPlannedCostByCurrency`, `getPaidCostByCurrency`, `getBoothPlannedByCurrency`, `getBoothPaidByCurrency`). The subtraction `net = gross − savings` lives in the CONSUMER computeds (`events/[slug]/index.vue` `paidEntries`, `BoothCard.vue` `paidByCurrency`, `booth/[boothSlug].vue` `purchasedByCurrency`). This is deliberate: Pinia's setup-store function bodies don't always hot-reload cleanly, so colocating the math with the display ensures the net number is recomputed every time the consumer is evaluated — no risk of a stale store closure serving gross while the savings caption shows the right value. `getDiscountSavingsByCurrency` and `getBoothSavingsByCurrency(boothId)` return realised savings (computed on units marked `isPurchased`, not on merely-planned items). Forecast savings on planned items aren't surfaced anywhere — if you need them, mirror the helper with `unitsForBooth(_, _, 'planned')`. `getBoothBuyEverythingByCurrency(boothId)` returns a person-independent "what if I bought one of each item at this booth" total — for articles it picks the CHEAPEST source's price; non-article products contribute their unit price once (qty=1, not multiplied by `products.quantity`). Shown as a dim third row on `BoothCard.vue` and as a small caption under the planned/spent totals on the booth detail page header. The discount form picks the type via a two-button radio; only the relevant fields render. PUT clears the opposite type's fields when switching `type`.
- **i18n**: English + German throughout. `useLocale()` now supports `{name}` interpolation: `t('discount.previewLine', { pay: 2, trigger: 3, free: 1, scope: 'A4' })` substitutes tokens — used by the discount form preview.

## Environment Variables
| Var | Purpose | Default |
|-----|---------|---------|
| `ADMIN_DEFAULT_USERNAME` | First-run admin username | `admin` |
| `ADMIN_DEFAULT_PASSWORD` | First-run admin password (only used if no users exist) | random, printed once |
| `UPLOAD_DIR` | Where uploaded images are stored | `./public/uploads` (dev) / `/app/uploads` (Docker) |
| `HOST` / `PORT` | Nitro listen address | `0.0.0.0` / `3000` |
| runtimeConfig `dbPath` | SQLite file path | `./data/merch-tracker.db` |

## Quirks / Gotchas
- `nitro.publicAssets` indexes at **build time** — cannot serve runtime-uploaded files. Use the explicit `server/routes/uploads/[filename].get.ts` instead. Don't reintroduce publicAssets for `/uploads`.
- `UModal` uses a boolean v-model — no `:open=` prop.
- Don't wrap modals or panels in `<Transition>` (unstyled in Nuxt UI defaults).
- Fullscreen overlays must use `z-[9999]`; the sticky navbar sits above lower z-indexes.
- The image panel in CatalogImageViewer needs `self-start` so the grid doesn't stretch it past the image height (otherwise overlay percentages misalign).
- **Person ↔ user link**: every User now has an auto-created Person on signup. The link is `users.personId` (1:1). Auto-creation lives in `createPersonForUser(userId, displayName)` in [server/utils/auth.ts](../server/utils/auth.ts); call it from every new user creation path. The navbar dropdown for switching person is **gone** — the current-person filter defaults to the logged-in user's own person. Admins can override via the "View as" picker on `/account`.
- Legacy standalone persons (no linked user) still exist; they're not auto-cleaned. The Account page color picker only edits the caller's linked person; the admin users page can edit any user's color.

## Adding New Features
- **New entity type** → add to `schema.ts`, `db/index.ts` CREATE TABLE, then API routes following existing patterns. Add `requireRole` guard on mutations (once Phase 3 lands).
- **New modal** → component in `app/components/`, `v-model="boolean"` pattern with `UModal + UCard`.
- **New page** → `app/pages/` following Nuxt 4 file-based routing.
- **New strings** → add keys to both `en` and `de` blocks in `useLocale.ts` (compiler enforces parity).
- **New env var** → document in this file + `.env.example`.

## Running the App
**Dev:**
```bash
npm install
npm run dev      # http://localhost:3000
```

**Docker compose:**
```bash
docker compose up -d --build
```
See [`README.md`](../README.md) for full deployment instructions.

## Roadmap
- ~~**Phase 3** — `requireRole` middleware on every mutation endpoint.~~ Done.
- ~~**Phase 4** — Per-event ownership + public/private + per-user + per-group sharing + admin user/group management.~~ Done.
- ~~**Phase 5** — Magic-link invite tokens + per-product ownership with visibility filtering.~~ Done.
- **Phase 6 candidates** — View-share users adding their own products (contribute permission level between view and edit). Per-product invitation / sharing (let a `user` invite specific people to see THEIR products on an event without exposing them globally). Email-based magic-link delivery for invites.

## Future Ideas
- Multiple currency support with conversion rates
- Export shopping list to PDF
- QR code scanner for booth confirmation
- Budget cap alerts
- Barcode/price tag OCR improvement with image preprocessing
