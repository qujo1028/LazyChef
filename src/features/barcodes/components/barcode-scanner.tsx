"use client"

import { CameraOff, Flashlight, FlashlightOff, Keyboard, LoaderCircle } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { normalizeBarcode } from "@/lib/barcode/codes"
import { cn } from "@/lib/utils"

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"]
/** How often to look at a frame. Fast enough to feel instant, light on the battery. */
const SCAN_EVERY_MS = 150
/** The same code again within this long is the same carton still in view. */
const REPEAT_AFTER_MS = 2500

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> }
type CameraState = "starting" | "on" | "blocked" | "none" | "unsupported" | "error"

/**
 * The phone's own BarcodeDetector when it reads grocery barcodes (Chrome on Android),
 * otherwise ZXing compiled to WebAssembly (iPhone Safari), loaded only now and from our
 * own site (scripts/copy-zxing-wasm.mjs).
 */
async function createDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: { new (options: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } })
    .BarcodeDetector
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats()
      if (FORMATS.every((format) => supported.includes(format))) return new Native({ formats: FORMATS })
    } catch {
      // Fall through to ZXing.
    }
  }
  const { BarcodeDetector, prepareZXingModule, ZXING_WASM_VERSION } = await import("barcode-detector/ponyfill")
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith(".wasm") ? `/vendor/zxing/zxing_reader-${ZXING_WASM_VERSION}.wasm` : prefix + path,
    },
  })
  return new BarcodeDetector({ formats: FORMATS as never })
}

function cameraMessage(state: CameraState): { title: string; body: string } | null {
  switch (state) {
    case "blocked":
      return {
        title: "Camera blocked",
        body: "Allow camera access for this site in your browser settings (on iPhone: Settings → Safari → Camera), then open the scanner again. You can type codes below meanwhile.",
      }
    case "none":
      return { title: "No camera found", body: "Type the numbers under the barcode below instead." }
    case "unsupported":
      return { title: "This browser can't use the camera here", body: "Type the numbers under the barcode below instead." }
    case "error":
      return { title: "Couldn't start the camera", body: "Close the scanner and try again, or type the code below." }
    default:
      return null
  }
}

function errorState(error: unknown): CameraState {
  const name = error instanceof DOMException ? error.name : ""
  if (name === "NotAllowedError" || name === "SecurityError") return "blocked"
  if (name === "NotFoundError" || name === "OverconstrainedError") return "none"
  return "error"
}

