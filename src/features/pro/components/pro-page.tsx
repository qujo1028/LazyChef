"use client"

import { useRouter } from "next/navigation"

import { Paywall } from "./paywall"
import { usePro } from "./pro-provider"

/** /pro: the paywall on its own page, using the status the tab layout already loaded. */
export function ProPage() {
  const router = useRouter()
  const { status, userId } = usePro()
  return <Paywall status={status} userId={userId} onDone={() => router.push("/pantry")} />
}
