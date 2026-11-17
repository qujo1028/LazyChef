"use client"

import { SparklesIcon } from "lucide-react"
import Link from "next/link"
import { useCallback, useRef, useState, type ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"

/**
 * Apple (guideline 5.1.2) wants people told, and asked, before their data goes to a third-party AI.
 * Every AI feature calls `ensureConsent()` before its first request and renders `dialog`. The answer
 * is remembered on this device per description of what's sent, so agreeing to one feature doesn't
 * cover another that sends different data, and rewording what's sent asks again.
 */
const CONSENT_KEY = "lazychef:ai-consent:v1"

const consentKey = (sends: string) => `${CONSENT_KEY}:${sends}`

function hasStoredConsent(sends: string) {
  try {
    return window.localStorage.getItem(consentKey(sends)) === "yes"
  } catch {
    return false
  }
}

function storeConsent(sends: string) {
  try {
    window.localStorage.setItem(consentKey(sends), "yes")
  } catch {
    // Private mode or blocked storage: they'll be asked again next time.
  }
}

/**
 * `sends`: what this feature sends, in plain words, e.g. "the text you typed" or
 * "the names of the items in your pantry".
 */
export function useAiConsent(sends: string) {
  const [open, setOpen] = useState(false)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const finish = useCallback((ok: boolean) => {
    if (ok) storeConsent(sends)
    setOpen(false)
    resolver.current?.(ok)
    resolver.current = null
  }, [sends])

  /** Resolves true once the person has agreed (right away if they already have). */
  const ensureConsent = useCallback(() => {
    if (hasStoredConsent(sends)) return Promise.resolve(true)
    resolver.current?.(false)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [sends])

  const dialog: ReactNode = (
    <AlertDialog open={open} onOpenChange={(next) => !next && finish(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Use the AI assistant?</AlertDialogTitle>
          <AlertDialogDescription>
            This sends {sends} to Groq, an AI service, to work out the answer. Groq doesn&apos;t get your name, email
            or household. AI answers can be wrong, so check them before you rely on them.{" "}
            <Link href="/privacy" className="underline underline-offset-2">
              Privacy policy
            </Link>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => finish(false)}>Not now</AlertDialogCancel>
          <AlertDialogAction onClick={() => finish(true)}>Use AI</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { ensureConsent, dialog }
}

/** Marks AI-made content so it isn't mistaken for a sourced recipe or a fact. */
export function AiLabel({ children = "AI suggestion" }: { children?: ReactNode }) {
  return (
    <Badge variant="secondary">
      <SparklesIcon data-icon="inline-start" aria-hidden />
      {children}
    </Badge>
  )
}
