'use client'

// ============================================================
// Onboarding Tour
// Interactive spotlight walkthrough that guides first-time users
// through the platform's key features. Uses a CSS box-shadow trick
// to punch a "hole" through a dark backdrop over the target element.
// ============================================================
import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  HelpCircle,
  X,
  ChevronRight,
  ChevronLeft,
  Check,
  Sparkles,
  Rocket,
  MessageCircle,
  Search,
  Settings,
  Bell,
  LayoutDashboard,
  QrCode,
  MessagesSquare,
  FlaskConical,
  Bot,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { apiPost } from '@/lib/api-client'
import type { ViewKey } from '@/lib/types'

interface OnboardingTourProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (view: ViewKey) => void
}

interface TourStep {
  id: string
  title: string
  description: string
  /** data-tour attribute of the element to highlight. */
  target?: string
  /** View to navigate to before measuring the target element. */
  navigateTo?: ViewKey
  /** Centered modal-style step (welcome + complete). */
  centered?: boolean
  icon: LucideIcon
  accent: string
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to QorvixNode',
    description:
      "Welcome to QorvixNode WhatsApp Auto Reply! Let's take a quick tour of the key features — it takes less than a minute.",
    centered: true,
    icon: Sparkles,
    accent: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    description:
      'Your real-time overview — WhatsApp status, messages, leads, and AI activity at a glance.',
    target: 'nav-dashboard',
    navigateTo: 'dashboard',
    icon: LayoutDashboard,
    accent: 'from-emerald-500 to-emerald-600',
  },
  {
    id: 'whatsapp',
    title: 'Connect WhatsApp',
    description:
      'Connect your WhatsApp account here via QR code. Session auto-restores on restart.',
    target: 'nav-whatsapp',
    navigateTo: 'whatsapp',
    icon: QrCode,
    accent: 'from-teal-500 to-emerald-600',
  },
  {
    id: 'chats',
    title: 'Live Chats',
    description:
      'View all conversations. AI auto-replies, or take over manually with human mode.',
    target: 'nav-chats',
    navigateTo: 'chats',
    icon: MessagesSquare,
    accent: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'simulator',
    title: 'AI Simulator',
    description:
      'Test the AI auto-reply engine without a real WhatsApp connection — perfect for tuning your prompts.',
    target: 'nav-simulator',
    navigateTo: 'simulator',
    icon: FlaskConical,
    accent: 'from-amber-500 to-emerald-600',
  },
  {
    id: 'quick-search',
    title: 'Quick Search',
    description:
      'Press Cmd+K anytime to search contacts, messages, and jump to any view in the platform.',
    target: 'quick-search',
    icon: Search,
    accent: 'from-sky-500 to-emerald-600',
  },
  {
    id: 'ai-settings',
    title: 'AI Settings',
    description:
      'Configure your AI provider, company profile, and auto-reply rules to fine-tune how the assistant responds.',
    target: 'nav-ai-settings',
    navigateTo: 'ai-settings',
    icon: Bot,
    accent: 'from-violet-500 to-emerald-600',
  },
  {
    id: 'complete',
    title: "You're all set!",
    description:
      "🎉 You're ready to roll. Check out the Simulator to see the AI in action, or connect WhatsApp to go live.",
    centered: true,
    icon: Rocket,
    accent: 'from-emerald-500 to-teal-600',
  },
]

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const EMPTY_RECT: Rect = { top: 0, left: 0, width: 0, height: 0 }

function findTargetEl(selector: string): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLElement>(`[data-tour="${selector}"]`)
}

function measureEl(el: HTMLElement | null): Rect {
  if (!el) return EMPTY_RECT
  const r = el.getBoundingClientRect()
  // Small padding so the spotlight breathes around the element.
  const pad = 6
  return {
    top: r.top - pad,
    left: r.left - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  }
}

/** Choose the side of the target where the tooltip should attach. */
function choosePlacement(rect: Rect, tooltipW: number, tooltipH: number):
  | 'right'
  | 'left'
  | 'bottom'
  | 'top' {
  const margin = 16
  const vw = window.innerWidth
  const vh = window.innerHeight
  const spaceRight = vw - (rect.left + rect.width)
  const spaceLeft = rect.left
  const spaceBottom = vh - (rect.top + rect.height)
  const spaceTop = rect.top
  if (spaceRight >= tooltipW + margin) return 'right'
  if (spaceLeft >= tooltipW + margin) return 'left'
  if (spaceBottom >= tooltipH + margin) return 'bottom'
  if (spaceTop >= tooltipH + margin) return 'top'
  // Fallback — clamp inside viewport.
  return 'bottom'
}

