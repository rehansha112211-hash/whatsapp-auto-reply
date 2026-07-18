'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  UserCog,
  Save,
  RotateCcw,
  Bell,
  ShieldAlert,
  Loader2,
  Flame,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet, apiPut, apiPost, ApiError } from '@/lib/api-client'

interface OwnerSettings {
  name: string
  phoneNumber: string
  availability: 'available' | 'busy' | 'away'
  businessHours: string
  humanTakeover: boolean
  leadNotify: boolean
  autoNotify: boolean
  leadThreshold: number
}

interface OwnerApiResponse {
  name: string
  phoneNumber: string
  availability: 'available' | 'busy' | 'away'
  businessHours: string
  humanTakeover: boolean
  leadNotify: boolean
  autoNotify: boolean
  leadThreshold: number
}

const DEFAULTS: OwnerSettings = {
  name: '',
  phoneNumber: '',
  availability: 'available',
  businessHours: 'Mon-Sat 09:00-19:00 IST',
  humanTakeover: true,
  leadNotify: true,
  autoNotify: true,
  leadThreshold: 70,
}

export function OwnerSettingsView() {
  const [settings, setSettings] = React.useState<OwnerSettings>(DEFAULTS)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [notifying, setNotifying] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<OwnerApiResponse>('/api/settings/owner')
      setSettings({
        name: data.name,
        phoneNumber: data.phoneNumber,
        availability: data.availability,
        businessHours: data.businessHours,
        humanTakeover: data.humanTakeover,
        leadNotify: data.leadNotify,
        autoNotify: data.autoNotify,
        leadThreshold: data.leadThreshold,
      })
    } catch (err) {
      // 401 is handled globally by the API client (redirect to login)
      if (err instanceof ApiError && err.status === 401) return
      toast.error('Failed to load owner settings', { description: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiPut('/api/settings/owner', {
        name: settings.name,
        phoneNumber: settings.phoneNumber,
        availability: settings.availability,
        businessHours: settings.businessHours,
        humanTakeover: settings.humanTakeover,
        leadNotify: settings.leadNotify,
        autoNotify: settings.autoNotify,
        leadThreshold: settings.leadThreshold,
      })
      toast.success('Owner settings saved', {
        description: 'Security log entry created.',
      })
      await load()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message
      toast.error('Failed to save owner settings', { description: msg })
    } finally {
      setSaving(false)
    }
  }

  const handleTestNotify = async () => {
    setNotifying(true)
    try {
      await apiPost('/api/settings/owner/test-notify')
      toast.success('Test notification sent', {
        description: 'A test owner notification has been created.',
      })
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message
      toast.error('Failed to send test notification', { description: msg })
    } finally {
      setNotifying(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-xl border border-amber-500/40 bg-amber-500/5 backdrop-blur card-hover">
        <CardContent className="flex items-start gap-3 py-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-amber-700 dark:text-amber-400">
              Privacy notice
            </p>
            <p className="text-muted-foreground">
              The owner&apos;s phone number is never automatically shared with customers. It is only
              used for internal owner notifications (lead alerts, takeover requests).
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border bg-card/60 backdrop-blur card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserCog className="size-5 text-primary" />
            Owner Profile
          </CardTitle>
          <CardDescription>
            Owner identity, availability and notification preferences.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Owner Name" htmlFor="owner-name">
                  <Input
                    id="owner-name"
                    value={settings.name}
                    onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                    placeholder="QorvixNode Owner"
                  />
                </Field>
                <Field label="Owner WhatsApp Number" htmlFor="owner-phone">
                  <Input
                    id="owner-phone"
                    value={settings.phoneNumber}
                    onChange={(e) => setSettings({ ...settings, phoneNumber: e.target.value })}
                    placeholder="+91 90000 00000"
                  />
                  <p className="text-xs text-muted-foreground">
                    Never shared with customers automatically.
                  </p>
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Availability" htmlFor="owner-availability">
                  <Select
                    value={settings.availability}
                    onValueChange={(v) =>
                      setSettings({
                        ...settings,
                        availability: v as OwnerSettings['availability'],
                      })
                    }
                  >
                    <SelectTrigger id="owner-availability" className="w-full">
                      <SelectValue placeholder="Select availability" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="busy">Busy</SelectItem>
                      <SelectItem value="away">Away</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Business Hours" htmlFor="owner-hours">
                  <Textarea
                    id="owner-hours"
                    value={settings.businessHours}
                    onChange={(e) => setSettings({ ...settings, businessHours: e.target.value })}
                    rows={2}
                    placeholder="Mon-Sat 09:00-19:00 IST"
                  />
                </Field>
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-3">
                <SwitchRow
                  label="Human Takeover"
                  description="Allow switching a chat from AI to owner manually."
                  checked={settings.humanTakeover}
                  onChange={(v) => setSettings({ ...settings, humanTakeover: v })}
                />
                <SwitchRow
                  label="Lead Notification"
                  description="Notify the owner when a contact crosses the lead threshold."
                  checked={settings.leadNotify}
                  onChange={(v) => setSettings({ ...settings, leadNotify: v })}
                />
                <SwitchRow
                  label="Auto Notify"
                  description="Auto-forward owner-request messages to the owner."
                  checked={settings.autoNotify}
                  onChange={(v) => setSettings({ ...settings, autoNotify: v })}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Flame className="size-4 text-orange-500" />
                    Hot Lead Threshold
                  </Label>
                  <span className="font-mono text-sm text-muted-foreground">
                    {settings.leadThreshold}
                  </span>
                </div>
                <Slider
                  value={[settings.leadThreshold]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(vals) =>
                    setSettings({ ...settings, leadThreshold: vals[0] ?? settings.leadThreshold })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Contacts scoring at or above this value trigger a hot-lead notification.
                </p>
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
          <Button
            variant="secondary"
            onClick={handleTestNotify}
            disabled={loading || notifying || saving}
            className="ml-auto"
          >
            {notifying ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}
            Test Notification
          </Button>
        </CardFooter>
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

function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 p-3">
      <div className="space-y-1">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

export default OwnerSettingsView
