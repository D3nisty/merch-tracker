import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

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
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
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

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      booth_id TEXT NOT NULL REFERENCES booths(id) ON DELETE CASCADE,
      catalog_image_id TEXT REFERENCES catalog_images(id) ON DELETE SET NULL,
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

  return _db
}
