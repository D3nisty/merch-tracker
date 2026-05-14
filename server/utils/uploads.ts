import { unlink } from 'node:fs/promises'
import { join, basename } from 'node:path'

/**
 * Best-effort delete of an uploaded file from the local UPLOAD_DIR.
 *
 * Pass any value stored in a `path` / `iconPath` / `floorPlanImage` column —
 * the helper silently no-ops on external URLs, empty values, anything that
 * doesn't live under `/uploads/`, and on ENOENT (file already gone).
 * Non-ENOENT errors are logged but never thrown — orphan files are
 * preferable to a 500 response on every delete.
 */
export async function deleteUploadedFile(path: string | null | undefined): Promise<void> {
  if (!path) return
  if (!path.startsWith('/uploads/')) return // external URLs stay put

  const filename = basename(path)
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) return

  const uploadDir = process.env.UPLOAD_DIR ?? join(process.cwd(), 'public', 'uploads')
  const fullPath = join(uploadDir, filename)

  try {
    await unlink(fullPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[uploads] Failed to delete', fullPath, err)
    }
  }
}

/** Bulk variant — sequential so we don't slam the FS. */
export async function deleteUploadedFiles(paths: Array<string | null | undefined>): Promise<void> {
  for (const p of paths) await deleteUploadedFile(p)
}