function placementStyle(
  placement: 'right' | 'left' | 'bottom' | 'top',
  rect: Rect,
): React.CSSProperties {
  const gap = 14
  switch (placement) {
    case 'right':
      return { top: rect.top + rect.height / 2, left: rect.left + rect.width + gap, transform: 'translateY(-50%)' }
    case 'left':
      return { top: rect.top + rect.height / 2, left: rect.left - gap, transform: 'translate(-100%, -50%)' }
    case 'top':
      return { top: rect.top - gap, left: rect.left + rect.width / 2, transform: 'translate(-50%, -100%)' }
    case 'bottom':
    default:
      return { top: rect.top + rect.height + gap, left: rect.left + rect.width / 2, transform: 'translate(-50%, 0)' }
  }
}

function clampTooltip(
  style: React.CSSProperties,
  tooltipW: number,
  tooltipH: number,
): React.CSSProperties {
  const margin = 12
  const vw = window.innerWidth
  const vh = window.innerHeight
  // Pull numeric top/left out of the style. They were set as raw pixel numbers above.
  const top = typeof style.top === 'number' ? style.top : 0
  const left = typeof style.left === 'number' ? style.left : 0
  const transform = style.transform as string | undefined
  // Determine adjusted top/left by simulating the transform.
  let adjTop = top
  let adjLeft = left
  if (transform?.includes('translateY(-50%)')) adjTop = top - tooltipH / 2
  if (transform?.includes('translate(-100%')) adjLeft = left - tooltipW
  if (transform?.includes('translate(-50%, -100%)')) {
    adjLeft = left - tooltipW / 2
    adjTop = top - tooltipH
  }
  if (transform?.includes('translate(-50%, 0)')) adjLeft = left - tooltipW / 2

  adjLeft = Math.max(margin, Math.min(adjLeft, vw - tooltipW - margin))
  adjTop = Math.max(margin, Math.min(adjTop, vh - tooltipH - margin))

  return { top: adjTop, left: adjLeft, transform: 'none' }
}

