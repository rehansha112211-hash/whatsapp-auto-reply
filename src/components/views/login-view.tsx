'use client'

import * as React from 'react'
import { MessageCircle, Eye, EyeOff, Loader2, Lock, User, ShieldCheck, ArrowRight, Crown, ShieldCheck as ShieldIcon, Eye as EyeIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { apiPost } from '@/lib/api-client'
import type { AuthUser } from '@/lib/types'

interface LoginViewProps {
  onLoggedIn: (user: AuthUser) => void
}

const DEMO_ACCOUNTS: Array<{
  username: string
  password: string
  role: 'admin' | 'operator' | 'viewer'
  label: string
  icon: React.ComponentType<{ className?: string }>
  tint: string
}> = [
  {
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    label: 'Full access',
    icon: Crown,
    tint: 'text-emerald-300',
  },
  {
    username: 'operator',
    password: 'operator123',
    role: 'operator',
    label: 'Send messages, no settings',
    icon: ShieldIcon,
    tint: 'text-sky-300',
  },
  {
    username: 'viewer',
    password: 'viewer123',
    role: 'viewer',
    label: 'Read-only',
    icon: EyeIcon,
    tint: 'text-zinc-300',
  },
]

export function LoginView({ onLoggedIn }: LoginViewProps) {
  const [username, setUsername] = React.useState('admin')
  const [password, setPassword] = React.useState('admin123')
  const [remember, setRemember] = React.useState(true)
  const [show, setShow] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await apiPost<{ user: AuthUser }>('/api/auth/login', {
        username,
        password,
        remember,
      })
      onLoggedIn(data.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const pickDemo = (acct: (typeof DEMO_ACCOUNTS)[number]) => {
    setUsername(acct.username)
    setPassword(acct.password)
    setError(null)
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Background decorations */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
      <div className="pointer-events-none absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-1/4 h-96 w-96 rounded-full bg-teal-500/20 blur-3xl" />

      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border bg-card/60 shadow-2xl backdrop-blur-xl md:grid-cols-2">
          {/* Left brand panel */}
          <div className="relative hidden flex-col justify-between bg-gradient-to-br from-emerald-600/20 via-teal-700/10 to-transparent p-8 md:flex">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30">
                <MessageCircle className="h-6 w-6" />
              </div>
              <div>
                <div className="text-base font-semibold">WhatsApp Auto Reply</div>
                <div className="text-xs text-muted-foreground">by QorvixNode Technologies</div>
              </div>
            </div>

            <div className="space-y-4">
              <h1 className="text-3xl font-bold leading-tight tracking-tight">
                AI-powered WhatsApp Business Automation
              </h1>
              <p className="text-sm text-muted-foreground">
                Connect WhatsApp via QR, auto-reply with AI, detect leads, take over
                conversations as a human, and monitor everything in real time.
              </p>
              <ul className="space-y-2 text-sm">
                {[
                  'QR-based WhatsApp login & session restore',
                  'AI auto-reply with conversation memory',
                  'Lead detection & owner notifications',
                  'Human takeover + live dashboard',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-muted-foreground">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
                      <ShieldCheck className="h-3 w-3" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <div className="text-[11px] text-muted-foreground/70">
              © {new Date().getFullYear()} QorvixNode Technologies · Production build
            </div>
          </div>

          {/* Right login form */}
          <div className="flex flex-col justify-center p-6 sm:p-10">
            <div className="mb-8 flex items-center gap-3 md:hidden">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">WhatsApp Auto Reply</div>
                <div className="text-[11px] text-muted-foreground">QorvixNode Technologies</div>
              </div>
            </div>

            <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to access your automation dashboard
            </p>

            <form onSubmit={submit} className="mt-8 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    autoComplete="username"
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="pl-9 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={remember}
                  onCheckedChange={(v) => setRemember(v === true)}
                />
                <Label htmlFor="remember" className="cursor-pointer text-sm text-muted-foreground">
                  Keep me signed in for 7 days
                </Label>
              </div>

              {error && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2.5 text-center text-[11px] text-muted-foreground">
                <div className="mb-1.5 font-medium">Demo accounts — click to fill</div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                  {DEMO_ACCOUNTS.map((acct) => {
                    const Icon = acct.icon
                    return (
                      <button
                        key={acct.username}
                        type="button"
                        onClick={() => pickDemo(acct)}
                        className="group flex items-center gap-1.5 rounded-md border bg-background/60 px-2 py-1.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/60"
                      >
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${acct.tint}`} />
                        <div className="min-w-0 leading-tight">
                          <div className="font-mono text-[11px] text-foreground">
                            {acct.username}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {acct.label}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
