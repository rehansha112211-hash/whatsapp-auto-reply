'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  Reply,
  Save,
  RotateCcw,
  Eye,
  Loader2,
  Globe,
  Clock,
  Zap,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet, apiPut, ApiError } from '@/lib/api-client'

type LanguagePref = 'auto' | 'en' | 'hi' | 'hinglish'

interface AutoReplySettings {
  enabled: boolean
  replyDelaySec: number
  typingDelaySec: number
  businessHoursOnly: boolean
  greeting: string
  awayMessage: string
  maxReplyLength: number
  languagePref: LanguagePref
}

interface AutoReplyApiResponse {
  enabled: boolean
  replyDelaySec: number
  typingDelaySec: number
  businessHoursOnly: boolean
  greeting: string
  awayMessage: string
  maxReplyLength: number
  languagePref: LanguagePref
}

const DEFAULTS: AutoReplySettings = {
  enabled: true,
  replyDelaySec: 1,
  typingDelaySec: 2,
  businessHoursOnly: false,
  greeting: '',
  awayMessage: '',
  maxReplyLength: 600,
  languagePref: 'auto',
}

export function AutoReplySettingsView() {
  const [settings, setSettings] = React.useState<AutoReplySettings>(DEFAULTS)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<AutoReplyApiResponse>('/api/settings/autoreply')
      setSettings({
        enabled: data.enabled,
        replyDelaySec: data.replyDelaySec,
        typingDelaySec: data.typingDelaySec,
        businessHoursOnly: data.businessHoursOnly,
        greeting: data.greeting,
        awayMessage: data.awayMessage,
        maxReplyLength: data.maxReplyLength,
        languagePref: data.languagePref,
      })
    } catch (err) {
      toast.error('Failed to load auto-reply settings', { description: (err as Error).message })
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
      await apiPut('/api/settings/autoreply', {
        enabled: settings.enabled,
        replyDelaySec: settings.replyDelaySec,
        typingDelaySec: settings.typingDelaySec,
        businessHoursOnly: settings.businessHoursOnly,
        greeting: settings.greeting,
        awayMessage: settings.awayMessage,
        maxReplyLength: settings.maxReplyLength,
        languagePref: settings.languagePref,
      })
      toast.success('Auto-reply settings saved', {
        description: 'Changes affect AI replies immediately.',
      })
      await load()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message
      toast.error('Failed to save auto-reply settings', { description: msg })
    } finally {
      setSaving(false)
    }
  }

  const preview = React.useMemo(() => buildSampleReply(settings), [settings])

  return (
    <div className="space-y-6">
      <Card className="rounded-xl border bg-card/60 backdrop-blur">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Reply className="size-5 text-primary" />
                Auto-Reply Configuration
              </CardTitle>
              <CardDescription>
                Control how the AI responds to incoming WhatsApp messages.
              </CardDescription>
            </div>
            {loading ? null : (
              <Badge
                className={
                  settings.enabled
                    ? 'bg-emerald-600 text-white hover:bg-emerald-600'
                    : 'bg-muted text-muted-foreground hover:bg-muted'
                }
              >
                {settings.enabled ? 'Active' : 'Disabled'}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/20 p-4">
                <div className="space-y-1">
                  <Label className="flex items-center gap-2 text-base font-semibold">
                    <Zap className="size-4 text-primary" />
                    Auto-Reply Enabled
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Master switch for the AI auto-reply pipeline.
                  </p>
                </div>
                <Switch
                  checked={settings.enabled}
                  onCheckedChange={(v) => setSettings({ ...settings, enabled: v })}
                  className="scale-125"
                />
              </div>

              <Separator />

              <div className="grid gap-6 md:grid-cols-2">
                <SliderField
                  label="Reply Delay (seconds)"
                  icon={<Clock className="size-4 text-muted-foreground" />}
                  value={settings.replyDelaySec}
                  min={0}
                  max={10}
                  step={1}
                  onChange={(v) => setSettings({ ...settings, replyDelaySec: v })}
                  hint="Wait time before the AI reply is sent."
                  integer
                />
                <SliderField
                  label="Typing Delay (seconds)"
                  icon={<Clock className="size-4 text-muted-foreground" />}
                  value={settings.typingDelaySec}
                  min={0}
                  max={10}
                  step={1}
                  onChange={(v) => setSettings({ ...settings, typingDelaySec: v })}
                  hint="Simulated typing indicator duration."
                  integer
                />
              </div>

              <div className="space-y-2">
                <SliderField
                  label="Max Reply Length (characters)"
                  icon={null}
                  value={settings.maxReplyLength}
                  min={100}
                  max={1500}
                  step={50}
                  onChange={(v) => setSettings({ ...settings, maxReplyLength: v })}
                  hint="Replies are truncated to fit this length."
                  integer
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 p-3">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Business Hours Only</Label>
                  <p className="text-xs text-muted-foreground">
                    Only auto-reply during the company&apos;s business hours. Outside hours, send the
                    away message instead.
                  </p>
                </div>
                <Switch
                  checked={settings.businessHoursOnly}
                  onCheckedChange={(v) => setSettings({ ...settings, businessHoursOnly: v })}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Globe className="size-4 text-muted-foreground" />
                  Language Preference
                </Label>
                <Select
                  value={settings.languagePref}
                  onValueChange={(v) =>
                    setSettings({ ...settings, languagePref: v as LanguagePref })
                  }
                >
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect (recommended)</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="hi">Hindi (Devanagari)</SelectItem>
                    <SelectItem value="hinglish">Hinglish</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  &ldquo;Auto&rdquo; detects the customer&apos;s language from their message.
                </p>
              </div>

              <Separator />

              <div className="grid gap-4">
                <Field label="Greeting Message" htmlFor="ar-greeting">
                  <Textarea
                    id="ar-greeting"
                    value={settings.greeting}
                    onChange={(e) => setSettings({ ...settings, greeting: e.target.value })}
                    rows={3}
                    placeholder="Hi! 👋 Welcome to QorvixNode Technologies — we build websites, apps & AI automation."
                  />
                </Field>
                <Field label="Away Message" htmlFor="ar-away">
                  <Textarea
                    id="ar-away"
                    value={settings.awayMessage}
                    onChange={(e) => setSettings({ ...settings, awayMessage: e.target.value })}
                    rows={3}
                    placeholder="We're currently away. Leave your requirement and we'll reply during business hours."
                  />
                </Field>
              </div>
            </>
          )}
        </CardContent>

        <CardFooter className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save
          </Button>
          <Button variant="outline" onClick={load} disabled={loading || saving}>
            <RotateCcw className="size-4" />
            Reset
          </Button>
          <p className="ml-auto text-xs text-muted-foreground">
            Changes affect AI replies immediately.
          </p>
        </CardFooter>
      </Card>

      <Card className="rounded-xl border bg-card/60 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="size-4 text-primary" />
            Live Auto-Reply Preview
          </CardTitle>
          <CardDescription>
            Mock sample of how the AI would reply with the current settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Incoming (customer)
            </p>
            <p className="text-sm">
              Hi, I need an e-commerce website for my business. Budget around 25k. What would be the
              cost?
            </p>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Outgoing (AI reply)
            </p>
            <p className="text-sm whitespace-pre-wrap">{preview}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Preview is illustrative only. Actual replies are generated live by the LLM.
          </p>
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

function SliderField({
  label,
  icon,
  value,
  min,
  max,
  step,
  onChange,
  hint,
  integer,
}: {
  label: string
  icon: React.ReactNode
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  hint?: string
  integer?: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {label}
        </Label>
        <span className="font-mono text-xs text-muted-foreground">
          {integer ? value.toFixed(0) : value.toFixed(2)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(vals) => onChange(vals[0] ?? value)}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function buildSampleReply(s: AutoReplySettings): string {
  const greetingLine = s.greeting ? s.greeting.split('\n')[0].slice(0, 120) : 'Hi! 👋'
  const lang =
    s.languagePref === 'auto'
      ? 'English'
      : s.languagePref === 'hi'
        ? 'Hindi'
        : s.languagePref === 'hinglish'
          ? 'Hinglish'
          : 'English'
  const base = `${greetingLine} Thanks for sharing your requirement. An e-commerce website with payment gateway, cart and admin panel typically starts around ₹25k depending on the number of products and features. Reply in ${lang}.`
  if (base.length <= s.maxReplyLength) return base
  return base.slice(0, s.maxReplyLength - 1) + '…'
}

export default AutoReplySettingsView
