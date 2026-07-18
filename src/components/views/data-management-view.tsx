'use client'

// ============================================================
// DataManagementView — Export & Import backup feature.
//
// Two sections:
//   · Export  — 3 cards (Quick Replies / Tags / Templates) each showing
//                the live count and an "Export as JSON" button, plus a
//                full-width emerald-gradient "Export Everything" button.
//   · Import  — drag-and-drop or click-to-select .json picker. Once a
//                file is chosen, parses it client-side and shows a preview
//                ("This file contains N quick replies, N tags, N templates")
//                plus a Merge / Replace mode selector and an Import button.
//
// All file IO is JSON. Exports are downloaded with `downloadFile`.
// Imports POST to /api/import which upserts by shortcut/name and
// records a security log entry.
// ============================================================
import * as React from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Database,
  Download,
  Upload,
  FileJson,
  FileText,
  Tags,
  MessageSquareText,
  Check,
  AlertTriangle,
  FileUp,
  Loader2,
  X,
  Trash2,
  Package,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { apiGet, apiPost, ApiError } from '@/lib/api-client'
import { downloadFile } from '@/lib/format'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

// ------------------------------------------------------------
// Types — match the export envelope (v1.0).
// ------------------------------------------------------------
interface QuickReplyExportRow {
  shortcut: string
  title: string
  body: string
  category: string
}

interface TagExportRow {
  name: string
  color: string
}

interface TemplateExportRow {
  name: string
  body: string
  category: string
}

interface ExportEnvelope {
  exportedAt?: string
  version?: string
  quickReplies?: QuickReplyExportRow[]
  tags?: TagExportRow[]
  templates?: TemplateExportRow[]
}

interface ImportResponse {
  ok: boolean
  imported: { quickReplies: number; tags: number; templates: number }
  skipped: { quickReplies: number; tags: number; templates: number }
}

type ImportMode = 'merge' | 'replace'

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------
const CARD_CLS = 'rounded-xl border bg-card/60 backdrop-blur p-5 card-hover'

// ------------------------------------------------------------
// Counters fetched on mount (and after each successful import).
// ------------------------------------------------------------
interface Counts {
  quickReplies: number
  tags: number
  templates: number
}

const ZERO_COUNTS: Counts = { quickReplies: 0, tags: 0, templates: 0 }

