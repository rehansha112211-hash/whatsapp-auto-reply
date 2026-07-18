'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  Building2,
  Save,
  RotateCcw,
  Eye,
  Loader2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet, apiPut, ApiError } from '@/lib/api-client'
import { QORVIX_SERVICES } from '@/lib/types'

interface CompanySettings {
  name: string
  website: string
  description: string
  services: string[]
  businessHours: Record<string, string>
  greetingMsg: string
  closingMsg: string
  supportMsg: string
}

interface CompanyApiResponse {
  name: string
  website: string
  description: string
  services: string[]
  businessHours: Record<string, string>
  greetingMsg: string
  closingMsg: string
  supportMsg: string
}

const DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
]

const DEFAULTS: CompanySettings = {
  name: '',
  website: '',
  description: '',
  services: [],
  businessHours: {
    mon: '09:00-19:00',
    tue: '09:00-19:00',
    wed: '09:00-19:00',
    thu: '09:00-19:00',
    fri: '09:00-19:00',
    sat: '09:00-14:00',
    sun: 'closed',
  },
  greetingMsg: '',
  closingMsg: '',
  supportMsg: '',
}

function parseHoursEntry(raw: string): { start: string; end: string; closed: boolean } {
  if (!raw || raw === 'closed') return { start: '', end: '', closed: true }
  const [start, end] = raw.split('-')
  return { start: start ?? '', end: end ?? '', closed: false }
}

function serializeHours(start: string, end: string, closed: boolean): string {
  if (closed || !start || !end) return 'closed'
  return `${start}-${end}`
}

