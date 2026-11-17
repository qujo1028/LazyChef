import { ImageResponse } from "next/og"

import { LOGO_COLORS, LogoGlyph } from "@/components/logo-glyph"

export const BRAND_GREEN = LOGO_COLORS.green

/** Square app icon. `radius` is a fraction of the size (0 for iOS, which masks it). */
export function renderAppIcon(size: number, radius: number) {
  const glyph = Math.round(size * 0.66)
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // A soft top-left highlight keeps the flat green from looking like a placeholder.
          background: `radial-gradient(circle at 30% 20%, #3f9461 0%, ${LOGO_COLORS.green} 55%, #24633d 100%)`,
          borderRadius: size * radius,
        }}
      >
        <div style={{ display: "flex", marginTop: size * 0.02 }}>
          <LogoGlyph size={glyph} />
        </div>
      </div>
    ),
    { width: size, height: size },
  )
}