// ------------------------------------------------------------
// Section header
// ------------------------------------------------------------
function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Export card
// ------------------------------------------------------------
function ExportCard({
  icon: Icon,
  title,
  description,
  count,
  loading,
  exporting,
  onExport,
  accent,
}: {
  icon: React.ElementType
  title: string
  description: string
  count: number
  loading: boolean
  exporting: boolean
  onExport: () => void
  accent: string
}) {
  return (
    <Card className={cn(CARD_CLS, 'flex flex-col gap-4')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'grid h-10 w-10 place-items-center rounded-lg',
              accent,
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold leading-tight">{title}</h3>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Available
          </div>
          <div className="text-3xl font-bold tabular-nums">
            {loading ? (
              <span className="inline-block h-7 w-10 animate-pulse rounded bg-muted" />
            ) : (
              count
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          disabled={exporting || count === 0}
          className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export as JSON
        </Button>
      </div>
    </Card>
  )
}

// ============================================================
// Main view
// ============================================================
export function DataManagementView() {
  const [counts, setCounts] = React.useState<Counts>(ZERO_COUNTS)
  const [countsLoading, setCountsLoading] = React.useState(true)

  // Per-type exporting flags (one spinner per card).
  const [exporting, setExporting] = React.useState<{
    quickReplies: boolean
    tags: boolean
    templates: boolean
    all: boolean
  }>({ quickReplies: false, tags: false, templates: false, all: false })

  // Import state.
  const [parsed, setParsed] = React.useState<{
    envelope: ExportEnvelope
    filename: string
  } | null>(null)
  const [parseError, setParseError] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<ImportMode>('merge')
  const [importing, setImporting] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)

  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  // -------------------- Fetch counts --------------------
  const refreshCounts = React.useCallback(async () => {
    setCountsLoading(true)
    try {
      const [qr, tg, tp] = await Promise.all([
        apiGet<{ items: unknown[] }>('/api/quick-replies').catch(() => ({
          items: [],
        })),
        apiGet<{ items: unknown[] }>('/api/tags').catch(() => ({ items: [] })),
        apiGet<{ items: unknown[] }>('/api/templates').catch(() => ({
          items: [],
        })),
      ])
      setCounts({
        quickReplies: qr.items?.length ?? 0,
        tags: tg.items?.length ?? 0,
        templates: tp.items?.length ?? 0,
      })
    } finally {
      setCountsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    refreshCounts()
  }, [refreshCounts])

  // -------------------- Export handlers --------------------
  const runExport = async (
    type: 'quick-replies' | 'tags' | 'templates' | 'all',
    key: keyof typeof exporting,
  ) => {
    setExporting((p) => ({ ...p, [key]: true }))
    try {
      const res = await fetch(`/api/export?type=${type}`, { cache: 'no-store' })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(txt || `Export failed (${res.status})`)
      }
      const text = await res.text()
      // Try to derive the filename from Content-Disposition; fall back to a
      // sensible default so the user always gets a recognisable name.
      const cd = res.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename="?([^"]+)"?/i)
      const filename =
        match?.[1] || `qorvixnode-export-${type}-${Date.now()}.json`
      downloadFile(filename, text, 'application/json;charset=utf-8')
      toast.success('Export ready', {
        description: `Downloaded ${filename}`,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed'
      toast.error('Export failed', { description: msg })
    } finally {
      setExporting((p) => ({ ...p, [key]: false }))
    }
  }

  // -------------------- Import: parse file --------------------
  const handleFile = React.useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.json')) {
      setParseError('Please select a .json file.')
      setParsed(null)
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setParseError('File is too large (max 5 MB).')
      setParsed(null)
      return
    }
    try {
      const text = await file.text()
      const json = JSON.parse(text) as ExportEnvelope
      if (
        !json ||
        typeof json !== 'object' ||
        (!Array.isArray(json.quickReplies) &&
          !Array.isArray(json.tags) &&
          !Array.isArray(json.templates))
      ) {
        throw new Error(
          'This file does not look like a QorvixNode export (no quickReplies / tags / templates arrays found).',
        )
      }
      setParsed({ envelope: json, filename: file.name })
      setParseError(null)
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not parse the file as JSON.'
      setParseError(msg)
      setParsed(null)
    }
  }, [])

  const onDrop = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset the input value so picking the same file again still fires.
    e.target.value = ''
  }

  // -------------------- Import: submit --------------------
  const parsedCounts = React.useMemo(() => {
    if (!parsed) return null
    return {
      quickReplies: parsed.envelope.quickReplies?.length ?? 0,
      tags: parsed.envelope.tags?.length ?? 0,
      templates: parsed.envelope.templates?.length ?? 0,
    }
  }, [parsed])

  const totalParsed =
    parsedCounts != null
      ? parsedCounts.quickReplies +
        parsedCounts.tags +
        parsedCounts.templates
      : 0

  const runImport = async () => {
    if (!parsed) return
    setImporting(true)
    try {
      const res = await apiPost<ImportResponse>('/api/import', {
        data: parsed.envelope,
        mode,
      })
      const { imported, skipped } = res
      toast.success('Import complete', {
        description: `Added ${imported.quickReplies} quick replies, ${imported.tags} tags, ${imported.templates} templates · skipped ${skipped.quickReplies + skipped.tags + skipped.templates}.`,
      })
      setParsed(null)
      setMode('merge')
      void refreshCounts()
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Import failed'
      toast.error('Import failed', { description: msg })
    } finally {
      setImporting(false)
    }
  }

  const cancelImport = () => {
    setParsed(null)
    setParseError(null)
    setMode('merge')
  }

  // -------------------- Render --------------------
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-auto flex max-w-6xl flex-col gap-8"
    >
      {/* ---------- Header ---------- */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-300">
          <Database className="h-3.5 w-3.5" />
          Data Management
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-gradient-premium sm:text-3xl">
          Export &amp; Import
        </h1>
        <p className="text-sm text-muted-foreground">
          Backup your Quick Replies, Tags and Templates as JSON. Restore them
          on another installation, or share your snippet library with your
          team.
        </p>
      </div>

      {/* ---------- Export section ---------- */}
      <section className="flex flex-col gap-4">
        <SectionHeader
          icon={Download}
          title="Export"
          description="Download a JSON backup of your snippets library."
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ExportCard
            icon={MessageSquareText}
            title="Quick Replies"
            description="Composer slash-shortcuts (/hi, /price, …)"
            count={counts.quickReplies}
            loading={countsLoading}
            exporting={exporting.quickReplies}
            onExport={() => runExport('quick-replies', 'quickReplies')}
            accent="bg-emerald-500/15 text-emerald-300"
          />
          <ExportCard
            icon={Tags}
            title="Tags"
            description="Conversation labels & colors"
            count={counts.tags}
            loading={countsLoading}
            exporting={exporting.tags}
            onExport={() => runExport('tags', 'tags')}
            accent="bg-teal-500/15 text-teal-300"
          />
          <ExportCard
            icon={FileText}
            title="Templates"
            description="Reusable broadcast templates"
            count={counts.templates}
            loading={countsLoading}
            exporting={exporting.templates}
            onExport={() => runExport('templates', 'templates')}
            accent="bg-amber-500/15 text-amber-300"
          />
        </div>

        <Card className={cn(CARD_CLS, 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between')}>
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold leading-tight">Export Everything</h3>
              <p className="text-xs text-muted-foreground">
                One JSON file containing Quick Replies, Tags and Templates.
                Perfect for a full backup.
              </p>
            </div>
          </div>
          <Button
            onClick={() => runExport('all', 'all')}
            disabled={exporting.all}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
          >
            {exporting.all ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export Everything
          </Button>
        </Card>
      </section>

      <Separator />

      {/* ---------- Import section ---------- */}
      <section className="flex flex-col gap-4">
        <SectionHeader
          icon={Upload}
          title="Import"
          description="Restore a backup. Choose Merge to add new items only, or Replace to wipe & restore."
        />

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          aria-label="Upload a JSON export file"
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
            dragging
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-primary/5',
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={onPickFile}
          />
          <div
            className={cn(
              'grid h-14 w-14 place-items-center rounded-full transition-colors',
              dragging
                ? 'bg-primary/15 text-primary'
                : 'bg-muted text-muted-foreground',
            )}
          >
            <FileUp className="h-6 w-6" />
          </div>
          <div>
            <p className="font-medium">
              {dragging
                ? 'Drop the file to import'
                : 'Drop your export file here, or click to browse'}
            </p>
            <p className="text-xs text-muted-foreground">
              Accepts .json files only · max 5 MB
            </p>
          </div>
        </div>

        {/* Parse error */}
        {parseError && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">{parseError}</div>
            <button
              onClick={() => setParseError(null)}
              className="text-rose-200/70 hover:text-rose-100"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Parsed preview */}
        {parsed && parsedCounts && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card className={cn(CARD_CLS, 'flex flex-col gap-5')}>
              {/* Preview header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300">
                    <FileJson className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold leading-tight">
                      {parsed.filename}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {parsed.envelope.exportedAt
                        ? `Exported ${new Date(parsed.envelope.exportedAt).toLocaleString()}`
                        : 'No export timestamp'}
                      {parsed.envelope.version
                        ? ` · v${parsed.envelope.version}`
                        : ''}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={cancelImport}
                  aria-label="Clear selected file"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Content summary */}
              <div className="grid grid-cols-3 gap-3">
                <PreviewStat
                  icon={MessageSquareText}
                  label="Quick Replies"
                  value={parsedCounts.quickReplies}
                  accent="text-emerald-300"
                />
                <PreviewStat
                  icon={Tags}
                  label="Tags"
                  value={parsedCounts.tags}
                  accent="text-teal-300"
                />
                <PreviewStat
                  icon={FileText}
                  label="Templates"
                  value={parsedCounts.templates}
                  accent="text-amber-300"
                />
              </div>

              <p className="text-sm text-muted-foreground">
                This file contains{' '}
                <span className="font-medium text-foreground">
                  {parsedCounts.quickReplies} quick replies
                </span>
                ,{' '}
                <span className="font-medium text-foreground">
                  {parsedCounts.tags} tags
                </span>
                , and{' '}
                <span className="font-medium text-foreground">
                  {parsedCounts.templates} templates
                </span>
                .
              </p>

              <Separator />

              {/* Mode selector */}
              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium">Import mode</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ModeCard
                    selected={mode === 'merge'}
                    onSelect={() => setMode('merge')}
                    icon={Check}
                    title="Merge"
                    description="Add new items only. Existing rows with the same shortcut / name are kept as-is."
                    accent="emerald"
                  />
                  <ModeCard
                    selected={mode === 'replace'}
                    onSelect={() => setMode('replace')}
                    icon={Trash2}
                    title="Replace"
                    description="Delete ALL existing Quick Replies / Tags / Templates, then import the new ones."
                    accent="rose"
                    danger
                  />
                </div>
              </div>

              {/* Replace warning */}
              {mode === 'replace' && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <span className="font-semibold">Danger zone.</span>{' '}
                    Replace mode will permanently delete every existing Quick
                    Reply, Tag and Template before importing. Tag associations
                    on contacts will also be lost. This cannot be undone.
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="ghost" onClick={cancelImport} disabled={importing}>
                  Cancel
                </Button>
                <Button
                  onClick={runImport}
                  disabled={importing || totalParsed === 0}
                  className={
                    mode === 'replace'
                      ? 'bg-rose-600 text-white hover:bg-rose-700'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700'
                  }
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : mode === 'replace' ? (
                    <Trash2 className="h-4 w-4" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {mode === 'replace' ? 'Replace & Import' : 'Import'}
                </Button>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Helpful note when nothing selected */}
        {!parsed && !parseError && (
          <p className="text-center text-xs text-muted-foreground">
            Tip: use <span className="font-medium">Export Everything</span>{' '}
            above to generate a file you can re-import here.
          </p>
        )}
      </section>
    </motion.div>
  )
}

// ------------------------------------------------------------
// Preview stat tile
// ------------------------------------------------------------
function PreviewStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType
  label: string
  value: number
  accent: string
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', accent)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  )
}

// ------------------------------------------------------------
// Mode selector card (radio-style)
// ------------------------------------------------------------
function ModeCard({
  selected,
  onSelect,
  icon: Icon,
  title,
  description,
  accent,
  danger = false,
}: {
  selected: boolean
  onSelect: () => void
  icon: React.ElementType
  title: string
  description: string
  accent: 'emerald' | 'rose'
  danger?: boolean
}) {
  const palette =
    accent === 'emerald'
      ? {
          ring: 'border-emerald-500/60 bg-emerald-500/10',
          icon: 'bg-emerald-500/15 text-emerald-300',
          check: 'text-emerald-400',
        }
      : {
          ring: 'border-rose-500/60 bg-rose-500/10',
          icon: 'bg-rose-500/15 text-rose-300',
          check: 'text-rose-400',
        }
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'relative flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors',
        selected
          ? palette.ring
          : 'border-border bg-background/40 hover:bg-background/70',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn('grid h-7 w-7 place-items-center rounded-md', palette.icon)}>
            <Icon className="h-4 w-4" />
          </div>
          <span className="font-medium">
            {title}
            {danger && (
              <span className="ml-1.5 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-rose-300">
                Risky
              </span>
            )}
          </span>
        </div>
        <span
          className={cn(
            'grid h-4 w-4 place-items-center rounded-full border',
            selected
              ? cn(palette.check, 'border-current')
              : 'border-muted-foreground/40 text-transparent',
          )}
        >
          {selected ? (
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
          ) : null}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  )
}
