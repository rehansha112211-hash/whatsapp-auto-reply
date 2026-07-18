// Shared client-side helpers
export function timeAgo(date: string | Date | null): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = Date.now() - d.getTime()
  if (diff < 0) return 'just now'
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString()
}

export function formatTime(date: string | Date | null): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(date: string | Date | null): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m ${Math.floor(seconds % 60)}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Stable color from string (for avatars)
export function colorFromString(str: string): string {
  const colors = [
    'bg-emerald-500/20 text-emerald-300',
    'bg-teal-500/20 text-teal-300',
    'bg-amber-500/20 text-amber-300',
    'bg-rose-500/20 text-rose-300',
    'bg-violet-500/20 text-violet-300',
    'bg-cyan-500/20 text-cyan-300',
    'bg-lime-500/20 text-lime-300',
    'bg-orange-500/20 text-orange-300',
  ]
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

export function leadColor(score: number): string {
  if (score >= 75) return 'text-emerald-400'
  if (score >= 50) return 'text-amber-400'
  if (score >= 25) return 'text-orange-400'
  return 'text-muted-foreground'
}

export function leadBadge(score: number): string {
  if (score >= 75) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  if (score >= 50) return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  if (score >= 25) return 'bg-orange-500/15 text-orange-300 border-orange-500/30'
  return 'bg-muted text-muted-foreground border-border'
}

export function downloadFile(filename: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------------- Tag colors ----------------
// Shared color palette for conversation tags / labels.
// `bg` and `text` are used on the badge; `dot` is the small swatch.
export const TAG_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  emerald: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', dot: 'bg-emerald-500' },
  amber: { bg: 'bg-amber-500/15', text: 'text-amber-300', dot: 'bg-amber-500' },
  rose: { bg: 'bg-rose-500/15', text: 'text-rose-300', dot: 'bg-rose-500' },
  sky: { bg: 'bg-sky-500/15', text: 'text-sky-300', dot: 'bg-sky-500' },
  violet: { bg: 'bg-violet-500/15', text: 'text-violet-300', dot: 'bg-violet-500' },
  zinc: { bg: 'bg-zinc-500/15', text: 'text-zinc-300', dot: 'bg-zinc-500' },
  orange: { bg: 'bg-orange-500/15', text: 'text-orange-300', dot: 'bg-orange-500' },
  teal: { bg: 'bg-teal-500/15', text: 'text-teal-300', dot: 'bg-teal-500' },
}

export function tagColor(color: string) {
  return TAG_COLORS[color] ?? TAG_COLORS.emerald
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map((h) => escape(r[h])).join(','))
  return lines.join('\n')
}

// ---------------- Match highlighting ----------------
// Splits `text` into segments, marking the portions that case-insensitively
// match `query`. The view renders <mark> for segments where match === true.
// All occurrences of the query are highlighted (not just the first).
// If the query is empty or no match is found, returns a single segment
// containing the original text with match=false.
export interface MatchSegment {
  text: string
  match: boolean
}

export function findMatchSegments(text: string, query: string): MatchSegment[] {
  const q = query.trim()
  if (!q) return [{ text, match: false }]
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const segments: MatchSegment[] = []
  let i = 0
  while (i < text.length) {
    const idx = lower.indexOf(needle, i)
    if (idx === -1) {
      segments.push({ text: text.slice(i), match: false })
      break
    }
    if (idx > i) {
      segments.push({ text: text.slice(i, idx), match: false })
    }
    segments.push({ text: text.slice(idx, idx + needle.length), match: true })
    i = idx + needle.length
    if (i === idx) {
      // zero-length needle guard (shouldn't happen because of trim, but safe)
      i = idx + 1
    }
  }
  return segments
}