export function CompanySettingsView() {
  const [settings, setSettings] = React.useState<CompanySettings>(DEFAULTS)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<CompanyApiResponse>('/api/settings/company')
      setSettings({
        name: data.name,
        website: data.website,
        description: data.description,
        services: data.services ?? [],
        businessHours: data.businessHours ?? DEFAULTS.businessHours,
        greetingMsg: data.greetingMsg,
        closingMsg: data.closingMsg,
        supportMsg: data.supportMsg,
      })
    } catch (err) {
      // 401 is handled globally by the API client (redirect to login)
      if (err instanceof ApiError && err.status === 401) return
      toast.error('Failed to load company settings', { description: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const toggleService = (service: string) => {
    setSettings((s) => {
      const has = s.services.includes(service)
      return {
        ...s,
        services: has ? s.services.filter((x) => x !== service) : [...s.services, service],
      }
    })
  }

  const updateHours = (day: string, value: string) => {
    setSettings((s) => ({
      ...s,
      businessHours: { ...s.businessHours, [day]: value },
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiPut('/api/settings/company', {
        name: settings.name,
        website: settings.website,
        description: settings.description,
        services: settings.services,
        greetingMsg: settings.greetingMsg,
        closingMsg: settings.closingMsg,
        supportMsg: settings.supportMsg,
        businessHours: settings.businessHours,
      })
      toast.success('Company settings saved', {
        description: 'AI system prompt context updated.',
      })
      await load()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message
      toast.error('Failed to save company settings', { description: msg })
    } finally {
      setSaving(false)
    }
  }

  const contextPreview = React.useMemo(() => buildContextPreview(settings), [settings])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-premium">Company Profile</h1>
        <p className="text-sm text-muted-foreground">
          Company information that powers the AI system prompt and customer-facing messages.
        </p>
      </div>
      <Card className="rounded-xl border bg-card/60 backdrop-blur card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="size-5 text-primary" />
            Company Profile
          </CardTitle>
          <CardDescription>
            The company info powers the AI&apos;s system prompt and is shown to customers.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Company Name" htmlFor="company-name">
                  <Input
                    id="company-name"
                    value={settings.name}
                    onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                    placeholder="QorvixNode Technologies"
                  />
                </Field>
                <Field label="Website" htmlFor="company-website">
                  <Input
                    id="company-website"
                    value={settings.website}
                    onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                    placeholder="https://example.com"
                  />
                </Field>
              </div>

              <Field label="Business Description" htmlFor="company-desc">
                <Textarea
                  id="company-desc"
                  value={settings.description}
                  onChange={(e) => setSettings({ ...settings, description: e.target.value })}
                  rows={4}
                  placeholder="What does the company do, who does it serve, what makes it unique..."
                />
              </Field>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Services Offered</Label>
                <p className="text-xs text-muted-foreground">
                  Tap to toggle. Selected services are passed to the AI as context.
                </p>
                <div className="flex flex-wrap gap-2">
                  {QORVIX_SERVICES.map((service) => {
                    const active = settings.services.includes(service)
                    return (
                      <button
                        key={service}
                        type="button"
                        onClick={() => toggleService(service)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background hover:bg-accent'
                        }`}
                      >
                        {service}
                      </button>
                    )
                  })}
                </div>
                {settings.services.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {settings.services.length} service{settings.services.length === 1 ? '' : 's'} selected
                  </p>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="text-sm font-medium">Business Hours</Label>
                <p className="text-xs text-muted-foreground">
                  Set start/end times for each day. Check &ldquo;Closed&rdquo; for non-working days.
                </p>
                <div className="grid gap-2">
                  {DAYS.map((day) => {
                    const entry = parseHoursEntry(settings.businessHours[day.key] ?? '')
                    return (
                      <div
                        key={day.key}
                        className="grid grid-cols-1 items-center gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[120px_1fr_1fr_auto]"
                      >
                        <span className="text-sm font-medium">{day.label}</span>
                        <Input
                          type="time"
                          value={entry.start}
                          disabled={entry.closed}
                          onChange={(e) =>
                            updateHours(
                              day.key,
                              serializeHours(e.target.value, entry.end, false),
                            )
                          }
                          className="w-full"
                        />
                        <Input
                          type="time"
                          value={entry.end}
                          disabled={entry.closed}
                          onChange={(e) =>
                            updateHours(
                              day.key,
                              serializeHours(entry.start, e.target.value, false),
                            )
                          }
                          className="w-full"
                        />
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={entry.closed}
                            onChange={(e) =>
                              updateHours(
                                day.key,
                                e.target.checked
                                  ? 'closed'
                                  : serializeHours(entry.start || '09:00', entry.end || '19:00', false),
                              )
                            }
                            className="size-4 rounded border-border"
                          />
                          Closed
                        </label>
                      </div>
                    )
                  })}
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-1">
                <Field label="Greeting Message" htmlFor="company-greeting">
                  <Textarea
                    id="company-greeting"
                    value={settings.greetingMsg}
                    onChange={(e) => setSettings({ ...settings, greetingMsg: e.target.value })}
                    rows={3}
                    placeholder="Hi! 👋 Welcome to QorvixNode Technologies..."
                  />
                </Field>
                <Field label="Closing Message" htmlFor="company-closing">
                  <Textarea
                    id="company-closing"
                    value={settings.closingMsg}
                    onChange={(e) => setSettings({ ...settings, closingMsg: e.target.value })}
                    rows={3}
                    placeholder="Thanks for chatting with us! We will follow up shortly. 🙏"
                  />
                </Field>
                <Field label="Support Message" htmlFor="company-support">
                  <Textarea
                    id="company-support"
                    value={settings.supportMsg}
                    onChange={(e) => setSettings({ ...settings, supportMsg: e.target.value })}
                    rows={3}
                    placeholder='For urgent support, reply with "talk to owner"...'
                  />
                </Field>
              </div>
            </>
          )}
        </CardContent>

        <CardFooter className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save
          </Button>
          <Button variant="outline" onClick={load} disabled={loading || saving}>
            <RotateCcw className="size-4" />
            Reset
          </Button>
        </CardFooter>
      </Card>

      <Card className="rounded-xl border bg-card/60 backdrop-blur card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="size-4 text-primary" />
            AI Context Preview
          </CardTitle>
          <CardDescription>
            How the company info appears inside the AI system prompt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-y-auto rounded-lg border bg-muted/40 p-4 text-xs whitespace-pre-wrap">
            {contextPreview}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </Label>
      {children}
    </div>
  )
}

function buildContextPreview(s: CompanySettings): string {
  const services = s.services.length > 0 ? s.services.join(', ') : '(no services selected)'
  const hours = DAYS.map((d) => {
    const v = s.businessHours[d.key] ?? 'closed'
    return `  - ${d.label}: ${v === 'closed' ? 'Closed' : v}`
  }).join('\n')
  return `You are the official WhatsApp AI assistant for ${s.name || '[Company name]'}.
Company website: ${s.website || '[website]'}
About: ${s.description || '[description]'}
Services we offer: ${services}

Business hours:
${hours}

Greeting template: ${s.greetingMsg || '[greeting not set]'}
Closing template: ${s.closingMsg || '[closing not set]'}
Support template: ${s.supportMsg || '[support not set]'}`
}

export default CompanySettingsView
