"use client"

import { useTheme } from "next-themes"
import { toast, Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, CookingPotIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

const BANNER_MS = 4000

/**
 * A drop-down banner from the top (the Toaster sits top-center and below the safe area). Tap to
 * dismiss; closes itself after about four seconds.
 */
function showBanner({
  title,
  body,
  tone = "info",
  icon,
}: {
  title: string
  body?: string
  tone?: "info" | "cook" | "success" | "warning"
  icon?: React.ReactNode
}) {
  return toast.custom(
    (id) => (
      <button
        type="button"
        onClick={() => toast.dismiss(id)}
        className={cn(
          "flex min-h-14 w-full max-w-[min(92vw,24rem)] items-center gap-3 rounded-2xl border bg-popover px-4 py-3 text-left text-popover-foreground shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          tone === "cook" && "border-primary/30",
        )}
      >
        <span
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
            tone === "warning" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" : "bg-primary/10 text-primary",
          )}
          aria-hidden
        >
          {icon ?? (tone === "cook" ? <CookingPotIcon className="size-5" /> : <InfoIcon className="size-5" />)}
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-sm font-semibold">{title}</span>
          {body ? <span className="text-sm text-muted-foreground">{body}</span> : null}
        </span>
      </button>
    ),
    { duration: BANNER_MS, unstyled: true },
  )
}

export { showBanner }
