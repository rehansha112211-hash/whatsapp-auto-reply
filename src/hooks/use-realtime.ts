'use client'

// ============================================================
// useRealtime — client hook that connects to the war-realtime
// websocket mini-service (port 3003, routed through Caddy via
// the XTransformPort query parameter).
//
// The hook keeps a single shared socket.io connection alive for
// the lifetime of the app and lets each component register/unregister
// event handlers without re-establishing the connection.
// ============================================================
import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

export interface RealtimeEvent {
  event: string
  handler: (payload: unknown) => void
}

// Singleton socket — shared across every hook instance on the page.
let socket: Socket | null = null
let refCount = 0

function getSocket(): Socket {
  if (!socket) {
    socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    })
  }
  return socket
}

export function useRealtime(events: RealtimeEvent[]): { connected: boolean } {
  const [connected, setConnected] = useState<boolean>(false)
  // Always-fresh ref to the events list so the stable socket listeners can
  // invoke the latest handler without us re-subscribing on every render.
  const eventsRef = useRef<RealtimeEvent[]>(events)
  useEffect(() => {
    eventsRef.current = events
  }, [events])

  useEffect(() => {
    const s = getSocket()
    refCount += 1

    // One stable listener per event name; each invocation reads the latest
    // handler from the ref. We track which listeners we created so we can
    // remove only ours on unmount (other hook instances may share the socket).
    const listenerMap = new Map<string, (payload: unknown) => void>()
    const subscribed = new Set<string>()
    for (const ev of events) {
      if (subscribed.has(ev.event)) continue
      subscribed.add(ev.event)
      const listener = (payload: unknown) => {
        const latest = eventsRef.current.find((e) => e.event === ev.event)
        latest?.handler(payload)
      }
      s.on(ev.event, listener)
      listenerMap.set(ev.event, listener)
    }

    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    s.on('connect', onConnect)
    s.on('disconnect', onDisconnect)
    // If the singleton socket was already connected before this hook mounted,
    // sync the local state. (Defer via microtask so we don't call setState
    // synchronously inside the effect body, which trips the linter.)
    if (s.connected) {
      queueMicrotask(() => setConnected(true))
    }

    return () => {
      s.off('connect', onConnect)
      s.off('disconnect', onDisconnect)
      for (const [event, listener] of listenerMap) {
        s.off(event, listener)
      }
      refCount -= 1
      // If no component is using the socket anymore, disconnect to free
      // resources. It will be re-created on next mount if needed.
      if (refCount <= 0 && socket) {
        socket.disconnect()
        socket = null
      }
    }
    // Re-subscribe only when the set of event names changes.
  }, [events.map((e) => e.event).join('|')])

  return { connected }
}
