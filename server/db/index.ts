import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes, scryptSync } from 'node:crypto'
import { generateId, now, toSlug } from '../utils/id'

let _db: ReturnType<typeof drizzle> | null = null

export function useDb() {
  if (_db) return _db

  const config = useRuntimeConfig()
  const dbPath = config.dbPath || './data/merch-tracker.db'

  mkdirSync(dirname(dbPath), { recursive: true })

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  _db = drizzle(sqlite, { schema })

  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','editor','user')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE(group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS event_shares (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      level TEXT NOT NULL DEFAULT 'view' CHECK(level IN ('view','edit')),
      created_at TEXT NOT NULL,
      UNIQUE(event_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS event_group_shares (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      level TEXT NOT NULL DEFAULT 'view' CHECK(level IN ('view','edit')),
      created_at TEXT NOT NULL,
      UNIQUE(event_id, group_id)
    );

    CREATE TABLE IF NOT EXISTS event_invites (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      level TEXT NOT NULL DEFAULT 'view' CHECK(level IN ('view','edit')),
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS persons (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'purple',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('convention','travel')),
      date TEXT,
      date_to TEXT,
      location TEXT,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('hall','city','country','area','district')),
      floor_plan_image TEXT,
      layout_data TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS booths (
      id TEXT PRIMARY KEY,
      slug TEXT,
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      booth_nr TEXT,
      hall_nr TEXT,
      map_x REAL,
      map_y REAL,
      map_w REAL,
      map_h REAL,
      website TEXT,
      notes TEXT,
      icon_path TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalog_images (
      id TEXT PRIMARY KEY,
      booth_id TEXT NOT NULL REFERENCES booths(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      path TEXT NOT NULL,
      display_mode TEXT NOT NULL DEFAULT 'full' CHECK(display_mode IN ('full','split')),
      split_count INTEGER DEFAULT 2,
      sort_order INTEGER NOT NULL DEFAULT 0,
      latitude REAL,
      longitude REAL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_persons (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE(event_id, person_id)
    );

    CREATE TABLE IF NOT EXISTS location_receipts (
      id TEXT PRIMARY KEY,
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      path TEXT NOT NULL,
      display_mode TEXT NOT NULL DEFAULT 'full' CHECK(display_mode IN ('full','split')),
      split_count INTEGER DEFAULT 2,
      sort_order INTEGER NOT NULL DEFAULT 0,
      custom_name TEXT,
      latitude REAL,
      longitude REAL,
      paid_by_person_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS location_receipt_items (
      id TEXT PRIMARY KEY,
      receipt_id TEXT NOT NULL REFERENCES location_receipts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price REAL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      sort_order INTEGER NOT NULL DEFAULT 0,
      split_among_marked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS location_receipt_item_marks (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES location_receipt_items(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      UNIQUE(item_id, person_id)
    );

    CREATE TABLE IF NOT EXISTS booth_price_presets (
      id TEXT PRIMARY KEY,
      booth_id TEXT NOT NULL REFERENCES booths(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      booth_id TEXT NOT NULL REFERENCES booths(id) ON DELETE CASCADE,
      catalog_image_id TEXT REFERENCES catalog_images(id) ON DELETE SET NULL,
      person_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
      owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT,
      price REAL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      quantity INTEGER NOT NULL DEFAULT 1,
      size TEXT,
      category TEXT,
      is_purchased INTEGER NOT NULL DEFAULT 0,
      is_planned INTEGER NOT NULL DEFAULT 0,
      priority INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      website TEXT,
      region_x REAL,
      region_y REAL,
      region_w REAL,
      region_h REAL,
      split_among_marked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_person_marks (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      is_planned INTEGER NOT NULL DEFAULT 0,
      is_purchased INTEGER NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(product_id, person_id)
    );

    CREATE TABLE IF NOT EXISTS booth_discounts (
      id TEXT PRIMARY KEY,
      booth_id TEXT NOT NULL REFERENCES booths(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      scope_type TEXT NOT NULL CHECK(scope_type IN ('size','category')),
      scope_value TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'buy_get_free' CHECK(type IN ('buy_get_free','bundle')),
      trigger_qty INTEGER NOT NULL,
      free_qty INTEGER,
      bundle_price REAL,
      bundle_currency TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS booth_shares (
      id TEXT PRIMARY KEY,
      booth_id TEXT NOT NULL REFERENCES booths(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      level TEXT NOT NULL DEFAULT 'edit' CHECK(level IN ('view','edit')),
      created_at TEXT NOT NULL,
      UNIQUE(booth_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS booth_invites (
      id TEXT PRIMARY KEY,
      booth_id TEXT NOT NULL REFERENCES booths(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      level TEXT NOT NULL DEFAULT 'edit' CHECK(level IN ('view','edit')),
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS booth_group_shares (
      id TEXT PRIMARY KEY,
      booth_id TEXT NOT NULL REFERENCES booths(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      level TEXT NOT NULL DEFAULT 'edit' CHECK(level IN ('view','edit')),
      created_at TEXT NOT NULL,
      UNIQUE(booth_id, group_id)
    );

    CREATE TABLE IF NOT EXISTS itinerary_items (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'activity' CHECK(kind IN ('activity','ticket','food','transport','shopping','note')),
      title TEXT NOT NULL,
      date TEXT,
      time TEXT,
      from_loc TEXT,
      to_loc TEXT,
      end_time TEXT,
      done INTEGER NOT NULL DEFAULT 0,
      price REAL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      url TEXT,
      attachment_path TEXT,
      attachment_name TEXT,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS itinerary_attachments (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES itinerary_items(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `)

  // Column migrations for existing databases (ALTER TABLE is idempotent via try/catch)
  try { sqlite.exec(`ALTER TABLE locations ADD COLUMN transport TEXT`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE locations ADD COLUMN accommodation TEXT`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE locations ADD COLUMN latitude REAL`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE locations ADD COLUMN longitude REAL`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE itinerary_items ADD COLUMN from_loc TEXT`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE itinerary_items ADD COLUMN to_loc TEXT`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE itinerary_items ADD COLUMN end_time TEXT`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE locations ADD COLUMN layout_data TEXT`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE catalog_images ADD COLUMN custom_name TEXT`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE catalog_images ADD COLUMN image_type TEXT DEFAULT 'catalog'`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE products ADD COLUMN website TEXT`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE products ADD COLUMN person_id TEXT`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE locations ADD COLUMN date_from TEXT`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE locations ADD COLUMN date_to TEXT`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE booths ADD COLUMN shop_category TEXT`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE booths ADD COLUMN person_id TEXT`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE catalog_images ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE catalog_images ADD COLUMN person_id TEXT`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE catalog_images ADD COLUMN parent_id TEXT`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE catalog_images ADD COLUMN latitude REAL`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE catalog_images ADD COLUMN longitude REAL`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE location_receipts ADD COLUMN paid_by_person_id TEXT REFERENCES persons(id) ON DELETE SET NULL`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE products ADD COLUMN split_among_marked INTEGER NOT NULL DEFAULT 0`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE location_receipt_items ADD COLUMN split_among_marked INTEGER NOT NULL DEFAULT 0`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE products ADD COLUMN is_planned INTEGER NOT NULL DEFAULT 0`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE events ADD COLUMN slug TEXT`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE booths ADD COLUMN slug TEXT`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE events ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE events ADD COLUMN owner_id TEXT REFERENCES users(id) ON DELETE SET NULL`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE products ADD COLUMN owner_id TEXT REFERENCES users(id) ON DELETE SET NULL`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE users ADD COLUMN person_id TEXT REFERENCES persons(id) ON DELETE SET NULL`) } catch { /* already exists */ }
  // booth_discounts gained bundle-discount support after the initial release.
  // The original schema only had free_qty (NOT NULL); subsequent rows may set
  // bundle_price/bundle_currency instead. We can't drop the NOT NULL via
  // ALTER, but SQLite is forgiving and the API enforces consistency.
  try { sqlite.exec(`ALTER TABLE booth_discounts ADD COLUMN type TEXT NOT NULL DEFAULT 'buy_get_free'`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE booth_discounts ADD COLUMN bundle_price REAL`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE booth_discounts ADD COLUMN bundle_currency TEXT`) } catch { /* already exists */ }
  // product_person_marks gained per-person quantity for "I want 2 of this".
  try { sqlite.exec(`ALTER TABLE product_person_marks ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1`) } catch { /* already exists */ }
  // Booths gained an optional icon (small avatar shown on the dashboard tile
  // + booth detail header). Either a local upload path or an external URL.
  try { sqlite.exec(`ALTER TABLE booths ADD COLUMN icon_path TEXT`) } catch { /* already exists */ }
  // Events gained an optional end-date so multi-day conventions can record
  // the full range. Pre-existing single-day events keep `date` populated and
  // `date_to` NULL — the UI treats that as "single day".
  try { sqlite.exec(`ALTER TABLE events ADD COLUMN date_to TEXT`) } catch { /* already exists */ }
  // Locations + booths gained an explicit `sort_order` so the user can
  // drag-and-drop them into a custom order on the event page. Defaults to 0;
  // existing rows are backfilled below in creation order.
  try { sqlite.exec(`ALTER TABLE locations ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE booths ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`) } catch { /* already exists */ }

  // Backfill slugs for existing events that don't have one
  const needsSlug = sqlite.prepare('SELECT id, name FROM events WHERE slug IS NULL').all() as { id: string; name: string }[]
  if (needsSlug.length > 0) {
    const allSlugs = (sqlite.prepare('SELECT slug FROM events WHERE slug IS NOT NULL').all() as { slug: string }[]).map(r => r.slug)
    for (const ev of needsSlug) {
      const base = toSlug(ev.name)
      let candidate = base
      let i = 2
      while (allSlugs.includes(candidate)) {
        candidate = `${base}-${i++}`
      }
      allSlugs.push(candidate)
      sqlite.prepare('UPDATE events SET slug = ? WHERE id = ?').run(candidate, ev.id)
    }
  }

  // Backfill slugs for existing booths (unique per event)
  const boothsNeedingSlug = sqlite.prepare(`
    SELECT b.id, b.name, l.event_id
    FROM booths b JOIN locations l ON b.location_id = l.id
    WHERE b.slug IS NULL
  `).all() as { id: string; name: string; event_id: string }[]

  if (boothsNeedingSlug.length > 0) {
    const byEvent = new Map<string, { id: string; name: string }[]>()
    for (const b of boothsNeedingSlug) {
      if (!byEvent.has(b.event_id)) byEvent.set(b.event_id, [])
      byEvent.get(b.event_id)!.push({ id: b.id, name: b.name })
    }
    for (const [eventId, eventBooths] of byEvent) {
      const existing = sqlite.prepare(`
        SELECT b.slug FROM booths b JOIN locations l ON b.location_id = l.id
        WHERE l.event_id = ? AND b.slug IS NOT NULL
      `).all(eventId) as { slug: string }[]
      const usedSlugs = existing.map(r => r.slug)
      for (const booth of eventBooths) {
        const base = toSlug(booth.name)
        let candidate = base
        let i = 2
        while (usedSlugs.includes(candidate)) candidate = `${base}-${i++}`
        usedSlugs.push(candidate)
        sqlite.prepare('UPDATE booths SET slug = ? WHERE id = ?').run(candidate, booth.id)
      }
    }
  }

  // Seed default admin user if no users exist.
  // Password is read from env (ADMIN_DEFAULT_PASSWORD). If unset, a random one is
  // generated and printed once so the source never carries a real credential.
  const userCount = (sqlite.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c
  if (userCount === 0) {
    const username = process.env.ADMIN_DEFAULT_USERNAME || 'admin'
    let password = process.env.ADMIN_DEFAULT_PASSWORD
    let generated = false
    if (!password) {
      password = randomBytes(9).toString('base64url')
      generated = true
    }
    const salt = randomBytes(16).toString('hex')
    const hash = scryptSync(password, salt, 64).toString('hex')
    const userId = generateId()
    const ts = now()
    sqlite.prepare(`
      INSERT INTO users (id, username, password_hash, role, created_at)
      VALUES (?, ?, ?, 'admin', ?)
    `).run(userId, username, `${salt}:${hash}`, ts)
    // Auto-create person + link
    const personId = generateId()
    sqlite.prepare(`INSERT INTO persons (id, name, color, created_at) VALUES (?, ?, 'purple', ?)`)
      .run(personId, username, ts)
    sqlite.prepare(`UPDATE users SET person_id = ? WHERE id = ?`).run(personId, userId)
    if (generated) {
      console.log(`\n┌─ MerchTracker first-run admin credentials ─┐`)
      console.log(`│ username: ${username}`)
      console.log(`│ password: ${password}`)
      console.log(`└────────────────────────────────────────────┘`)
      console.log(`(Set ADMIN_DEFAULT_PASSWORD in .env to control this. Change after first login.)\n`)
    }
  }

  // Backfill: each user must have an associated Person row. For any legacy
  // user with NULL person_id, create one using their username as the name and
  // a deterministic color from the palette.
  const usersNoPerson = sqlite.prepare(`SELECT id, username FROM users WHERE person_id IS NULL`).all() as { id: string; username: string }[]
  if (usersNoPerson.length > 0) {
    const palette = ['purple', 'blue', 'green', 'yellow', 'red', 'pink', 'orange', 'teal']
    const existingPersonCount = (sqlite.prepare(`SELECT COUNT(*) as c FROM persons`).get() as { c: number }).c
    let i = 0
    for (const u of usersNoPerson) {
      const personId = generateId()
      const color = palette[(existingPersonCount + i) % palette.length]
      sqlite.prepare(`INSERT INTO persons (id, name, color, created_at) VALUES (?, ?, ?, ?)`)
        .run(personId, u.username, color, now())
      sqlite.prepare(`UPDATE users SET person_id = ? WHERE id = ?`).run(personId, u.id)
      i++
    }
    console.log(`Auto-created ${usersNoPerson.length} person row(s) for users that didn't have one yet.`)
  }

  // Seed defaults into app_settings on first boot. Idempotent: each row is
  // INSERT-OR-IGNORE-d, so manually-changed values are preserved across
  // restarts and we never reset the admin's choice.
  const seedSettings: Array<[string, string]> = [
    ['currency_provider', 'visa'],
    ['display_currency', 'EUR'],
    // Instance defaults (admin-managed via /admin/settings):
    //   default_public — new events start public when true
    //   allow_guest    — anonymous (logged-out) visitors may browse public events
    ['default_public', 'false'],
    ['allow_guest', 'true'],
  ]
  const ts = now()
  for (const [key, value] of seedSettings) {
    sqlite.prepare(`INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`)
      .run(key, value, ts)
  }

  // Backfill ownerId on legacy events: any event with NULL owner_id is reassigned
  // to the first admin so it remains accessible after Phase 4 permission rules
  // come online (otherwise nobody but other admins could see it).
  const orphanEvents = (sqlite.prepare('SELECT COUNT(*) as c FROM events WHERE owner_id IS NULL').get() as { c: number }).c
  if (orphanEvents > 0) {
    const firstAdmin = sqlite.prepare(`SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1`).get() as { id: string } | undefined
    if (firstAdmin) {
      sqlite.prepare(`UPDATE events SET owner_id = ? WHERE owner_id IS NULL`).run(firstAdmin.id)
      console.log(`Backfilled owner_id on ${orphanEvents} legacy event(s) → admin user ${firstAdmin.id}`)
    }
  }

  // Backfill sort_order on legacy locations + booths: if every row in a parent
  // has sort_order=0, assign 0,1,2,… by created_at so the existing visual
  // order is preserved before the user starts dragging.
  const locsAllZero = sqlite.prepare(`
    SELECT event_id FROM locations
    GROUP BY event_id
    HAVING MAX(sort_order) = 0 AND COUNT(*) > 1
  `).all() as { event_id: string }[]
  for (const row of locsAllZero) {
    const ordered = sqlite.prepare(`SELECT id FROM locations WHERE event_id = ? ORDER BY created_at ASC`).all(row.event_id) as { id: string }[]
    const upd = sqlite.prepare(`UPDATE locations SET sort_order = ? WHERE id = ?`)
    ordered.forEach((r, i) => upd.run(i, r.id))
  }
  const boothsAllZero = sqlite.prepare(`
    SELECT location_id FROM booths
    GROUP BY location_id
    HAVING MAX(sort_order) = 0 AND COUNT(*) > 1
  `).all() as { location_id: string }[]
  for (const row of boothsAllZero) {
    const ordered = sqlite.prepare(`SELECT id FROM booths WHERE location_id = ? ORDER BY created_at ASC`).all(row.location_id) as { id: string }[]
    const upd = sqlite.prepare(`UPDATE booths SET sort_order = ? WHERE id = ?`)
    ordered.forEach((r, i) => upd.run(i, r.id))
  }

  // Indices for the new join tables (idempotent)
  try { sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_marks_product ON product_person_marks(product_id)`) } catch { /* noop */ }
  try { sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_marks_person ON product_person_marks(person_id)`) } catch { /* noop */ }
  try { sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_discounts_booth ON booth_discounts(booth_id)`) } catch { /* noop */ }
  try { sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_booth_shares_booth ON booth_shares(booth_id)`) } catch { /* noop */ }
  try { sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_booth_shares_user ON booth_shares(user_id)`) } catch { /* noop */ }
  try { sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_booth_invites_booth ON booth_invites(booth_id)`) } catch { /* noop */ }
  try { sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_booth_group_shares_booth ON booth_group_shares(booth_id)`) } catch { /* noop */ }
  try { sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_booth_group_shares_group ON booth_group_shares(group_id)`) } catch { /* noop */ }

  // Backfill per-person marks from the legacy single-person columns. For each
  // product where personId is set and isPlanned or isPurchased is true, ensure
  // there's a mark row for that person carrying those flags. Idempotent: skips
  // products that already have any mark row.
  const legacyProducts = sqlite.prepare(`
    SELECT p.id, p.person_id, p.is_planned, p.is_purchased
    FROM products p
    WHERE p.person_id IS NOT NULL
      AND (p.is_planned = 1 OR p.is_purchased = 1)
      AND NOT EXISTS (SELECT 1 FROM product_person_marks m WHERE m.product_id = p.id)
  `).all() as { id: string; person_id: string; is_planned: number; is_purchased: number }[]
  if (legacyProducts.length > 0) {
    const stmt = sqlite.prepare(`
      INSERT INTO product_person_marks (id, product_id, person_id, is_planned, is_purchased, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    for (const p of legacyProducts) {
      stmt.run(generateId(), p.id, p.person_id, p.is_planned, p.is_purchased, now(), now())
    }
    console.log(`Backfilled ${legacyProducts.length} per-person mark row(s) from legacy product flags.`)
  }

  return _db
}
