"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { callAction } from "@/lib/call-action"

import { lookupBarcode } from "../actions"
import type { LookupResult, ScanHit } from "../types"

export type ScanRow =
  | { key: number; code: string; status: "looking" }
  | { key: number; code: string; status: "found"; hit: ScanHit }
  | { key: number; code: string; status: "missing" }
  | { key: number; code: string; status: "error"; message: string }

/**
 * The scan list: one row per scan (two cartons of eggs are two rows), each looked up once
 * per code while the sheet is open.
 */
export function useBarcodeLookups({ onFound }: { onFound?: (key: number, hit: ScanHit) => void } = {}) {
  const [rows, setRows] = useState<ScanRow[]>([])
  const onFoundRef = useRef(onFound)
  useEffect(() => {
    onFoundRef.current = onFound
  }, [onFound])
  const nextKey = useRef(0)
  const answers = useRef(new Map<string, Promise<LookupResult | { error: string }>>())

  const update = useCallback((key: number, row: ScanRow) => {
    setRows((current) => current.map((r) => (r.key === key ? row : r)))
  }, [])

  const lookup = useCallback(
    async (key: number, code: string) => {
      let answer = answers.current.get(code)
      if (!answer) {
        answer = callAction(() => lookupBarcode(code)).then((result) => (result.error !== undefined ? { error: result.error } : result))
        answers.current.set(code, answer)
      }
      const result = await answer
      if ("error" in result && result.error !== undefined) {
        answers.current.delete(code) // try again next time
        update(key, { key, code, status: "error", message: result.error })
      } else if ("found" in result && result.found) {
        update(key, { key, code, status: "found", hit: result.hit })
        onFoundRef.current?.(key, result.hit)
      } else update(key, { key, code, status: "missing" })
    },
    [update],
  )

  /** Adds a row for a new scan and looks it up. Returns the row's key. */
  const scan = useCallback(
    (code: string) => {
      const key = (nextKey.current += 1)
      setRows((current) => [{ key, code, status: "looking" }, ...current])
      void lookup(key, code)
      return key
    },
    [lookup],
  )

  const retry = useCallback(
    (key: number, code: string) => {
      update(key, { key, code, status: "looking" })
      void lookup(key, code)
    },
    [lookup, update],
  )

  /** A code the database didn't know, named by hand. */
  const name = useCallback(
    (key: number, code: string, typed: string) => {
      const clean = typed.replace(/[,;•]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 80)
      if (!clean) return
      const hit: ScanHit = { code, source: "household", name: clean, quantity: null, unit: "count", label: clean, line: clean }
      update(key, { key, code, status: "found", hit })
      onFoundRef.current?.(key, hit)
    },
    [update],
  )

  const remove = useCallback((key: number) => setRows((current) => current.filter((r) => r.key !== key)), [])
  const clear = useCallback(() => setRows([]), [])

  return { rows, setRows, scan, retry, name, remove, clear }
}
