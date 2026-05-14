# MerchTracker — Project Guide

## Overview
Full-stack Nuxt 4 app for planning merch purchases at anime conventions and travel destinations.
Two modes: **Convention** (halls + booths) and **Travel** (countries/cities + shops).

## Tech Stack
- **Framework**: Nuxt 4 with Vue 3 Composition API
- **UI**: @nuxt/ui (Tailwind-based component library)
- **State**: Pinia (`app/stores/events.ts`, `app/stores/auth.ts`, `app/stores/persons.ts`)
- **Database**: SQLite via `better-sqlite3` + Drizzle ORM
- **Auth**: Rolled in-house. `scrypt` password hash (Node built-in), httpOnly session cookies, no third-party dependency. See `server/utils/auth.ts`.
- **OCR**: `tesseract.js` (client-side, loaded lazily in `CatalogImageViewer.vue` and `HallPlanSetupModal.vue`)
- **QR scanning**: `qr-scanner` (~13 KB, BSD, bundled worker). Dynamically imported inside `QrScannerModal.vue` so it never runs at SSR.
- **File uploads**: H3 multipart form data → `UPLOAD_DIR` (defaults to `public/uploads/`), served at `/uploads/[filename]` via a dynamic server route. Do NOT use Nitro `publicAssets` for this path — it pre-indexes at build time and 404s on runtime uploads.
- **Remote image URLs**: Both catalog images and floor plans accept external URLs as an alternative to file upload. The `catalogImages.path` / `locations.floorPlanImage` column stores the raw URL (`http(s)://…`); the browser fetches it directly, no server round-trip. Use `POST /api/images/from-url` for catalog images, `PUT /api/locations/[id]` with `floorPlanImage = <url>` for floor plans. `filename` is set to empty string for remote images so it's clear nothing local is owned.
- **i18n**: Hand-rolled `useLocale` composable in `app/composables/useLocale.ts` with `en` + `de`. `de: typeof en` enforces parity at compile time.

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
    invite/
      [token].vue        # Magic-link landing page: introspect token, signup or accept
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
| `persons` | Colored labels for tagging items. Every User gets one auto-created on signup (1:1 via `users.personId`). Legacy admin-managed standalone persons (no linked user) still exist for backwards compatibility |
| `events` | Top-level events. `isPublic` flag and `ownerId` drive permissions |
| `locations` | Halls (convention) or cities/areas (travel) |
| `booths` | Individual vendor booths or shops, with optional map coordinates |
| `catalog_images` | Uploaded product catalog pages per booth (catalog / article / receipt) |
| `products` | Items to buy, with price, size, category, optional region overlay, `ownerId` (creator) for visibility filtering. `is_planned`/`is_purchased` are now MAINTAINED AS ANY-PERSON AGGREGATES (server-side) but the API substitutes them with the *requesting user's* per-person mark when returning the event tree — so existing single-perspective UIs (checkboxes, strike-through) keep working without per-call refactors. |
| `booth_price_presets` | Per-booth quick-fill price chips |
| `product_person_marks` | Per-(product, person) `is_planned`/`is_purchased` flags. UNIQUE on (product_id, person_id). Rows with both flags false are deleted by the marks endpoint to keep the table lean. Multiple persons can independently mark the same product — this is how view-share users contribute "I want this" without earning edit rights. |
| `booth_discounts` | Per-booth discount rules with two shapes distinguished by `type`. `'buy_get_free'` uses `trigger_qty` + `free_qty` (cheapest M go free per batch of N). `'bundle'` uses `trigger_qty` + `bundle_price` + `bundle_currency` (every batch of N is charged a flat total; only matches products priced in the same currency). `scope_type` is `'size'` or `'category'`, `scope_value` is the matching value. On legacy DBs `free_qty` has a leftover NOT NULL constraint; bundle rows write `0` as a placeholder. Discounts auto-apply when computing planned/paid totals. |

All IDs are UUIDs. SQLite with WAL mode + foreign keys enabled.

## Auth & Permissions (current state)

**Roles**: `admin`, `editor`, `user`.

- `authStore.isLoggedIn` — true if a session is active.
- `authStore.isAdmin` — true if `role === 'admin'`.
- `authStore.isEditing` — **legacy flag**, computed as `role === 'admin' || role === 'editor'`. Used by ~30 places (BoothCard, CatalogImageViewer, ProductItem, etc.) to decide whether to render edit affordances. Treat this as "can mutate" — eventually replaced by per-resource permission checks.

**Guest view (logged out OR `role === 'user'`)**:
- Travel events hidden on dashboard
- Person filter dropdown hidden, persisted person selection auto-cleared
- Paid + Spent totals hidden on event/booth pages
- Person dots/labels hidden everywhere
- Catalog overlay boxes use neutral purple (per-person color suppressed via `personHex` returning default when not editing)
- Plan?/Paid? buttons on article sources hidden
- "Planned from X" / "Paid from X" summary boxes hidden
- Product + receipt checkboxes disabled
- Listed prices still visible

