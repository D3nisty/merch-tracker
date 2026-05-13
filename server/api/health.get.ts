export default defineEventHandler(() => {
  return { ok: true, time: new Date().toISOString(), env: process.env.NODE_ENV ?? 'unknown' }
})
