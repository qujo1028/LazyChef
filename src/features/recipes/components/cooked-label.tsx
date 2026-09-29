"use client"

import { useViewerTime } from "@/lib/use-viewer-time"

import { historyLabel, type CookHistory } from "../saved"

/** "Cooked 3 times · last Sep 12", in the viewer's time zone. */
export function CookedLabel({ history, serverNow }: { history: CookHistory; serverNow: number }) {
  const { now, timeZone } = useViewerTime(serverNow)
  return <>{historyLabel(history, now, timeZone)}</>
}
