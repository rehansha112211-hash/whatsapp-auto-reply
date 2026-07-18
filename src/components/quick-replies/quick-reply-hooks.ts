'use client'

// ============================================================
// Quick Reply hooks — fetching + CRUD + slash-command detection
// ============================================================
import * as React from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api-client'
import type { QuickReplyRow } from '@/lib/types'
import { detectSlashCommand, matchSlash } from './quick-reply-helpers'

// ------------------------------------------------------------
// useQuickReplies — load + create + update + delete
// ------------------------------------------------------------
interface QuickRepliesState {
  items: QuickReplyRow[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  createReply: (input: {
    shortcut: string
    title: string
    body: string
    category: string
  }) => Promise<QuickReplyRow>
  updateReply: (
    id: string,
    input: {
      shortcut?: string
      title?: string
      body?: string
      category?: string
    },
  ) => Promise<QuickReplyRow>
  deleteReply: (id: string) => Promise<void>
  bumpUsage: (id: string) => Promise<void>
  replaceReply: (next: QuickReplyRow) => void
  removeReply: (id: string) => void
}

export function useQuickReplies(): QuickRepliesState {
  const [items, setItems] = React.useState<QuickReplyRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const reload = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiGet<{ items: QuickReplyRow[] }>('/api/quick-replies')
      setItems(res.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quick replies')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void reload()
  }, [reload])

  const createReply = React.useCallback(
    async (input: {
      shortcut: string
      title: string
      body: string
      category: string
    }): Promise<QuickReplyRow> => {
      const res = await apiPost<{ quickReply: QuickReplyRow }>(
        '/api/quick-replies',
        input,
      )
      setItems((prev) => {
        const next = [...prev, res.quickReply]
        next.sort(
          (a, b) =>
            a.category.localeCompare(b.category) ||
            a.shortcut.localeCompare(b.shortcut),
        )
        return next
      })
      return res.quickReply
    },
    [],
  )

  const updateReply = React.useCallback(
    async (
      id: string,
      input: {
        shortcut?: string
        title?: string
        body?: string
        category?: string
      },
    ): Promise<QuickReplyRow> => {
      const res = await apiPut<{ quickReply: QuickReplyRow }>(
        `/api/quick-replies/${id}`,
        input,
      )
      setItems((prev) => {
        const next = [...prev]
        const idx = next.findIndex((q) => q.id === id)
        if (idx >= 0) next[idx] = res.quickReply
        next.sort(
          (a, b) =>
            a.category.localeCompare(b.category) ||
            a.shortcut.localeCompare(b.shortcut),
        )
        return next
      })
      return res.quickReply
    },
    [],
  )

  const deleteReply = React.useCallback(async (id: string): Promise<void> => {
    await apiDelete(`/api/quick-replies/${id}`)
    setItems((prev) => prev.filter((q) => q.id !== id))
  }, [])

  const bumpUsage = React.useCallback(async (id: string): Promise<void> => {
    // Optimistic local bump first so the UI feels instant.
    setItems((prev) =>
      prev.map((q) =>
        q.id === id ? { ...q, usageCount: q.usageCount + 1 } : q,
      ),
    )
    try {
      await apiPut(`/api/quick-replies/${id}?used=1`)
    } catch {
      // Revert on failure
      setItems((prev) =>
        prev.map((q) =>
          q.id === id ? { ...q, usageCount: Math.max(0, q.usageCount - 1) } : q,
        ),
      )
    }
  }, [])

  const replaceReply = React.useCallback((next: QuickReplyRow) => {
    setItems((prev) => {
      const idx = prev.findIndex((q) => q.id === next.id)
      if (idx < 0) return [...prev, next]
      const copy = [...prev]
      copy[idx] = next
      return copy
    })
  }, [])

  const removeReply = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((q) => q.id !== id))
  }, [])

  return {
    items,
    loading,
    error,
    reload,
    createReply,
    updateReply,
    deleteReply,
    bumpUsage,
    replaceReply,
    removeReply,
  }
}

// ------------------------------------------------------------
// useSlashCommand — detect `/shortcut` at the cursor and expose
// keyboard navigation for the floating dropdown.
// ------------------------------------------------------------
export interface SlashCommandState {
  matches: QuickReplyRow[]
  activeIndex: number
  detection: { partial: string; start: number; end: number } | null
  setActiveIndex: (i: number) => void
  reset: () => void
}

export interface UseSlashCommandArgs {
  text: string
  cursor: number
  items: QuickReplyRow[]
  maxMatches?: number
}

export function useSlashCommand({
  text,
  cursor,
  items,
  maxMatches = 6,
}: UseSlashCommandArgs): SlashCommandState {
  const [activeIndex, setActiveIndex] = React.useState(0)

  const detection = React.useMemo(
    () => detectSlashCommand(text, cursor),
    [text, cursor],
  )

  const matches = React.useMemo(() => {
    if (!detection) return []
    const list = matchSlash(items, detection.partial)
    return list.slice(0, maxMatches)
  }, [detection, items, maxMatches])

  // Reset the active index whenever the match set changes.
  React.useEffect(() => {
    setActiveIndex(0)
  }, [matches])

  const reset = React.useCallback(() => setActiveIndex(0), [])

  return {
    matches,
    activeIndex: matches.length === 0 ? 0 : Math.min(activeIndex, matches.length - 1),
    detection,
    setActiveIndex,
    reset,
  }
}