/** The camera view, scanning while it's open. Everything else (what a code means) is the parent's. */
function CameraView({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const onCodeRef = useRef(onCode)
  const [state, setState] = useState<CameraState>("starting")
  const [torch, setTorch] = useState<boolean | null>(null)
  const [flash, setFlash] = useState(0)

  useEffect(() => {
    onCodeRef.current = onCode
  }, [onCode])

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let timer: number | undefined
    const recent = new Map<string, number>()

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unsupported")
        return
      }
      try {
        const [media, detector] = await Promise.all([
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          }),
          createDetector(),
        ])
        stream = media
        if (stopped) return
        const video = videoRef.current
        if (!video) return
        video.srcObject = media
        await video.play().catch(() => {})
        const track = media.getVideoTracks()[0] ?? null
        trackRef.current = track
        const capabilities = (track?.getCapabilities?.() ?? {}) as { torch?: boolean }
        setTorch(capabilities.torch ? false : null)
        setState("on")

        const tick = async () => {
          if (stopped) return
          if (video.readyState >= 2) {
            try {
              for (const { rawValue } of await detector.detect(video)) {
                const code = normalizeBarcode(rawValue)
                if (!code) continue
                const now = Date.now()
                if ((recent.get(code) ?? 0) > now - REPEAT_AFTER_MS) {
                  recent.set(code, now)
                  continue
                }
                recent.set(code, now)
                navigator.vibrate?.(60)
                setFlash((n) => n + 1)
                onCodeRef.current(code)
              }
            } catch {
              // A frame that couldn't be read; try the next one.
            }
          }
          if (!stopped) timer = window.setTimeout(tick, SCAN_EVERY_MS)
        }
        tick()
      } catch (error) {
        if (!stopped) setState(errorState(error))
      }
    }

    start()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      for (const track of stream?.getTracks() ?? []) track.stop()
      trackRef.current = null
    }
  }, [])

  async function toggleTorch() {
    const track = trackRef.current
    if (!track || torch === null) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] })
      setTorch(!torch)
    } catch {
      setTorch(null)
    }
  }

  const message = cameraMessage(state)
  if (message) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed px-5 py-6 text-center" role="alert">
        <CameraOff className="size-7 text-muted-foreground" aria-hidden />
        <p className="font-semibold">{message.title}</p>
        <p className="text-sm text-muted-foreground">{message.body}</p>
      </div>
    )
  }

  return (
    <div className="relative aspect-[4/3] max-h-[34dvh] w-full overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} className="size-full object-cover" playsInline muted aria-label="Camera view for scanning barcodes" />
      {/* Aim here: a wide box, the shape of a barcode. */}
      <div
        key={flash}
        className={cn(
          "pointer-events-none absolute inset-x-[12%] top-1/2 h-[34%] -translate-y-1/2 rounded-xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]",
          flash > 0 && "animate-[pulse_0.4s_ease-out_1] border-emerald-400",
        )}
        aria-hidden
      />
      {state === "starting" ? (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Starting camera…
        </div>
      ) : null}
      {torch !== null ? (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="absolute right-2 bottom-2 rounded-full bg-black/60 text-white hover:bg-black/70"
          onClick={toggleTorch}
          aria-pressed={torch}
          aria-label={torch ? "Turn off the flashlight" : "Turn on the flashlight"}
        >
          {torch ? <FlashlightOff aria-hidden /> : <Flashlight aria-hidden />}
        </Button>
      ) : null}
    </div>
  )
}

/** For smudged barcodes and phones without a camera: the numbers under the bars. */
function TypeCode({ onCode }: { onCode: (code: string) => void }) {
  const id = useId()
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const code = normalizeBarcode(value)
    if (!code) {
      setError("Check the numbers: a grocery barcode has 8, 12 or 13 digits.")
      return
    }
    setError(null)
    setValue("")
    onCode(code)
  }

  return (
    <form onSubmit={submit} className="grid gap-1.5" noValidate>
      <label htmlFor={id} className="inline-flex items-center gap-1.5 text-sm font-medium">
        <Keyboard className="size-4 text-muted-foreground" aria-hidden /> Or type the code
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            if (error) setError(null)
          }}
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="go"
          placeholder="0 41303 00052 6"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-11 text-base"
        />
        <Button type="submit" variant="outline" className="h-11 shrink-0">
          Look up
        </Button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  )
}

/**
 * A full-height sheet with the camera (and a type-the-code box). Calls `onCode` with each
 * new, valid, normalized code; `children` is the parent's list of what was scanned.
 */
export function BarcodeScanner({
  open,
  onOpenChange,
  title,
  description,
  onCode,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  onCode: (code: string) => void
  children?: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto h-[92dvh] w-full max-w-lg data-[vaul-drawer-direction=bottom]:max-h-[92dvh]">
        <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="text-lg">{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        {/* The camera stays put; what was scanned scrolls under it. Mounted only while open,
            so the camera turns off when the sheet closes. */}
        <div className="shrink-0 px-4 pb-3">{open ? <CameraView onCode={onCode} /> : null}</div>
        <div className="grid min-h-0 flex-1 auto-rows-max content-start gap-3 overflow-y-auto px-4 pb-2">
          <TypeCode onCode={onCode} />
          {children}
          <p className="text-center text-xs text-muted-foreground">
            Product info from{" "}
            <a
              href="https://world.openfoodfacts.org"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center underline underline-offset-2"
            >
              Open Food Facts
            </a>
          </p>
        </div>
        <DrawerFooter className="border-t pb-[calc(1rem+env(safe-area-inset-bottom))]">{footer}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
