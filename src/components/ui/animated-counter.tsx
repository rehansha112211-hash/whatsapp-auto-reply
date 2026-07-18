'use client'

import { useEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'

interface AnimatedCounterProps {
  value: number
  duration?: number
  decimals?: number
  suffix?: string
  prefix?: string
  className?: string
}

// easeOutQuart: strong deceleration toward the end — feels premium.
function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4)
}

/**
 * Animates a number from 0 to its target value when it scrolls into view.
 * - SSR-safe: renders the formatted final value on the server so the markup
 *   is correct before hydration, then re-runs the animation on the client.
 * - Uses requestAnimationFrame + easeOutQuart for a smooth 60fps tween.
 * - Formats with Intl.NumberFormat (locale thousands separators).
 */
export function AnimatedCounter({
  value,
  duration = 1.2,
  decimals = 0,
  suffix = '',
  prefix = '',
  className,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const inView = useInView(ref, { once: true, margin: '-50px' })
  const [display, setDisplay] = useState<number>(0)

  // Clamp to a non-negative, finite number so SSR + edge inputs never break.
  const target = Number.isFinite(value) && value > 0 ? value : 0

  useEffect(() => {
    if (!inView) return
    if (target === 0) return
    let raf = 0
    let start: number | null = null
    const step = (ts: number) => {
      if (start === null) start = ts
      const elapsed = (ts - start) / 1000
      const progress = Math.min(1, elapsed / duration)
      const eased = easeOutQuart(progress)
      setDisplay(target * eased)
      if (progress < 1) {
        raf = requestAnimationFrame(step)
      } else {
        setDisplay(target)
      }
    }
    raf = requestAnimationFrame(step)
    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [inView, target, duration])

  const formatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return (
    <span ref={ref} className={className}>
      {prefix}
      {formatter.format(display)}
      {suffix}
    </span>
  )
}
