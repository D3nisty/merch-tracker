import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, extname } from 'node:path'

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

export default defineEventHandler(async (event) => {
  const filename = getRouterParam(event, 'filename') ?? ''

  // Prevent path traversal
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw createError({ statusCode: 400, message: 'Invalid filename' })
  }

  const uploadDir = process.env.UPLOAD_DIR ?? join(process.cwd(), 'public', 'uploads')
  const filePath = join(uploadDir, filename)

  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, message: 'File not found' })
  }

  const ext = extname(filename).toLowerCase()
  const { size } = await stat(filePath)

  setHeader(event, 'Content-Type', MIME[ext] ?? 'application/octet-stream')
  setHeader(event, 'Content-Length', size)
  setHeader(event, 'Cache-Control', 'public, max-age=2147483648, immutable')

  return sendStream(event, createReadStream(filePath))
})
