'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface PageTransitionProps {
  children: ReactNode
  viewKey: string
}

/**
 * PageTransition — animates view changes with a fade + slight slide-up on
 * enter and a quick fade on exit. Use inside <AnimatePresence mode="wait">
 * keyed by `viewKey` so it re-animates whenever the active view changes.
 */
export function PageTransition({ children, viewKey }: PageTransitionProps) {
  return (
    <motion.div
      key={viewKey}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}
