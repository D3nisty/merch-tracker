/**
 * Minimal server-side geocoder using OpenStreetMap's free Nominatim endpoint.
 * Nominatim requires a descriptive User-Agent and asks for ≤1 request/second —
 * callers should space bulk requests. Returns null on any failure so the map
 * degrades gracefully (the city just won't get a pin until retried).
 */
export async function geocode(query: string): Promise<{ lat: number; lon: number } | null> {
  const q = query.trim()
  if (!q) return null
  try {
    const res = await $fetch<Array<{ lat: string; lon: string }>>('https://nominatim.openstreetmap.org/search', {
      query: { q, format: 'json', limit: 1 },
      headers: { 'User-Agent': 'merch-tracker/1.0 (travel planner)' },
      timeout: 8000,
    })
    const hit = Array.isArray(res) ? res[0] : null
    if (!hit) return null
    const lat = parseFloat(hit.lat), lon = parseFloat(hit.lon)
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
  } catch {
    return null
  }
}
