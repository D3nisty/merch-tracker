#!/usr/bin/env node
/**
 * Reset the admin user back to ADMIN_DEFAULT_USERNAME / ADMIN_DEFAULT_PASSWORD
 * from the environment (falling back to admin / Fichs if unset).
 *
 * Usage:
 *   node --env-file=.env scripts/reset-admin.mjs
 *   node --env-file=.env scripts/reset-admin.mjs path/to/db.sqlite
 *
 *   # Or via the npm script (handles the --env-file flag for you):
 *   npm run reset-admin
 *
 *   # Inside the Docker container:
 *   docker compose stop merch-tracker
 *   node --env-file=.env scripts/reset-admin.mjs ./data/merch-tracker.db
 *   docker compose start merch-tracker
 *
 * Effects:
 *   - Clears all active sessions (forces re-login everywhere)
 *   - Updates the admin user's password hash if it exists
 *   - Creates an admin user if none exists
 *   - Leaves events / booths / products untouched
 */
import Database from 'better-sqlite3'
import { randomBytes, randomUUID, scryptSync } from 'node:crypto'
import { existsSync } from 'node:fs'

const dbPath = process.argv[2] ?? './data/merch-tracker.db'

if (!existsSync(dbPath)) {
  console.error(`✗ Database not found at: ${dbPath}`)
  console.error(`  Pass a path as the first argument if it lives elsewhere.`)
  process.exit(1)
}

const username = process.env.ADMIN_DEFAULT_USERNAME ?? 'admin'
const password = process.env.ADMIN_DEFAULT_PASSWORD ?? 'Fichs'

const salt = randomBytes(16).toString('hex')
const hash = scryptSync(password, salt, 64).toString('hex')
const passwordHash = `${salt}:${hash}`

const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

// Wipe sessions so existing browsers get bounced to /login.
const sessionsDeleted = db.prepare('DELETE FROM sessions').run().changes

// Update if the username exists, otherwise create.
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
if (existing) {
  db.prepare(`UPDATE users SET password_hash = ?, role = 'admin' WHERE id = ?`)
    .run(passwordHash, existing.id)
  console.log(`✓ Reset password for existing user "${username}" (role: admin)`)
} else {
  db.prepare(`INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)`)
    .run(randomUUID(), username, passwordHash, new Date().toISOString())
  console.log(`✓ Created admin user "${username}"`)
}

console.log(`  password: ${password}`)
console.log(`  sessions cleared: ${sessionsDeleted}`)
console.log(``)
console.log(`Now log in at /login.`)
