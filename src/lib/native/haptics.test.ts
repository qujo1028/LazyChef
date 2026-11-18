import { describe, expect, it, vi } from "vitest"

import { fireHaptic, WEB_PATTERNS, type HapticDeps } from "./haptics"

function deps(over: Partial<HapticDeps> = {}): HapticDeps {
  return { server: false, reducedMotion: false, enabled: true, native: null, vibrate: null, ...over }
}

describe("fireHaptic", () => {
  it("uses the native plugin when there is one", () => {
    const native = vi.fn()
    const vibrate = vi.fn()
    expect(fireHaptic("success", deps({ native, vibrate }))).toBe("native")
    expect(native).toHaveBeenCalledWith("success")
    expect(vibrate).not.toHaveBeenCalled()
  })

  it("falls back to vibrate with the kind's pattern", () => {
    const vibrate = vi.fn()
    expect(fireHaptic("milestone", deps({ vibrate }))).toBe("web")
    expect(vibrate).toHaveBeenCalledWith(WEB_PATTERNS.milestone)
  })

  it("does nothing when neither exists (iOS Safari)", () => {
    expect(fireHaptic("tap", deps())).toBe("skipped")
  })

  it("is gated by the setting, reduced motion and the server", () => {
    const native = vi.fn()
    const vibrate = vi.fn()
    for (const over of [{ enabled: false }, { reducedMotion: true }, { server: true }]) {
      expect(fireHaptic("tap", deps({ ...over, native, vibrate }))).toBe("skipped")
    }
    expect(native).not.toHaveBeenCalled()
    expect(vibrate).not.toHaveBeenCalled()
  })

  it("swallows errors from either path", () => {
    const boom = () => {
      throw new Error("nope")
    }
    expect(fireHaptic("tap", deps({ native: boom }))).toBe("skipped")
    expect(fireHaptic("tap", deps({ vibrate: boom }))).toBe("skipped")
  })
})
