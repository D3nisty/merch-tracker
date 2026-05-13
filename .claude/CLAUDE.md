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
    AddLocationModal.vue
    AddBoothModal.vue
    AddProductModal.vue
    UploadCatalogModal.vue
    UploadFloorPlanModal.vue
    EditEventModal.vue
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
| `users` | Account records (username, scrypt-hashed password, role: admin/editor/user) |
| `sessions` | Session tokens with `expires_at` (30-day TTL) |
| `persons` | Colored labels for tagging items (NOT auth subjects) |
| `events` | Top-level events (convention or travel) |
| `locations` | Halls (convention) or cities/areas (travel) |
| `booths` | Individual vendor booths or shops, with optional map coordinates |
| `catalog_images` | Uploaded product catalog pages per booth (catalog / article / receipt) |
| `products` | Items to buy, with price, size, category, purchased flag, optional region overlay |
| `booth_price_presets` | Per-booth quick-fill price chips |

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

**API enforcement** (Phase 3 — done):
- Every mutation endpoint (`POST`/`PUT`/`DELETE` under `events/`, `locations/`, `booths/`, `products/`, `persons/`, `presets/`, `images/`, `upload/`) calls `await requireRole(event, ['admin', 'editor'])` as the first line.
- Reads (`GET`) stay public so guests can browse.
- Auth endpoints: `login`/`logout`/`me` are public; `change-password` uses `requireUser` (any logged-in role).
- Client-side: [`app/plugins/auth-redirect.client.ts`](../app/plugins/auth-redirect.client.ts) wraps `$fetch` to catch 401 on any mutation, clear `authStore.user`, and `navigateTo('/login?redirect=…')`. Skips redirect on `/api/auth/me` and `/api/auth/login` so they can return 401 normally.
- **Phase 4** will add per-resource ownership (each event/product has an `ownerId`) so a `role: 'user'` account can mutate their own stuff.

**Default admin seed**: On first DB creation, if `users` is empty, seed an admin from `ADMIN_DEFAULT_USERNAME` (default `admin`) and `ADMIN_DEFAULT_PASSWORD`. If `ADMIN_DEFAULT_PASSWORD` is unset, a random one is generated and printed once to stdout. **Never hardcode the password in source.**

**Reset admin password without losing data**: `npm run reset-admin` (script in [`scripts/reset-admin.mjs`](../scripts/reset-admin.mjs)) — rewrites the admin user's password hash from `ADMIN_DEFAULT_*` env vars and clears all sessions. Operates directly on the SQLite file, so for Docker you must `docker compose stop merch-tracker` first to release the WAL lock.

## Key Features
- **Hall Plan**: Upload a floor plan image, click to place booths as percentage-positioned overlays. Drag to reposition. Color-coded by purchase status.
- **Hall Plan OCR Setup**: Tesseract.js scans the floor plan for booth numbers and stores pixel positions so detected booths can be picked from the map.
- **Catalog Image Split**: Images can be displayed in "split" mode (N horizontal sections) to navigate large catalog pages.
- **Catalog Annotations**: Draw a rectangle on a catalog page → linked to a Product. Sizes can be added per region.
- **Article gallery**: For figures/items with multiple price sources. Each source = a Product row with shop name, price, planned/paid flags. Layout: image left, sources right (side-by-side, same as catalog).
- **Receipt mode**: Image displays alongside a checklist of the booth's products for checking off purchases.
- **OCR Price Extraction**: Click the chip icon on any catalog image to run Tesseract.js OCR and extract detected prices. Results can be one-click added as products.
- **Cross-off**: Click checkbox on any product to mark it purchased. Products strike through.
- **i18n**: English + German throughout.

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
- Person filter / current person is **purely a tagging concept** today, unrelated to the logged-in user. Don't conflate.

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
- **Phase 4** — Per-resource ownership (`ownerId` columns), `isPublic` flag on events, dashboard filtering by accessible events. Per-resource API checks (an editor can edit anything; a `user` can edit only what they own).
- **Phase 5** — Groups + invite-link tokens (no email service needed).

## Future Ideas
- Multiple currency support with conversion rates
- Export shopping list to PDF
- QR code scanner for booth confirmation
- Budget cap alerts
- Barcode/price tag OCR improvement with image preprocessing
