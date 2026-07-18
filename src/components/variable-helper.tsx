'use client'

// ============================================================
// VariableHelper — reusable panel that:
//   · renders every supported `{variable}` as a clickable chip
//     (click → calls onInsertVariable, typically to drop the
//     token at the textarea cursor);
//   · shows a live preview of `text` with variables substituted
//     against the supplied `contact` (or example values when no
//     contact is provided);
//   · exposes a collapsible reference list with description +
//     example for each variable.
//
// Used by:
//   · broadcast-view.tsx   — below the message textarea
//   · scheduled-view.tsx   — inside the New/Edit scheduled dialog
//   · quick-reply manager  — inside the create/edit form
// ============================================================
import * as React from 'react'
import {
  Braces,
  ChevronDown,
  Eye,
  User,
  Phone,
  Variable as VariableIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  AVAILABLE_VARIABLES,
  substituteVariables,
  type ContactVariableData,
} from '@/lib/template-variables'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

export interface VariableHelperProps {
  /** Current text to preview (typically the composer/textarea value). */
  text: string
  /** Optional contact used for the live preview. */
  contact?: ContactVariableData | null
  /** Called with the raw placeholder (e.g. `{name}`) when a chip is clicked. */
  onInsertVariable: (variable: string) => void
  className?: string
  /** Compact mode hides the reference list toggle (used in tight dialogs). */
  compact?: boolean
}

export function VariableHelper({
  text,
  contact,
  onInsertVariable,
  className,
  compact = false,
}: VariableHelperProps) {
  const [open, setOpen] = React.useState(false)
  const hasContact = !!contact
  const contactLabel =
    contact?.name?.trim() ||
    contact?.phone?.trim() ||
    (contact ? 'this contact' : '')

  const preview = React.useMemo(() => {
    if (!text.trim()) return ''
    return substituteVariables(text, contact ?? {})
  }, [text, contact])

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      {/* ---------------- Chip row ---------------- */}
      <div className="flex flex-col gap-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <Braces className="h-3 w-3" />
          Variables — click to insert
        </span>
        <div className="flex flex-wrap gap-1.5">
          {AVAILABLE_VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => onInsertVariable(v.key)}
              title={`${v.label} — ${v.description}`}
              aria-label={`Insert variable ${v.key} — ${v.description}`}
              className="inline-flex items-center rounded-md border bg-muted/50 px-2 py-0.5 text-xs font-mono cursor-pointer hover:bg-primary/10 hover:border-primary/40 transition-colors"
            >
              {v.key}
            </button>
          ))}
        </div>
      </div>

      {/* ---------------- Live preview ---------------- */}
      <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Eye className="h-3 w-3" />
            Preview
          </span>
          {hasContact ? (
            <span className="inline-flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate">as {contactLabel}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Phone className="h-3 w-3" />
              example values
            </span>
          )}
        </div>
        {preview.trim() ? (
          <p className="whitespace-pre-wrap break-words text-foreground/90">
            {preview}
          </p>
        ) : (
          <p className="italic text-muted-foreground">
            {hasContact
              ? `Message preview with ${contactLabel}'s data will appear here.`
              : 'Type a message with variables to see a preview.'}
          </p>
        )}
        {!hasContact && (
          <p className="mt-1.5 text-[10px] text-muted-foreground/70">
            Pick a contact for an accurate preview — variables you don&apos;t
            have data for will appear as the literal token.
          </p>
        )}
      </div>

      {/* ---------------- Collapsible reference ---------------- */}
      {!compact && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              aria-expanded={open}
            >
              <VariableIcon className="h-3 w-3" />
              {open ? 'Hide' : 'Show'} variable reference
              <ChevronDown
                className={cn(
                  'h-3 w-3 transition-transform',
                  open && 'rotate-180',
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 overflow-hidden">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {AVAILABLE_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => onInsertVariable(v.key)}
                  title={`Insert ${v.key}`}
                  className="flex flex-col gap-0.5 rounded-md border bg-card/40 p-2 text-left transition-colors hover:bg-muted/50 hover:border-primary/30"
                >
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">
                      {v.key}
                    </code>
                    <span className="text-xs font-medium">{v.label}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {v.description}
                  </span>
                  <span className="text-[10px] text-muted-foreground/70">
                    e.g. <span className="font-mono">{v.example}</span>
                  </span>
                </button>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}
