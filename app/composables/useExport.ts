import { zipSync, strToU8 } from 'fflate'

/**
 * Client-side table export — clean CSV and a real (warning-free) .xlsx.
 *
 * The .xlsx is a minimal but spec-valid OOXML package zipped with fflate
 * (tiny, pure-JS). Numeric columns are written as real numbers so Excel/Sheets
 * sum them; the header row is bold. Multiple sheets are supported for the
 * "export everything" case (one sheet per event).
 */
export interface ExportColumn {
  key: string
  label: string
  /** Write as a number cell (real numeric value) rather than text. */
  numeric?: boolean
}
export interface ExportSheet {
  name: string
  columns: ExportColumn[]
  rows: Record<string, unknown>[]
}

function triggerDownload(filename: string, data: BlobPart, mime: string) {
  const blob = new Blob([data], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

// ── CSV ──────────────────────────────────────────────────────────────────
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportCsv(filename: string, columns: ExportColumn[], rows: Record<string, unknown>[]) {
  const lines = [columns.map(c => csvCell(c.label)).join(',')]
  for (const r of rows) lines.push(columns.map(c => csvCell(r[c.key])).join(','))
  // Leading BOM so Excel reads UTF-8 (¥, ×, €, umlauts) correctly.
  triggerDownload(
    filename.endsWith('.csv') ? filename : `${filename}.csv`,
    '﻿' + lines.join('\r\n'),
    'text/csv;charset=utf-8',
  )
}

// ── XLSX ─────────────────────────────────────────────────────────────────
function xmlEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function colLetter(n: number): string {
  let s = ''
  let x = n + 1
  while (x > 0) {
    const m = (x - 1) % 26
    s = String.fromCharCode(65 + m) + s
    x = Math.floor((x - 1) / 26)
  }
  return s
}
function sanitizeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31)
  return cleaned || `Sheet${index + 1}`
}

function sheetXml(sheet: ExportSheet): string {
  const rows: string[] = []
  const header = sheet.columns
    .map((c, ci) => `<c r="${colLetter(ci)}1" t="inlineStr" s="1"><is><t xml:space="preserve">${xmlEsc(c.label)}</t></is></c>`)
    .join('')
  rows.push(`<row r="1">${header}</row>`)
  sheet.rows.forEach((row, ri) => {
    const cells = sheet.columns
      .map((c, ci) => {
        const ref = `${colLetter(ci)}${ri + 2}`
        const v = row[c.key]
        if (c.numeric && v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v))) {
          return `<c r="${ref}"><v>${Number(v)}</v></c>`
        }
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v === null || v === undefined ? '' : String(v))}</t></is></c>`
      })
      .join('')
    rows.push(`<row r="${ri + 2}">${cells}</row>`)
  })
  const cols = sheet.columns
    .map((_, ci) => `<col min="${ci + 1}" max="${ci + 1}" width="18" customWidth="1"/>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData></worksheet>`
}

export function exportXlsx(filename: string, sheets: ExportSheet[]) {
  const safe = sheets.map((s, i) => ({ ...s, name: sanitizeSheetName(s.name, i) }))
  const n = safe.length

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${safe.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${safe.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${safe.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rootRels),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
    'xl/styles.xml': strToU8(styles),
  }
  safe.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s)) })

  const zipped = zipSync(files, { level: 6 })
  triggerDownload(
    filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`,
    zipped,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
}
