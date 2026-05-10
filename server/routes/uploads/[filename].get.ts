import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, extname } from 'node:path'

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
}

export default defineEventHandler(async (event) => {
  const filename = getRouterParam(event, 'filename')
  if (!filename || filename.includes('..') || filename.includes('/')) {
    throw createError({ statusCode: 400 })
  }

  const filePath = join(process.cwd(), 'public', 'uploads', filename)

  try {
    const info = await stat(filePath)
    if (!info.isFile()) throw new Error()

    const ext = extname(filename).slice(1).toLowerCase()
    setHeader(event, 'Content-Type', MIME[ext] ?? 'application/octet-stream')
    setHeader(event, 'Content-Length', String(info.size))
    setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

    return sendStream(event, createReadStream(filePath))
  } catch {
    throw createError({ statusCode: 404, message: 'File not found' })
  }
})
