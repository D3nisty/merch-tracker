import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'editor', 'user'] }).notNull().default('user'),
  // Each user is linked to a Person row (auto-created on signup). The person
  // carries the color used for tagging things on shared events. NULL only for
  // legacy users that haven't been migrated yet.
  personId: text('person_id'),
  createdAt: text('created_at').notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
})

export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull(),
})

export const groupMembers = sqliteTable('group_members', {
  id: text('id').primaryKey(),
  groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
})

export const eventShares = sqliteTable('event_shares', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  level: text('level', { enum: ['view', 'edit'] }).notNull().default('view'),
  createdAt: text('created_at').notNull(),
})

export const eventGroupShares = sqliteTable('event_group_shares', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull(),
  groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  level: text('level', { enum: ['view', 'edit'] }).notNull().default('view'),
  createdAt: text('created_at').notNull(),
})

export const eventInvites = sqliteTable('event_invites', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull(),
  token: text('token').notNull().unique(),
  level: text('level', { enum: ['view', 'edit'] }).notNull().default('view'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at'),
})

export const persons = sqliteTable('persons', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull().default('purple'),
  createdAt: text('created_at').notNull(),
})

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  slug: text('slug').unique(),
  name: text('name').notNull(),
  type: text('type', { enum: ['convention', 'travel'] }).notNull(),
  // `date` is the start date (kept named `date` for backward compat with
  // legacy single-day events). `dateTo` is the optional end date — when
  // present and != date, the UI renders a range. Conventions span multiple
  // days; travel events can too.
  date: text('date'),
  dateTo: text('date_to'),
  location: text('location'),
  description: text('description'),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
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
  slug: text('slug'),
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
  // Optional booth icon — either a local upload (`/uploads/icon-xxx.png`) or
  // an external URL (`https://…`). One image per booth; shown on the booth
  // card on the event dashboard AND in the booth detail page header so the
  // user can recognise an artist's branding at a glance.
  iconPath: text('icon_path'),
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
  personId: text('person_id').references(() => persons.id, { onDelete: 'set null' }),
  parentId: text('parent_id'),
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
  isPlanned: integer('is_planned', { mode: 'boolean' }).notNull().default(false),
  priority: integer('priority').notNull().default(0),
  notes: text('notes'),
  website: text('website'),
  // Region within catalog image (percentage 0-100)
  personId: text('person_id').references(() => persons.id, { onDelete: 'set null' }),
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
  regionX: real('region_x'),
  regionY: real('region_y'),
  regionW: real('region_w'),
  regionH: real('region_h'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type Group = typeof groups.$inferSelect
export type NewGroup = typeof groups.$inferInsert
export type GroupMember = typeof groupMembers.$inferSelect
export type EventShare = typeof eventShares.$inferSelect
export type NewEventShare = typeof eventShares.$inferInsert
export type EventGroupShare = typeof eventGroupShares.$inferSelect
export type NewEventGroupShare = typeof eventGroupShares.$inferInsert
export type EventInvite = typeof eventInvites.$inferSelect
export type NewEventInvite = typeof eventInvites.$inferInsert
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

// Per-person mark on a product: each person independently tracks whether
// they plan to buy it / have bought it. Multiple persons can mark the same
// product without owning the catalog rectangle.
export const productPersonMarks = sqliteTable('product_person_marks', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  personId: text('person_id').notNull().references(() => persons.id, { onDelete: 'cascade' }),
  isPlanned: integer('is_planned', { mode: 'boolean' }).notNull().default(false),
  isPurchased: integer('is_purchased', { mode: 'boolean' }).notNull().default(false),
  // How many copies this person wants/bought. Defaults to 1 when the mark is
  // first created; ProductItem's stepper writes 2, 3, … as the person buys
  // more of the same item. Used by the discount engine (BOGO/bundle batches
  // count this many units per person) and by the booth header total (sum
  // across persons of qty × price).
  quantity: integer('quantity').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// Booth-level discount rules. Two shapes, distinguished by `type`:
//   - 'buy_get_free': every batch of `triggerQty` matching units, the cheapest
//     `freeQty` go free. e.g. triggerQty=3, freeQty=1 → "buy 2, get 3rd free".
//   - 'bundle': every batch of `triggerQty` matching units is charged a flat
//     `bundlePrice` (in `bundleCurrency`) instead of the sum of unit prices.
//     Only matches products priced in the same currency. e.g. triggerQty=3,
//     bundlePrice=40, bundleCurrency='EUR' → "3 keychains for €40 (save €5)".
// scopeType + scopeValue narrows the matching products inside the booth.
export const boothDiscounts = sqliteTable('booth_discounts', {
  id: text('id').primaryKey(),
  boothId: text('booth_id').notNull().references(() => booths.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  scopeType: text('scope_type').notNull(), // 'size' | 'category'
  scopeValue: text('scope_value').notNull(),
  type: text('type').notNull().default('buy_get_free'), // 'buy_get_free' | 'bundle'
  triggerQty: integer('trigger_qty').notNull(),
  freeQty: integer('free_qty'),               // required for 'buy_get_free'
  bundlePrice: real('bundle_price'),          // required for 'bundle'
  bundleCurrency: text('bundle_currency'),    // required for 'bundle'
  createdAt: text('created_at').notNull(),
})

export type ProductPersonMark = typeof productPersonMarks.$inferSelect
export type NewProductPersonMark = typeof productPersonMarks.$inferInsert
export type BoothDiscount = typeof boothDiscounts.$inferSelect
export type NewBoothDiscount = typeof boothDiscounts.$inferInsert

// Per-booth share — lets the event owner grant a single artist edit access
// to JUST their own booth without exposing the rest of the event. Layered
// on top of (not replacing) event-level shares: if you have event-edit you
// can edit every booth regardless. UNIQUE so granting twice is a no-op.
export const boothShares = sqliteTable('booth_shares', {
  id: text('id').primaryKey(),
  boothId: text('booth_id').notNull().references(() => booths.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  level: text('level', { enum: ['view', 'edit'] }).notNull().default('edit'),
  createdAt: text('created_at').notNull(),
})

export type BoothShareRow = typeof boothShares.$inferSelect
export type NewBoothShareRow = typeof boothShares.$inferInsert

// Per-booth group share — group members inherit the level (mirrors
// event_group_shares for events). UNIQUE so granting twice updates rather
// than duplicates. Combined with `boothShares` (user-direct) the booth's
// edit pool is union(user-shares) ∪ union(group-shares).
export const boothGroupShares = sqliteTable('booth_group_shares', {
  id: text('id').primaryKey(),
  boothId: text('booth_id').notNull().references(() => booths.id, { onDelete: 'cascade' }),
  groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  level: text('level', { enum: ['view', 'edit'] }).notNull().default('edit'),
  createdAt: text('created_at').notNull(),
})

export type BoothGroupShareRow = typeof boothGroupShares.$inferSelect
export type NewBoothGroupShareRow = typeof boothGroupShares.$inferInsert

// Magic-link invites for booth-level access — mirrors `event_invites` but
// scoped to a single booth. Redeeming creates a `boothShares` row for the
// caller; the token stays valid (multi-use) until revoked or expired.
export const boothInvites = sqliteTable('booth_invites', {
  id: text('id').primaryKey(),
  boothId: text('booth_id').notNull().references(() => booths.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  level: text('level', { enum: ['view', 'edit'] }).notNull().default('edit'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at'),
})

export type BoothInviteRow = typeof boothInvites.$inferSelect
export type NewBoothInviteRow = typeof boothInvites.$inferInsert
