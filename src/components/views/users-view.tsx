'use client'

// ============================================================
// UsersView — multi-user team management (admin only).
//
// Layout:
//   · Header — title + "New User" button + role legend
//   · Users table — avatar (initials), username, displayName,
//     role badge (admin=emerald, operator=sky, viewer=zinc),
//     last login, created date, actions (edit / delete).
//   · New / Edit dialogs — username (new only), password,
//     displayName, role select. Edit dialog also has a separate
//     "Reset password" field that is optional.
//   · Delete confirmation — AlertDialog blocking self-delete
//     and last-admin delete (the API enforces both as well).
//
// The current user is highlighted with a "You" badge. Role
// badges are colour-coded and the table uses framer-motion for
// entrance animation.
// ============================================================
import * as React from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  UserPlus,
  Pencil,
  Trash2,
  Loader2,
  Shield,
  ShieldCheck,
  Crown,
  Eye,
  UserCog,
  Users as UsersIcon,
  RefreshCw,
  Lock,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '@/lib/api-client'
import { formatDateTime, timeAgo, initials } from '@/lib/format'
import { useCurrentUser } from '@/hooks/use-current-user'
import type { UserListRow } from '@/lib/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type Role = 'admin' | 'operator' | 'viewer'

interface RoleMeta {
  label: string
  badge: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

const ROLE_META: Record<Role, RoleMeta> = {
  admin: {
    label: 'Admin',
    badge:
      'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    icon: Crown,
    description: 'Full access — every view, every action.',
  },
  operator: {
    label: 'Operator',
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    icon: ShieldCheck,
    description:
      'Operate chats, send messages, schedule, simulator. No settings, users, webhooks or data.',
  },
  viewer: {
    label: 'Viewer',
    badge: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
    icon: Eye,
    description: 'Read-only — dashboard, chats, leads, search, analytics.',
  },
}

function normalizeRole(role: string): Role {
  if (role === 'admin' || role === 'operator' || role === 'viewer') return role
  return 'viewer'
}

function RoleBadge({ role }: { role: string }) {
  const r = normalizeRole(role)
  const meta = ROLE_META[r]
  const Icon = meta.icon
  return (
    <Badge
      variant="outline"
      className={cn('gap-1 font-medium', meta.badge)}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  )
}

function Avatar({ name, role }: { name: string; role: string }) {
  const r = normalizeRole(role)
  const ring =
    r === 'admin'
      ? 'from-emerald-500 to-teal-600'
      : r === 'operator'
        ? 'from-sky-500 to-cyan-600'
        : 'from-zinc-500 to-zinc-700'
  return (
    <div
      className={cn(
        'grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br text-[11px] font-bold text-white',
        ring,
      )}
      title={name}
    >
      {initials(name) || '?'}
    </div>
  )
}

// ------------------------------------------------------------
// New / Edit user dialog (shared form)
// ------------------------------------------------------------
interface FormState {
  username: string
  password: string
  displayName: string
  role: Role
}

interface UserDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  mode: 'create' | 'edit'
  initial?: UserListRow
  onSaved: () => void
}

function UserDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onSaved,
}: UserDialogProps) {
  const [form, setForm] = React.useState<FormState>({
    username: '',
    password: '',
    displayName: '',
    role: 'viewer',
  })
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Reset the form whenever the dialog opens (so opening "New User"
  // twice in a row doesn't keep the previous draft).
  React.useEffect(() => {
    if (!open) return
    setError(null)
    if (mode === 'edit' && initial) {
      setForm({
        username: initial.username,
        password: '',
        displayName: initial.displayName,
        role: normalizeRole(initial.role),
      })
    } else {
      setForm({
        username: '',
        password: '',
        displayName: '',
        role: 'viewer',
      })
    }
  }, [open, mode, initial])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      if (mode === 'create') {
        await apiPost('/api/users', {
          username: form.username,
          password: form.password,
          displayName: form.displayName,
          role: form.role,
        })
        toast.success(`User "${form.username}" created`)
      } else if (initial) {
        const patch: Record<string, unknown> = {
          displayName: form.displayName,
          role: form.role,
        }
        // Only send password if the admin typed a new one.
        if (form.password.length > 0) {
          patch.password = form.password
        }
        await apiPatch(`/api/users/${initial.id}`, patch)
        toast.success(`User "${initial.username}" updated`)
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to save user'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'New team member' : 'Edit user'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Create a new login with a specific role. They can sign in immediately.'
              : 'Update display name, role, or reset the password.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-username">Username</Label>
            <Input
              id="user-username"
              value={form.username}
              onChange={(e) =>
                setForm((s) => ({ ...s, username: e.target.value }))
              }
              placeholder="e.g. jane.sales"
              autoComplete="off"
              disabled={mode === 'edit'}
              required
            />
            {mode === 'edit' && (
              <p className="text-[11px] text-muted-foreground">
                Username cannot be changed after creation.
              </p>
            )}
            {mode === 'create' && (
              <p className="text-[11px] text-muted-foreground">
                3-32 chars: letters, numbers, dot, underscore, dash.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-display">Display name</Label>
            <Input
              id="user-display"
              value={form.displayName}
              onChange={(e) =>
                setForm((s) => ({ ...s, displayName: e.target.value }))
              }
              placeholder="e.g. Jane Sales"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-role">Role</Label>
            <Select
              value={form.role}
              onValueChange={(v) =>
                setForm((s) => ({ ...s, role: v as Role }))
              }
            >
              <SelectTrigger id="user-role" className="w-full">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_META) as Role[]).map((r) => {
                  const meta = ROLE_META[r]
                  const Icon = meta.icon
                  return (
                    <SelectItem key={r} value={r}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {ROLE_META[form.role].description}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-password">
              {mode === 'create' ? 'Password' : 'Reset password'}
            </Label>
            <Input
              id="user-password"
              type="password"
              value={form.password}
              onChange={(e) =>
                setForm((s) => ({ ...s, password: e.target.value }))
              }
              placeholder={
                mode === 'create'
                  ? 'At least 6 characters'
                  : 'Leave blank to keep current password'
              }
              autoComplete="new-password"
              required={mode === 'create'}
            />
            {mode === 'edit' && (
              <p className="text-[11px] text-muted-foreground">
                Fill in only if you want to set a new password.
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === 'create' ? (
                <UserPlus className="h-4 w-4" />
              ) : (
                <Pencil className="h-4 w-4" />
              )}
              {mode === 'create' ? 'Create user' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------
// Delete confirmation
// ------------------------------------------------------------
interface DeleteDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  target: UserListRow | null
  isSelf: boolean
  onDeleted: () => void
}

function DeleteDialog({
  open,
  onOpenChange,
  target,
  isSelf,
  onDeleted,
}: DeleteDialogProps) {
  const [deleting, setDeleting] = React.useState(false)

  const confirm = async () => {
    if (!target) return
    setDeleting(true)
    try {
      await apiDelete(`/api/users/${target.id}`)
      toast.success(`User "${target.username}" deleted`)
      onDeleted()
      onOpenChange(false)
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to delete user'
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  // Self-delete is blocked by the API, but we also block it client-side
  // so the user never sees a confusing error toast.
  const blocked = isSelf

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete user?</AlertDialogTitle>
          <AlertDialogDescription>
            {blocked ? (
              <>
                You can&rsquo;t delete your own account. Ask another admin to
                remove it for you.
              </>
            ) : (
              <>
                This will permanently delete{' '}
                <span className="font-semibold text-foreground">
                  @{target?.username}
                </span>{' '}
                ({target?.displayName}). They will be signed out immediately
                and won&rsquo;t be able to log in again.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              void confirm()
            }}
            disabled={deleting || blocked}
            className={cn(
              'gap-1.5 bg-rose-600 text-white hover:bg-rose-700',
              blocked && 'opacity-50',
            )}
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete user
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ------------------------------------------------------------
// Main view
// ------------------------------------------------------------
export function UsersView() {
  const currentUser = useCurrentUser()
  const [items, setItems] = React.useState<UserListRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [createOpen, setCreateOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<UserListRow | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<UserListRow | null>(null)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet<{ items: UserListRow[] }>('/api/users')
      setItems(data.items)
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to load users'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const adminCount = items.filter((u) => normalizeRole(u.role) === 'admin').length

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-400/80">
            <UsersIcon className="h-3.5 w-3.5" />
            <span>Team management</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gradient-premium">
            Users &amp; Roles
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage who can access the dashboard and what they can do. Three
            roles are supported:{' '}
            <span className="text-emerald-300">admin</span>,{' '}
            <span className="text-sky-300">operator</span>, and{' '}
            <span className="text-zinc-300">viewer</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
          >
            <UserPlus className="h-4 w-4" />
            New user
          </Button>
        </div>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(Object.keys(ROLE_META) as Role[]).map((r) => {
          const meta = ROLE_META[r]
          const Icon = meta.icon
          const count = items.filter((u) => normalizeRole(u.role) === r).length
          return (
            <div
              key={r}
              className="rounded-xl border bg-card/60 p-4 backdrop-blur card-hover"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'grid h-8 w-8 place-items-center rounded-lg',
                      meta.badge,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{meta.label}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {count} member{count === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {meta.description}
              </p>
            </div>
          )
        })}
      </div>

      {/* Users table */}
      <div className="rounded-xl border bg-card/60 backdrop-blur card-hover">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <UserCog className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">All users</h2>
            <Badge variant="secondary" className="font-mono">
              {items.length}
            </Badge>
          </div>
          {adminCount <= 1 && items.length > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-300">
              <Lock className="h-3.5 w-3.5" />
              <span>Only 1 admin — promote another to avoid lockout.</span>
            </div>
          )}
        </div>

        {error ? (
          <div className="px-4 py-8 text-center">
            <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-rose-500/10 text-rose-400">
              <Shield className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">Couldn&rsquo;t load users</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void refresh()}
            >
              Try again
            </Button>
          </div>
        ) : loading ? (
          <div className="space-y-2 px-4 py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-3"
              >
                <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-2.5 w-48 animate-pulse rounded bg-muted/70" />
                </div>
                <div className="h-5 w-16 animate-pulse rounded bg-muted" />
                <div className="h-8 w-16 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <UsersIcon className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No users yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create your first team member to get started.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">User</TableHead>
                  <TableHead className="min-w-[140px]">Role</TableHead>
                  <TableHead className="min-w-[160px]">Last login</TableHead>
                  <TableHead className="min-w-[140px]">Created</TableHead>
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((u) => {
                  const isSelf = currentUser?.id === u.id
                  return (
                    <TableRow key={u.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar name={u.displayName} role={u.role} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-semibold">
                                {u.displayName}
                              </span>
                              {isSelf && (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[10px] text-emerald-300"
                                >
                                  You
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              @{u.username}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={u.role} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.lastLoginAt ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default">
                                {timeAgo(u.lastLoginAt)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {formatDateTime(u.lastLoginAt)}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground/60">Never</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default">
                              {formatDateTime(u.createdAt)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {timeAgo(u.createdAt)}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  setEditTarget(u)
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Edit user</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                                disabled={isSelf}
                                onClick={() => {
                                  setDeleteTarget(u)
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {isSelf
                                ? "You can't delete yourself"
                                : 'Delete user'}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </div>

      <Separator />

      <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-xs text-muted-foreground">
        <div className="flex items-start gap-2">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <div>
            <p className="font-medium text-foreground">Permission model</p>
            <p className="mt-1">
              <span className="text-emerald-300">Admin</span> can do everything.{' '}
              <span className="text-sky-300">Operator</span> can send messages,
              schedule, and use the simulator but can&rsquo;t change settings,
              manage users, webhooks, or data.{' '}
              <span className="text-zinc-300">Viewer</span> is read-only — no
              sending, no settings, no simulator.
            </p>
            <p className="mt-2">
              All mutations are also enforced server-side. A user who manually
              crafts an API request without permission receives a 403.
            </p>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <UserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onSaved={() => void refresh()}
      />
      <UserDialog
        open={editTarget !== null}
        onOpenChange={(v) => {
          if (!v) setEditTarget(null)
        }}
        mode="edit"
        initial={editTarget ?? undefined}
        onSaved={() => void refresh()}
      />
      <DeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null)
        }}
        target={deleteTarget}
        isSelf={deleteTarget?.id === currentUser?.id}
        onDeleted={() => void refresh()}
      />
    </motion.div>
  )
}
