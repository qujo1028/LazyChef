"use client"

import { CookingPot, Flame } from "lucide-react"
import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"

import type { RewardState } from "../use-reward"

const RING_RADIUS = 34
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

/** The visual half of a reward: a ring that fills and a flame that lights, plus confetti for milestones. */
export function RewardBurst({ state, label }: { state: RewardState; label: string }) {
  if (state.kind === null) return null
  return (
    <div className="flex justify-center py-1" role="img" aria-label={label}>
      <div className="relative size-20">
        <svg viewBox="0 0 80 80" className="size-20 -rotate-90" aria-hidden>
          <circle cx="40" cy="40" r={RING_RADIUS} fill="none" strokeWidth="6" className="stroke-muted" />
          <circle
            key={state.run}
            cx="40"
            cy="40"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            className="stroke-primary"
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={state.ring ? 0 : RING_LENGTH}
            style={{ transition: state.reducedMotion ? "none" : "stroke-dashoffset 520ms cubic-bezier(0.22, 1, 0.36, 1)" }}
          />
        </svg>
        <CookingPot className="absolute inset-0 m-auto size-7 text-primary" aria-hidden />
        <span
          className={cn(
            "absolute -top-1 -right-1 inline-flex size-8 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400",
            state.flame ? (state.reducedMotion ? "opacity-100" : "reward-flame") : "opacity-0",
          )}
          aria-hidden
        >
          <Flame className="size-5 fill-current" />
        </span>
      </div>
      {state.confetti ? <Confetti key={state.run} /> : null}
    </div>
  )
}

const COLORS = ["#f97316", "#facc15", "#34d399", "#60a5fa", "#f472b6", "#a78bfa"]
const PARTICLES = 56
const DURATION_MS = 1500

/** A tiny canvas burst from the middle of the screen: a few dozen rectangles, no dependency. */
function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = window.innerWidth
    const height = window.innerHeight
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const originX = width / 2
    const originY = height * 0.55
    const pieces = Array.from({ length: PARTICLES }, (_, i) => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1
      const speed = 5 + Math.random() * 7
      return {
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 5,
        spin: Math.random() * Math.PI,
        vspin: (Math.random() - 0.5) * 0.4,
        color: COLORS[i % COLORS.length],
      }
    })

    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = now - start
      ctx.clearRect(0, 0, width, height)
      const fade = Math.max(0, 1 - Math.max(0, t - DURATION_MS * 0.6) / (DURATION_MS * 0.4))
      ctx.globalAlpha = fade
      for (const p of pieces) {
        p.vy += 0.28
        p.vx *= 0.992
        p.x += p.vx
        p.y += p.vy
        p.spin += p.vspin
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.spin)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }
      if (t < DURATION_MS) frame = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, width, height)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // Portaled out: the drawer has a transform, which would position and clip a fixed child.
  return createPortal(
    <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[100] size-full" />,
    document.body,
  )
}
