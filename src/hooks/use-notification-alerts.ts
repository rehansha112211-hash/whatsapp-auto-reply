'use client'

import * as React from 'react'
import { apiGet } from '@/lib/api-client'

// ============================================================
// useNotificationAlerts — plays a sound + shows a desktop
// notification when new high-priority notifications arrive
// (owner requests, hot leads, errors). Also supports enabling/
// disabling sound via the returned controls.
// ============================================================

interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  severity: string
  read: boolean
  createdAt: string
  contactId: string | null
}

const STORAGE_KEY = 'war_notif_seen_ids'
const SOUND_ENABLED_KEY = 'war_notif_sound'
const DESKTOP_ENABLED_KEY = 'war_notif_desktop'

// High-priority notification types that should alert
const ALERT_TYPES = new Set([
  'owner_request',
  'new_lead',
  'ai_error',
  'db_error',
  'wa_disconnected',
])

// Generate a short notification "ding" via the Web Audio API — no asset file needed.
function playDing() {
  try {
    const AudioCtx =
      typeof window !== 'undefined'
        ? (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
        : undefined
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime
    // Two quick ascending tones for a pleasant "ding-ding"
    const tones = [
      { freq: 880, start: 0, dur: 0.12 },
      { freq: 1320, start: 0.1, dur: 0.18 },
    ]
    for (const t of tones) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = t.freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0, now + t.start)
      gain.gain.linearRampToValueAtTime(0.15, now + t.start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + t.start)
      osc.stop(now + t.start + t.dur + 0.05)
    }
    // Close the context after the sound finishes to free resources
    setTimeout(() => ctx.close().catch(() => {}), 500)
  } catch {
    // AudioContext may not be available (e.g. before user interaction)
  }
}

export function useNotificationAlerts(enabled: boolean) {
  const [soundOn, setSoundOn] = React.useState(false)
  const [desktopOn, setDesktopOn] = React.useState(false)
  const seenRef = React.useRef<Set<string>>(new Set())
  const initializedRef = React.useRef(false)

  // Load preferences from localStorage on mount
  React.useEffect(() => {
    try {
      setSoundOn(localStorage.getItem(SOUND_ENABLED_KEY) === 'true')
      setDesktopOn(localStorage.getItem(DESKTOP_ENABLED_KEY) === 'true')
    } catch {
      /* ignore */
    }
  }, [])

  // Persist preferences
  const toggleSound = React.useCallback((on: boolean) => {
    setSoundOn(on)
    try {
      localStorage.setItem(SOUND_ENABLED_KEY, String(on))
    } catch {
      /* ignore */
    }
    if (on) playDing() // preview
  }, [])

  const toggleDesktop = React.useCallback(async (on: boolean) => {
    if (on && 'Notification' in window) {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setDesktopOn(false)
        try {
          localStorage.setItem(DESKTOP_ENABLED_KEY, 'false')
        } catch {
          /* ignore */
        }
        return false
      }
    }
    setDesktopOn(on)
    try {
      localStorage.setItem(DESKTOP_ENABLED_KEY, String(on))
    } catch {
      /* ignore */
    }
    return true
  }, [])

  // Load previously-seen IDs so we don't alert on mount
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const ids = JSON.parse(raw) as string[]
        seenRef.current = new Set(ids.slice(-200)) // keep last 200
      }
    } catch {
      /* ignore */
    }
  }, [])

  const persistSeen = React.useCallback(() => {
    try {
      const arr = Array.from(seenRef.current).slice(-200)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
    } catch {
      /* ignore */
    }
  }, [])

  // Poll for new notifications every 12s
  React.useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const tick = async () => {
      try {
        const data = await apiGet<{ items: NotificationItem[] }>(
          '/api/notifications?limit=15',
        )
        if (cancelled) return
        const items = data.items ?? []

        // On first load, mark all as seen (don't alert for existing notifications)
        if (!initializedRef.current) {
          for (const n of items) seenRef.current.add(n.id)
          initializedRef.current = true
          persistSeen()
          return
        }

        // Find new high-priority unread notifications
        const newAlerts = items.filter(
          (n) =>
            !n.read &&
            !seenRef.current.has(n.id) &&
            ALERT_TYPES.has(n.type),
        )

        if (newAlerts.length > 0) {
          // Play sound
          if (soundOn) playDing()

          // Desktop notification
          if (desktopOn && 'Notification' in window && Notification.permission === 'granted') {
            const top = newAlerts[0]
            const notif = new Notification(top.title, {
              body: top.body.slice(0, 200),
              icon: 'https://z-cdn.chatglm.cn/z-ai/static/logo.svg',
              tag: top.id,
            })
            notif.onclick = () => {
              window.focus()
              notif.close()
            }
          }

          // Mark as seen
          for (const n of newAlerts) seenRef.current.add(n.id)
          persistSeen()
        }

        // Also mark non-alert notifications as seen
        for (const n of items) {
          if (!ALERT_TYPES.has(n.type)) seenRef.current.add(n.id)
        }
      } catch {
        /* ignore */
      }
    }

    tick()
    const t = setInterval(tick, 12000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [enabled, soundOn, desktopOn, persistSeen])

  return {
    soundOn,
    desktopOn,
    toggleSound,
    toggleDesktop,
  }
}
