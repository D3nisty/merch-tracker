import { unzipSync, strFromU8 } from 'fflate'

/**
 * Parse a travel itinerary from an .xlsx or .csv file into day rows and
 * grouped city blocks the app can turn into an event + locations.
 *
 * Expected shape (flexible): a header row with a "day/date" column and a
 * "place/city" column (German aliases Tag / Ort / Stadt understood); every
 * following row is one day. Consecutive rows in the same place are merged into
 * one block with a date range — that becomes a `city` location. Remaining
 * columns (transport, accommodation, notes…) fold into the block's notes.
 * Fully client-side; xlsx is unzipped with fflate (already a dependency).
 */
export interface ItineraryRow { date: string | null; place: string; notes: string; transport: string; accommodation: string }
export interface ItineraryDay { date: string | null; note: string }
export interface ItineraryBlock {
  name: string
  dateFrom: string | null
  dateTo: string | null
  notes: string
  transport: string
  accommodation: string
  dayCount: number
  days: ItineraryDay[]
}
export interface ParsedItinerary { rows: ItineraryRow[]; blocks: ItineraryBlock[]; suggestedName: string; sheetName?: string }

function unescapeXml(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;/g, ' ').replace(/&#\d+;/g, ' ')
}
function colNum(letters: string): number {
  let n = 0
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64)
  return n - 1
}

// Excel (1900 system) serial → ISO yyyy-mm-dd. 25569 = days between the Excel
// epoch (1899-12-30) and the Unix epoch.
function excelSerialToISO(serial: number): string | null {
  if (!isFinite(serial) || serial < 10000 || serial > 90000) return null
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000))
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function parseAnyDate(raw: string): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  if (/^\d{4,6}(\.\d+)?$/.test(s)) return excelSerialToISO(Math.floor(Number(s)))
  // DD.MM.YYYY or DD/MM/YYYY (German-style)
  const dm = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/)
  if (dm) {
    const y = dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])
    const iso = `${y}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`
    return isNaN(new Date(iso).getTime()) ? null : iso
  }
  // ISO or anything Date can parse
  const t = Date.parse(s)
  return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10)
}