**API enforcement** (Phase 3 + Phase 4 — done):
- **Per-event permissions** live in [`server/utils/permissions.ts`](../server/utils/permissions.ts):
  - `canViewEvent(user, eventId)` — admin OR public OR owner OR direct share OR group share (any level)
  - `canEditEvent(user, eventId)` — admin OR editor role OR owner OR direct share `edit` OR group share `edit`
  - `requireEventMark(event, eventId)` — *softer than edit*. Requires `requireUser` AND `canViewEvent`. Used only by `POST /api/products/[id]/marks` so view-share users can mark for their own person without earning edit rights. The endpoint additionally enforces `personId` matches the requester's linked person unless they ALSO pass `canEditEvent` (editors can mark on others' behalf).
  - Helpers `requireEventView` / `requireEventEdit` throw 401/403/404 appropriately
  - Resource-to-event walkers: `eventIdForLocation`, `eventIdForBooth`, `eventIdForProduct`, `eventIdForImage`, `eventIdForPreset`, `eventIdForDiscount` — every nested mutation looks up the parent event and gates on it
  - `accessibleEventIds(user)` — used by `GET /api/events` to filter the list
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
- **Hall Plan**: Upload a floor plan image, click to place booths as percentage-positioned overlays. Drag to reposition. Color-coded by purchase status.
- **Hall Plan OCR Setup**: Tesseract.js scans the floor plan for booth numbers and stores pixel positions so detected booths can be picked from the map. Pipeline in [`HallPlanSetupModal.vue`](../app/components/HallPlanSetupModal.vue) runs vanilla Tesseract (no preprocessing, default PSM, no whitelist) at confidence threshold 28, then merges adjacent horizontal word pairs to handle splits like `10N` + `18` → `10N18`. Previously tried image preprocessing / PSM tweaks / pattern broadening but those regressed accuracy on real convention floor plans, so the simpler pipeline stays. Manual fallback: pattern replication in [`HallPlan.vue`](../app/components/HallPlan.vue)'s Draw mode lets you create a whole row/column of booths from one drawn rectangle (auto-increments the booth number, skipping `I`).
- **Catalog Image Split**: Images can be displayed in "split" mode (N horizontal sections) to navigate large catalog pages.
- **Catalog Annotations**: Draw a rectangle on a catalog page → linked to a Product. Sizes can be added per region. Pickers also include an "Add rect" button (auto-draws a 20×20% pending rectangle at center, then drag the body or corner handles to position/resize) and an inline `+` button next to size/category pills that lets you type a custom value (kept in session memory; persisted automatically once a product is saved with that value via the reactive `SIZES`/`QUICK_CATS` derived from `boothProducts`).
- **Article gallery**: For figures/items with multiple price sources. Each source = a Product row with shop name, price, planned/paid flags. Layout: image left, sources right (side-by-side, same as catalog).
- **Receipt mode**: Image displays alongside a checklist of the booth's products for checking off purchases.
- **OCR Price Extraction**: Click the chip icon on any catalog image to run Tesseract.js OCR and extract detected prices. Results can be one-click added as products.
- **Cross-off**: Click checkbox on any product to mark it purchased. Products strike through.
- **QR scan to booth (convention events only)**: Floating bottom-left purple button on the event detail page opens [`QrScannerModal.vue`](../app/components/QrScannerModal.vue). Uses the [`qr-scanner`](https://github.com/nimiq/qr-scanner) library, dynamically imported on first open to keep SSR clean (the library is browser-only). Decode → normalize URL (strip `http(s)://`, `www.`, trailing slash, lowercase) → match against the event's booths: (1) exact `booth.website` normalized match, (2) startsWith either direction (so a QR for `twitch.tv/miaow/about` still hits a booth set to `twitch.tv/miaow`), (3) fallback: last URL path segment vs `booth.slug` exact, then `booth.name` case-insensitive substring. On hit: stop camera and `navigateTo` the booth page. On miss: a yellow UAlert shows the scanned URL and scanning continues. 800ms debounce between handled scans.
- **Per-person marks (multi-marker products)**: Any logged-in user with view access on an event can mark any visible product as planned/purchased for THEIR own person — view-share users no longer need edit rights to contribute "I want this." Marks live in `product_person_marks` (one row per (product, person)). Editors may also mark on behalf of other persons by passing `personId` in the body to `POST /api/products/[id]/marks` — view-share users hit 403 if they try. The endpoint upserts, deletes the row when both flags become false, and recomputes the legacy aggregate `products.is_planned`/`is_purchased` (any-person OR) so legacy checks keep working. The GET /api/events response then SUBSTITUTES `isPlanned`/`isPurchased` on each product with the requesting user's *own* mark and ships the raw per-person `marks: []` array alongside, so `ProductItem.vue` shows the viewer's checkbox state plus small colored dots for other markers (purchased dots get a green ring). `CatalogImageViewer.vue`'s `markAsPaid`/`markAsPlanned` also route through `store.setMark`, making the article-gallery "only one source can be planned" rule a per-person rule — two people can independently plan different sources for the same article.
- **Booth discounts**: Editors can attach two kinds of discount rules to a booth, scoped by `size` OR `category`, via the Discounts section on the booth detail page. CRUD endpoints: `POST /api/booths/[id]/discounts`, `PUT /api/discounts/[id]`, `DELETE /api/discounts/[id]` (all gated by `requireEventEdit`).
  - **`buy_get_free`** — "Buy N get M free". Engine groups matching priced units per currency, sorts desc, and for every batch of `triggerQty` zeroes out the cheapest `freeQty` (vendor's typical rule).
  - **`bundle`** — "N for a fixed total". Engine takes matching units priced in `bundleCurrency` ONLY (you can't mix EUR and USD into one bundle), sorts desc, and for every batch of `triggerQty` savings = `max(0, sum(batch) - bundlePrice)` (never penalises — if the bundle is more expensive than the cheapest possible batch, savings is 0 for that batch).
  - Savings are subtracted from `getPlannedCostByCurrency` and `getPaidCostByCurrency`; `getDiscountSavingsByCurrency` and `getBoothSavingsByCurrency(boothId)` expose the savings so the event/booth headers can show a green "− X saved" line under the planned total. The discount form picks the type via a two-button radio; only the relevant fields render. PUT clears the opposite type's fields when switching `type`.
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
