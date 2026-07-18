'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  Bot,
  Save,
  RotateCcw,
  Plug,
  Eye,
  EyeOff,
  Check,
  AlertTriangle,
  Clock,
  Sparkles,
  Loader2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet, apiPut, apiPost, ApiError } from '@/lib/api-client'

interface AiSettings {
  provider: string
  baseUrl: string
  apiKey: string
  apiKeyMasked: string
  model: string
  temperature: number
  topP: number
  maxTokens: number
  systemPrompt: string
  status: 'ok' | 'error' | 'untested'
  lastTestedAt: string | null
}

interface TestResult {
  ok: boolean
  latencyMs: number
  model: string
  sample: string
  error?: string
}

const PROVIDER_PRESETS: { label: string; provider: string; baseUrl: string; model: string }[] = [
  { label: 'Z.AI', provider: 'zai', baseUrl: 'https://api.z.ai/api/paas/v4', model: 'glm-4.5' },
  { label: 'OpenAI', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'Groq', provider: 'groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { label: 'Together', provider: 'together', baseUrl: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3-70b-chat-hf' },
  { label: 'OpenRouter', provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto' },
]

const DEFAULT_SETTINGS: AiSettings = {
  provider: 'zai',
  baseUrl: 'https://api.z.ai/api/paas/v4',
  apiKey: '',
  apiKeyMasked: '',
  model: 'glm-4.5',
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 512,
  systemPrompt: '',
  status: 'untested',
  lastTestedAt: null,
}

export function AISettingsView() {
  const [settings, setSettings] = React.useState<AiSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [showKey, setShowKey] = React.useState(false)
  const [apiKeyInput, setApiKeyInput] = React.useState('')
  const [testResult, setTestResult] = React.useState<TestResult | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<AiSettings>('/api/settings/ai')
      setSettings(data)
      setApiKeyInput(data.apiKeyMasked ?? '')
    } catch (err) {
      toast.error('Failed to load AI settings', { description: (err as Error).message })
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
      await apiPut('/api/settings/ai', {
        provider: settings.provider,
        baseUrl: settings.baseUrl,
        apiKey: apiKeyInput,
        model: settings.model,
        temperature: settings.temperature,
        topP: settings.topP,
        maxTokens: settings.maxTokens,
        systemPrompt: settings.systemPrompt,
      })
      toast.success('AI settings saved', {
        description: 'Connection status reset to untested.',
      })
      await load()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message
      toast.error('Failed to save AI settings', { description: msg })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const result = await apiPost<TestResult>('/api/settings/ai/test')
      setTestResult(result)
      if (result.ok) {
        toast.success('AI connection successful', {
          description: `${result.latencyMs}ms · ${result.model}`,
        })
      } else {
        toast.error('AI connection failed', {
          description: result.error ?? 'Unknown error',
        })
      }
      await load()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message
      toast.error('Test request failed', { description: msg })
    } finally {
      setTesting(false)
    }
  }

  const applyPreset = (preset: (typeof PROVIDER_PRESETS)[number]) => {
    setSettings((s) => ({
      ...s,
      provider: preset.provider,
      baseUrl: preset.baseUrl,
      model: preset.model,
    }))
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-xl border bg-card/60 backdrop-blur">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bot className="size-5 text-primary" />
                AI Engine Settings
              </CardTitle>
              <CardDescription>
                Configure the LLM provider that powers WhatsApp auto-replies.
              </CardDescription>
            </div>
            <StatusBadge status={settings.status} lastTestedAt={settings.lastTestedAt} />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Provider quick-pick
                </Label>
                <div className="flex flex-wrap gap-2">
                  {PROVIDER_PRESETS.map((p) => {
                    const active = settings.provider === p.provider
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => applyPreset(p)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background hover:bg-accent'
                        }`}
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Provider" htmlFor="ai-provider">
                  <Input
                    id="ai-provider"
                    value={settings.provider}
                    onChange={(e) => setSettings({ ...settings, provider: e.target.value })}
                    placeholder="zai"
                  />
                </Field>
                <Field label="Model" htmlFor="ai-model">
                  <Input
                    id="ai-model"
                    value={settings.model}
                    onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                    placeholder="glm-4.5"
                  />
                </Field>
              </div>

              <Field label="Base URL" htmlFor="ai-baseurl">
                <Input
                  id="ai-baseurl"
                  value={settings.baseUrl}
                  onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                />
              </Field>

              <Field label="API Key" htmlFor="ai-apikey">
                <div className="relative">
                  <Input
                    id="ai-apikey"
                    type={showKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={settings.apiKeyMasked || 'Enter API key'}
                    className="pr-10 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The API key is encrypted at rest and never shared. Only the last 4 characters are
                  shown (&ldquo;{settings.apiKeyMasked || '—'}&rdquo;). Leave as-is to keep the
                  stored key.
                </p>
              </Field>

              <Separator />

              <div className="grid gap-6 md:grid-cols-3">
                <SliderField
                  label="Temperature"
                  value={settings.temperature}
                  min={0}
                  max={2}
                  step={0.1}
                  onChange={(v) => setSettings({ ...settings, temperature: v })}
                  hint="Creativity vs determinism"
                />
                <SliderField
                  label="Top P"
                  value={settings.topP}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => setSettings({ ...settings, topP: v })}
                  hint="Nucleus sampling cutoff"
                />
                <SliderField
                  label="Max Tokens"
                  value={settings.maxTokens}
                  min={64}
                  max={2048}
                  step={64}
                  onChange={(v) => setSettings({ ...settings, maxTokens: v })}
                  hint="Maximum reply length"
                  integer
                />
              </div>

              <Separator />

              <Field label="System Prompt" htmlFor="ai-prompt">
                <Textarea
                  id="ai-prompt"
                  value={settings.systemPrompt}
                  onChange={(e) => setSettings({ ...settings, systemPrompt: e.target.value })}
                  rows={6}
                  className="font-mono text-xs"
                  placeholder="You are the official WhatsApp AI assistant for QorvixNode Technologies..."
                />
                <p className="text-xs text-muted-foreground">
                  Appended to the auto-generated prompt. Keep it concise — context is added
                  dynamically.
                </p>
              </Field>
            </>
          )}
        </CardContent>

        <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={loading || saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save
            </Button>
            <Button variant="outline" onClick={load} disabled={loading || saving}>
              <RotateCcw className="size-4" />
              Reset
            </Button>
          </div>
          <Button variant="secondary" onClick={handleTest} disabled={loading || testing || saving}>
            {testing ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
            Test Connection
          </Button>
        </CardFooter>
      </Card>

      {testResult && (
        <Card className="rounded-xl border bg-card/60 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" />
              Connection Test Result
            </CardTitle>
            <CardDescription>
              Last test ran at {new Date().toLocaleTimeString()}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <ResultStat label="Status">
                {testResult.ok ? (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                    <Check className="size-3" /> OK
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <AlertTriangle className="size-3" /> Error
                  </Badge>
                )}
              </ResultStat>
              <ResultStat label="Latency">
                <span className="font-mono text-sm">{testResult.latencyMs} ms</span>
              </ResultStat>
              <ResultStat label="Model">
                <span className="font-mono text-sm">{testResult.model}</span>
              </ResultStat>
            </div>
            {testResult.ok ? (
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Sample response
                </Label>
                <pre className="rounded-lg border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                  {testResult.sample || '(empty response)'}
                </pre>
              </div>
            ) : (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {testResult.error ?? 'Unknown error'}
              </div>
            )}
          </CardContent>
        </Card>
      )}
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
  value,
  min,
  max,
  step,
  onChange,
  hint,
  integer,
}: {
  label: string
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
        <Label className="text-sm font-medium">{label}</Label>
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

function ResultStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-lg border bg-muted/30 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function StatusBadge({
  status,
  lastTestedAt,
}: {
  status: 'ok' | 'error' | 'untested'
  lastTestedAt: string | null
}) {
  if (status === 'ok') {
    return (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
        <Check className="size-3" /> Connected
      </Badge>
    )
  }
  if (status === 'error') {
    return (
      <Badge variant="destructive">
        <AlertTriangle className="size-3" /> Error
      </Badge>
    )
  }
  return (
    <Badge variant="secondary">
      <Clock className="size-3" /> Untested
      {lastTestedAt && (
        <span className="ml-1 text-[10px] opacity-70">
          {new Date(lastTestedAt).toLocaleString()}
        </span>
      )}
    </Badge>
  )
}

export default AISettingsView
