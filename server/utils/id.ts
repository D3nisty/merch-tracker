import { randomUUID } from 'node:crypto'

export function generateId(): string {
  return randomUUID()
}

export function now(): string {
  return new Date().toISOString()
}

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'event'
}

export function generateSlug(name: string, existingSlugs: string[]): string {
  const base = toSlug(name)
  if (!existingSlugs.includes(base)) return base
  let i = 2
  while (existingSlugs.includes(`${base}-${i}`)) i++
  return `${base}-${i}`
}