export function OnboardingTour({ open, onOpenChange, onNavigate }: OnboardingTourProps) {
  const [stepIdx, setStepIdx] = React.useState(0)
  const [rect, setRect] = React.useState<Rect>(EMPTY_RECT)
  const [placement, setPlacement] = React.useState<'right' | 'left' | 'bottom' | 'top'>('right')
  const [ready, setReady] = React.useState(false)

  const step = TOUR_STEPS[stepIdx]
  const total = TOUR_STEPS.length

  // Reset to step 0 every time the tour opens.
  React.useEffect(() => {
    if (open) {
      setStepIdx(0)
      setReady(false)
    }
  }, [open])

  // When the step changes, navigate to its view first (if any) so the
  // target element is present in the DOM, then measure it.
  React.useEffect(() => {
    if (!open) return
    let cancelled = false

    const run = async () => {
      const s = TOUR_STEPS[stepIdx]
      if (!s) return
      if (s.navigateTo) {
        onNavigate(s.navigateTo)
      }
      // Wait a tick for the view transition + DOM paint before measuring.
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
      await new Promise((resolve) => setTimeout(resolve, 80))

      if (cancelled) return
      const targetSelector = s.target
      if (targetSelector) {
        const el = findTargetEl(targetSelector)
        if (el) {
          // Make sure the element is actually visible — scroll into view if needed.
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
          await new Promise((resolve) => setTimeout(resolve, 200))
          if (cancelled) return
          const measured = measureEl(el)
          setRect(measured)
          setPlacement(choosePlacement(measured, 320, 240))
        } else {
          setRect(EMPTY_RECT)
        }
      } else {
        setRect(EMPTY_RECT)
      }
      setReady(true)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [open, stepIdx, onNavigate])

  // Recompute rect on window resize / scroll while a step is showing.
  React.useEffect(() => {
    if (!open || !step?.target) return
    const targetSelector = step.target
    const handler = () => {
      const el = findTargetEl(targetSelector)
      if (el) {
        const measured = measureEl(el)
        setRect(measured)
        setPlacement(choosePlacement(measured, 320, 240))
      }
    }
    window.addEventListener('resize', handler)
    window.addEventListener('scroll', handler, true)
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('scroll', handler, true)
    }
  }, [open, step])

  const next = () => {
    if (stepIdx < total - 1) {
      setReady(false)
      setStepIdx((i) => i + 1)
    } else {
      void complete()
    }
  }

  const back = () => {
    if (stepIdx > 0) {
      setReady(false)
      setStepIdx((i) => i - 1)
    }
  }

  const skip = async () => {
    try {
      await apiPost('/api/onboarding', { action: 'skip' })
    } catch {
      /* best-effort */
    }
    onOpenChange(false)
  }

  const complete = async () => {
    try {
      await apiPost('/api/onboarding', { action: 'complete' })
    } catch {
      /* best-effort */
    }
    onOpenChange(false)
  }

  // Keyboard nav: Escape closes, ArrowRight -> Next, ArrowLeft -> Back.
  React.useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        void skip()
      } else if (e.key === 'ArrowRight' && stepIdx < total - 1) {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft' && stepIdx > 0) {
        e.preventDefault()
        back()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, stepIdx, total])

  const isCentered = step?.centered === true
  const tooltipStyle = React.useMemo(() => {
    if (isCentered || !step?.target) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      } as React.CSSProperties
    }
    if (rect.width === 0) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      } as React.CSSProperties
    }
    const base = placementStyle(placement, rect)
    return clampTooltip(base, 320, 240)
  }, [isCentered, step, rect, placement])

  const showBackdrop = isCentered || rect.width === 0

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          aria-modal="true"
          role="dialog"
        >
          {/* Spotlight overlay */}
          {!showBackdrop && ready && (
            <div
              className="pointer-events-auto absolute rounded-lg border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.75)] transition-all duration-200 ease-out"
              style={{
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              }}
            />
          )}
          {showBackdrop && (
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
          )}

          {/* Click-catcher to dismiss clicks outside the spotlight */}
          <button
            type="button"
            aria-label="Skip tour"
            className="absolute inset-0 cursor-default"
            onClick={() => void skip()}
            tabIndex={-1}
          />

          {/* Tooltip card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step?.id}
              initial={{ opacity: 0, x: 12, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -12, scale: 0.97 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className={cn(
                'absolute z-[101] w-80 rounded-xl border bg-card p-5 shadow-2xl',
                'pointer-events-auto',
              )}
              style={tooltipStyle}
            >
              {/* Close button */}
              <button
                type="button"
                aria-label="Close tour"
                onClick={() => void skip()}
                className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>

              {/* Icon + step indicator */}
              <div className="mb-3 flex items-center gap-3">
                {step && (
                  <div
                    className={cn(
                      'grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-lg',
                      step.accent,
                    )}
                  >
                    <step.icon className="h-5 w-5" />
                  </div>
                )}
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Step {stepIdx + 1} of {total}
                  </div>
                  <div className="text-sm font-semibold leading-tight">
                    {step?.title}
                  </div>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-muted-foreground">
                {step?.description}
              </p>

              {/* Buttons */}
              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void skip()}
                  className="text-xs font-medium text-rose-400 transition-colors hover:text-rose-300"
                >
                  Skip tour
                </button>
                <div className="flex items-center gap-2">
                  {stepIdx > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={back}
                      className="gap-1 text-muted-foreground"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Back
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    onClick={next}
                    className="gap-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-teal-700"
                  >
                    {stepIdx === total - 1 ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Done
                      </>
                    ) : stepIdx === 0 ? (
                      <>
                        Start tour
                        <ChevronRight className="h-3.5 w-3.5" />
                      </>
                    ) : (
                      <>
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${((stepIdx + 1) / total) * 100}%` }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Re-export icons that consumers (Help menu, etc.) may want for parity.
export const TOUR_ICONS = {
  HelpCircle,
  Sparkles,
  Rocket,
  MessageCircle,
  Search,
  Settings,
  Bell,
} as const
