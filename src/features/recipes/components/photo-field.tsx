"use client"

import { Camera, ImagePlus, LoaderCircle, X } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

import { fitWithin, MAX_PHOTO_BYTES, photoPathFor } from "../own-recipe"

/** Longest side after resizing. Plenty for a phone screen, a fraction of a camera photo's size. */
const MAX_SIDE = 1600

async function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Shrinks a photo to MAX_SIDE and re-encodes it (WebP, or JPEG where the browser can't
 * write WebP). Also drops the camera's EXIF data (location included), since only pixels
 * are copied. Throws when the file isn't an image the browser can read.
 */
export async function resizePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_SIDE)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context || width === 0) throw new Error("Couldn't read that photo.")
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  for (const quality of [0.82, 0.7, 0.55]) {
    let blob = await encode(canvas, "image/webp", quality)
    if (!blob || blob.type !== "image/webp") blob = await encode(canvas, "image/jpeg", quality)
    if (blob && blob.size <= MAX_PHOTO_BYTES) return blob
  }
  throw new Error("That photo is too big, even after shrinking it.")
}

/**
 * A recipe photo: pick or take one, and it's shrunk and uploaded straight into the
 * household's folder in Storage (members only). The form saves just its path.
 */
export function PhotoField({
  householdId,
  path,
  previewUrl,
  onChange,
  disabled,
  error,
}: {
  householdId: string
  path: string | null
  /** What to show for the current photo (a signed link, or the picked file). */
  previewUrl: string | null
  onChange: (next: { path: string | null; previewUrl: string | null }) => void
  disabled?: boolean
  error?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function upload(file: File) {
    setProblem(null)
    if (!file.type.startsWith("image/")) {
      setProblem("Pick a photo (JPEG, PNG, WebP or HEIC).")
      return
    }
    setUploading(true)
    try {
      const blob = await resizePhoto(file)
      const extension = blob.type === "image/webp" ? "webp" : "jpg"
      const next = photoPathFor(householdId, crypto.randomUUID(), extension)
      const { error: uploadError } = await createClient()
        .storage.from("recipe-photos")
        .upload(next, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false })
      if (uploadError) throw new Error(uploadError.message)
      onChange({ path: next, previewUrl: URL.createObjectURL(blob) })
    } catch (err) {
      console.error("Uploading the photo failed:", err)
      setProblem(err instanceof Error && /too big|read/.test(err.message) ? err.message : "Couldn't upload that photo. Try another one.")
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ""
    }
  }

  const message = problem ?? error
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">Photo</span>
      <div className={cn("relative overflow-hidden rounded-2xl border bg-muted", previewUrl ? "aspect-[4/3]" : "")}>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="The recipe's photo" className="size-full object-cover" />
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={disabled || uploading}
            className="flex min-h-32 w-full flex-col items-center justify-center gap-2 p-4 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {uploading ? <LoaderCircle className="size-6 animate-spin" aria-hidden /> : <ImagePlus className="size-6" aria-hidden />}
            {uploading ? "Uploading…" : "Add a photo (optional)"}
          </button>
        )}
        {previewUrl ? (
          <div className="absolute right-2 bottom-2 flex gap-2">
            <Button type="button" variant="secondary" size="sm" className="h-11" onClick={() => input.current?.click()} disabled={disabled || uploading}>
              {uploading ? <LoaderCircle className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
              {uploading ? "Uploading…" : "Change"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Remove photo"
              onClick={() => onChange({ path: null, previewUrl: null })}
              disabled={disabled || uploading || !path}
            >
              <X aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
        }}
      />
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Shrunk before uploading. Only your household can see it.</p>
      )}
    </div>
  )
}
