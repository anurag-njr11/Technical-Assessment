const esc = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const toCsv = (header: string[], rows: unknown[][]) => [header, ...rows].map((r) => r.map(esc).join(',')).join('\n')

/** Saves rows as `reviewbench-<name>-<date>.csv`. */
export function downloadCsv(name: string, header: string[], rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(header, rows)], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `reviewbench-${name}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
