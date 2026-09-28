import { ImageResponse } from "next/og"

export const BRAND_GREEN = "#2f7d4f"

// Lucide "chef-hat" (ISC license), drawn in white on the brand green.
const CHEF_HAT = [
  "M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z",
  "M6 17h12",
]

/** Square app icon. `radius` is a fraction of the size (0 for iOS, which masks it). */
export function renderAppIcon(size: number, radius: number) {
  const glyph = Math.round(size * 0.58)
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND_GREEN,
          borderRadius: size * radius,
        }}
      >
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          {CHEF_HAT.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </div>
    ),
    { width: size, height: size },
  )
}