// ── XLSX → 2D grid ─────────────────────────────────────────────────────
function xlsxToGrid(buf: Uint8Array): { grid: string[][]; sheetName: string } {
  const zip = unzipSync(buf)
  const dec = (k: string) => (zip[k] ? strFromU8(zip[k]) : '')

  const ss: string[] = []
  for (const m of dec('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1])
    ss.push(unescapeXml(texts.join('')))
  }

  const wb = dec('xl/workbook.xml')
  const sheets = [...wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"/g)].map(m => ({ name: unescapeXml(m[1]), rid: m[2] }))
  const relMap: Record<string, string> = {}
  for (const m of dec('xl/_rels/workbook.xml.rels').matchAll(/<Relationship[^>]*Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2]
  // Prefer a sheet whose name hints at the day plan; else the first.
  const preferred = sheets.find(s => /tag|day|plan|itiner|reise|trip|route/i.test(s.name)) ?? sheets[0]
  if (!preferred) return { grid: [], sheetName: '' }
  const target = ('xl/' + relMap[preferred.rid].replace(/^\//, '').replace(/^xl\//, '')).replace(/\/{2,}/g, '/')
  const sheetXml = dec(target)

  const grid: string[][] = []
  for (const rowM of sheetXml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowIdx = Number(rowM[1]) - 1
    const cells: string[] = []
    for (const cM of rowM[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const col = colNum(cM[1]); const attrs = cM[2]; const inner = cM[3]
      const vm = inner.match(/<v>([\s\S]*?)<\/v>/)
      let val = vm ? vm[1] : ''
      if (/t="s"/.test(attrs) && vm) val = ss[Number(vm[1])] ?? ''
      else if (/t="inlineStr"/.test(attrs)) { const im = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/); val = im ? unescapeXml(im[1]) : '' }
      cells[col] = val ?? ''
    }
    grid[rowIdx] = cells
  }
  return { grid, sheetName: preferred.name }
}

// ── CSV → 2D grid ──────────────────────────────────────────────────────
function csvToGrid(text: string): string[][] {
  // Detect delimiter: prefer ; when it appears more than , (German exports).
  const head = text.slice(0, 2000)
  const delim = (head.split(';').length > head.split(',').length) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === delim) { row.push(cur); cur = '' }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (ch === '\r') { /* skip */ }
    else cur += ch
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row) }
  return rows
}

// ── grid → rows + blocks ───────────────────────────────────────────────
const DATE_HEADER = /^(tag|date|day|datum)\b/i
const PLACE_HEADER = /(ort|place|stadt|city|location|ziel|destination)/i
const TRANSPORT_HEADER = /(transport|abfahrt|ankunft|travel|zug|flug|bahn)/i
const ACCOM_HEADER = /(unterkunft|accommod|hotel|stay|lodging|schlafen)/i
const NOTE_HEADER = /(besonder|note|notiz|activ|aktiv|special|plan|programm)/i

function gridToItinerary(grid: string[][]): { rows: ItineraryRow[]; blocks: ItineraryBlock[] } {
  let headerIdx = -1, dateCol = 0, placeCol = 1
  let transportCols: number[] = [], accomCols: number[] = [], noteCols: number[] = []
  for (let i = 0; i < Math.min(grid.length, 12); i++) {
    const r = grid[i] ?? []
    const dc = r.findIndex(c => DATE_HEADER.test((c ?? '').trim()))
    const pc = r.findIndex(c => PLACE_HEADER.test((c ?? '').trim()))
    if (dc !== -1 && pc !== -1) {
      headerIdx = i; dateCol = dc; placeCol = pc
      const idxs = r.map((_, idx) => idx).filter(idx => idx !== dc && idx !== pc)
      transportCols = idxs.filter(idx => TRANSPORT_HEADER.test((r[idx] ?? '').trim()))
      accomCols = idxs.filter(idx => ACCOM_HEADER.test((r[idx] ?? '').trim()))
      const claimed = new Set([...transportCols, ...accomCols])
      noteCols = idxs.filter(idx => !claimed.has(idx) && ((r[idx] ?? '').trim() || NOTE_HEADER.test((r[idx] ?? '').trim())))
      break
    }
  }
  const start = headerIdx >= 0 ? headerIdx + 1 : 0
  const pick = (r: string[], cols: number[]) => cols.map(c => (r[c] ?? '').trim()).filter(Boolean).join(' · ')

  const rows: ItineraryRow[] = []
  for (let i = start; i < grid.length; i++) {
    const r = grid[i] ?? []
    const place = (r[placeCol] ?? '').trim()
    if (!place) continue
    const date = parseAnyDate((r[dateCol] ?? '').trim())
    rows.push({
      date, place,
      notes: pick(r, noteCols),
      transport: pick(r, transportCols),
      accommodation: pick(r, accomCols),
    })
  }

  // Merge consecutive rows in the same place into one block (a city). Keep the
  // per-day rows so we can also create day-by-day itinerary items on import.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const blocks: ItineraryBlock[] = []
  for (const r of rows) {
    const last = blocks[blocks.length - 1]
    if (last && norm(last.name) === norm(r.place)) {
      last.dayCount++
      if (r.date) last.dateTo = r.date
      if (r.notes && !last.notes.includes(r.notes)) last.notes = [last.notes, r.notes].filter(Boolean).join(' · ').slice(0, 800)
      if (!last.transport && r.transport) last.transport = r.transport
      if (!last.accommodation && r.accommodation) last.accommodation = r.accommodation
      last.days.push({ date: r.date, note: r.notes })
    } else {
      blocks.push({
        name: r.place, dateFrom: r.date, dateTo: r.date,
        notes: r.notes.slice(0, 800), transport: r.transport, accommodation: r.accommodation,
        dayCount: 1, days: [{ date: r.date, note: r.notes }],
      })
    }
  }
  return { rows, blocks }
}

export function useItineraryImport() {
  async function parseItinerary(file: File): Promise<ParsedItinerary> {
    const base = file.name.replace(/\.(xlsx|xls|csv)$/i, '').trim()
    let grid: string[][] = []
    let sheetName: string | undefined
    if (/\.csv$/i.test(file.name)) {
      grid = csvToGrid(await file.text())
    } else {
      const res = xlsxToGrid(new Uint8Array(await file.arrayBuffer()))
      grid = res.grid; sheetName = res.sheetName
    }
    const { rows, blocks } = gridToItinerary(grid)
    return { rows, blocks, suggestedName: base || 'Imported trip', sheetName }
  }
  return { parseItinerary }
}
