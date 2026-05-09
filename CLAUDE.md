# MerchTracker — Project Guide

## Overview
Full-stack Nuxt 4 app for planning merch purchases at anime conventions and travel destinations.
Two modes: **Convention** (halls + booths) and **Travel** (countries/cities + shops).

## Tech Stack
- **Framework**: Nuxt 4 with Vue 3 Composition API
- **UI**: @nuxt/ui (Tailwind-based component library)
- **State**: Pinia (`app/stores/events.ts`)
- **Database**: SQLite via `better-sqlite3` + Drizzle ORM
- **OCR**: `tesseract.js` (client-side, loaded lazily in `CatalogImageViewer.vue`)
- **File uploads**: H3 multipart form data → `public/uploads/`

## Directory Structure (Nuxt 4 app/ layout)
```
app/
  app.vue           # Root component
  layouts/
    default.vue     # Main layout with navbar
  pages/
    index.vue       # Event dashboard
    events/
      create.vue    # New event form
      [id]/
        index.vue   # Event detail (halls/locations + booths)
        hallplan.vue # Interactive hall map
        booth/
          [boothId].vue # Booth detail with products & catalog images
  components/
    EventCard.vue         # Card on dashboard
    LocationCard.vue      # Hall/city collapsible section
    BoothCard.vue         # Booth mini-card with progress bar
    ProductItem.vue       # Single product row with cross-off
    HallPlan.vue          # Interactive canvas-free floor plan (CSS overlay on img)
    CatalogImageViewer.vue # Image viewer with split mode + OCR
    AddLocationModal.vue
    AddBoothModal.vue
    AddProductModal.vue
    UploadCatalogModal.vue
    UploadFloorPlanModal.vue
    EditEventModal.vue
  stores/
    events.ts       # Main Pinia store with all state and API calls

server/
  db/
    schema.ts       # Drizzle schema definitions
    index.ts        # DB singleton + table creation
  api/
    events/         # CRUD for events
    locations/      # CRUD for halls/cities
    booths/         # CRUD for booths/shops
    products/       # CRUD for products
    images/         # Update/delete catalog images
    upload/
      image.post.ts    # Upload catalog images (multipart)
      floorplan.post.ts # Upload floor plan for a location
  utils/
    id.ts           # generateId() and now() helpers

data/               # SQLite DB file (auto-created)
public/uploads/     # Uploaded images (auto-created)
```

## Database Schema
| Table | Purpose |
|-------|---------|
| `events` | Top-level events (convention or travel) |
| `locations` | Halls (convention) or cities/areas (travel) |
| `booths` | Individual vendor booths or shops, with optional map coordinates |
| `catalog_images` | Uploaded product catalog pages per booth |
| `products` | Items to buy, with price, size, category, purchased flag |

All IDs are UUIDs. SQLite with WAL mode + foreign keys enabled.

## Key Features
- **Hall Plan**: Upload a floor plan image, click to place booths as percentage-positioned overlays. Drag to reposition. Color-coded by purchase status.
- **Catalog Image Split**: Images can be displayed in "split" mode (N horizontal sections) to navigate large catalog pages.
- **OCR Price Extraction**: Click the chip icon on any catalog image to run Tesseract.js OCR and extract detected prices. Results can be one-click added as products.
- **Price Tracking**: Each product has a price field. Total/spent costs calculated per booth and per event.
- **Cross-off**: Click checkbox on any product to mark it purchased. Products strike through.

## Adding New Features
- New entity type → add to `schema.ts`, `db/index.ts` CREATE TABLE, then create API routes following existing patterns
- New modal → create component in `app/components/`, follow `v-model="boolean"` pattern with `UModal + UCard`
- New page → add to `app/pages/` following Nuxt 4 file-based routing

## Running the App
```bash
npm install
npm run dev
```
App runs at http://localhost:3000

## Future Ideas
- Multiple currency support with conversion rates
- Export shopping list to PDF
- QR code scanner for booth confirmation
- Collaborative lists (share event with friends)
- Budget cap alerts
- Image region selection (draw rectangle on catalog image to link directly to product)
- Barcode/price tag OCR improvement with image preprocessing
