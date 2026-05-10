import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { toSlug } from '../utils/id'

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
      created_at TEXT NOT NULL
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
      name TEXT NOT NULL,
      description TEXT,
      price REAL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      quantity INTEGER NOT NULL DEFAULT 1,
      size TEXT,
      category TEXT,
      is_purchased INTEGER NOT NULL DEFAULT 0,
      priority INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      website TEXT,
      region_x REAL,
      region_y REAL,
      region_w REAL,
      region_h REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  // Column migrations for existing databases (ALTER TABLE is idempotent via try/catch)
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
  try { sqlite.exec(`ALTER TABLE products ADD COLUMN is_planned INTEGER NOT NULL DEFAULT 0`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE events ADD COLUMN slug TEXT`) } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE booths ADD COLUMN slug TEXT`) } catch { /* already exists */ }

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

  return _db
}
