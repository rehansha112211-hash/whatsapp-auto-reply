// ============================================================
// PermissionDenied — friendly "you don't have access" card.
// Rendered by page.tsx when the active view requires a permission
// the current user doesn't have (e.g. viewer landing on /settings).
// ============================================================
'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Lock, ShieldAlert, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ViewKey } from '@/lib/types'

interface PermissionDeniedProps {
  /** Where to send the user when they click "Back to dashboard". */
  onBack?: () => void
  /** Optional view key for a more specific message. */
  view?: ViewKey
  /** Optional role label shown in the body ("Your role: viewer"). */
  role?: string
}

const VIEW_LABELS: Partial<Record<ViewKey, string>> = {
  'ai-settings': 'AI Settings',
  'company-settings': 'Company Settings',
  'owner-settings': 'Owner Settings',
  'autoreply-settings': 'Auto Reply Settings',
  users: 'User Management',
  webhooks: 'Webhook Integrations',
  'data-management': 'Data Management',
  system: 'System Health',
  logs: 'System Logs',
  whatsapp: 'WhatsApp Connection',
  simulator: 'AI Simulator',
  broadcast: 'Broadcast',
  scheduled: 'Scheduled Messages',
}

export function PermissionDenied({ onBack, view, role }: PermissionDeniedProps) {
  const label = view ? (VIEW_LABELS[view] ?? 'this page') : 'this page'
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-full max-w-md rounded-xl border bg-card/60 p-6 text-center backdrop-blur card-hover"
      >
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-rose-500/10 text-rose-400">
          <Lock className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">
          You don&rsquo;t have permission to access this page
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {label === 'this page'
            ? 'Your account role does not have access to this page.'
            : `Your account role does not have access to ${label}.`}
          {role && (
            <>
              {' '}
              Your role: <span className="font-mono text-foreground">{role}</span>.
            </>
          )}
        </p>
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-left text-xs text-amber-200/90">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <span>
            If you believe this is a mistake, ask an administrator to upgrade your
            account role.
          </span>
        </div>
        {onBack && (
          <Button
            variant="outline"
            className="mt-5 gap-1.5"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Button>
        )}
      </motion.div>
    </div>
  )
}
