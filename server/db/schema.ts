import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core'

export const persons = sqliteTable('persons', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull().default('purple'),
  createdAt: text('created_at').notNull(),
})

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['convention', 'travel'] }).notNull(),
  date: text('date'),
  location: text('location'),
  description: text('description'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// Halls (for conventions) or Cities/Areas (for travel)
export const locations = sqliteTable('locations', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type', { enum: ['hall', 'city', 'country', 'area', 'district'] }).notNull(),
  floorPlanImage: text('floor_plan_image'),
  layoutData: text('layout_data'),
  notes: text('notes'),
  dateFrom: text('date_from'),
  dateTo: text('date_to'),
  createdAt: text('created_at').notNull(),
})

// Booths (for conventions) or Shops/Stops (for travel)
export const booths = sqliteTable('booths', {
  id: text('id').primaryKey(),
  locationId: text('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  boothNr: text('booth_nr'),
  hallNr: text('hall_nr'),
  mapX: real('map_x'),
  mapY: real('map_y'),
  mapW: real('map_w'),
  mapH: real('map_h'),
  website: text('website'),
  notes: text('notes'),
  shopCategory: text('shop_category'),
  personId: text('person_id').references(() => persons.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull(),
})

export const boothPricePresets = sqliteTable('booth_price_presets', {
  id: text('id').primaryKey(),
  boothId: text('booth_id').notNull().references(() => booths.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  price: real('price').notNull(),
  currency: text('currency').notNull().default('EUR'),
  createdAt: text('created_at').notNull(),
})

// Catalog images uploaded for a booth
export const catalogImages = sqliteTable('catalog_images', {
  id: text('id').primaryKey(),
  boothId: text('booth_id').notNull().references(() => booths.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  originalName: text('original_name').notNull(),
  path: text('path').notNull(),
  displayMode: text('display_mode', { enum: ['full', 'split'] }).notNull().default('full'),
  splitCount: integer('split_count').default(2),
  sortOrder: integer('sort_order').notNull().default(0),
  customName: text('custom_name'),
  imageType: text('image_type', { enum: ['catalog', 'article', 'receipt'] }).notNull().default('catalog'),
  createdAt: text('created_at').notNull(),
})

// Individual products/items to buy
export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  boothId: text('booth_id').notNull().references(() => booths.id, { onDelete: 'cascade' }),
  catalogImageId: text('catalog_image_id').references(() => catalogImages.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  price: real('price'),
  currency: text('currency').notNull().default('EUR'),
  quantity: integer('quantity').notNull().default(1),
  size: text('size'),
  category: text('category'),
  isPurchased: integer('is_purchased', { mode: 'boolean' }).notNull().default(false),
  priority: integer('priority').notNull().default(0),
  notes: text('notes'),
  website: text('website'),
  // Region within catalog image (percentage 0-100)
  personId: text('person_id').references(() => persons.id, { onDelete: 'set null' }),
  regionX: real('region_x'),
  regionY: real('region_y'),
  regionW: real('region_w'),
  regionH: real('region_h'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export type Person = typeof persons.$inferSelect
export type NewPerson = typeof persons.$inferInsert
export type BoothPricePreset = typeof boothPricePresets.$inferSelect
export type NewBoothPricePreset = typeof boothPricePresets.$inferInsert
export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert
export type Location = typeof locations.$inferSelect
export type NewLocation = typeof locations.$inferInsert
export type Booth = typeof booths.$inferSelect
export type NewBooth = typeof booths.$inferInsert
export type CatalogImage = typeof catalogImages.$inferSelect
export type NewCatalogImage = typeof catalogImages.$inferInsert
export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
