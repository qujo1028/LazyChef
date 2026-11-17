// Draws the iOS app icon (light, dark, tinted) and launch screen from the same logo the website uses
// (src/lib/app-icon.tsx, src/components/logo-glyph.tsx). Run after changing the logo:
//   node scripts/build-native-images.mjs
import { execFileSync } from "node:child_process"
import { writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { createJiti } from "jiti"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  alias: { "@": path.join(root, "src") },
})

const { ImageResponse } = await jiti.import("next/og")
const React = await jiti.import("react")
const { renderAppIcon } = await jiti.import("@/lib/app-icon")
const { LOGO_COLORS, LogoGlyph } = await jiti.import("@/components/logo-glyph")

const assets = path.join(root, "ios/App/App/Assets.xcassets")
const h = React.createElement

async function save(response, file) {
  await writeFile(path.join(assets, file), Buffer.from(await response.arrayBuffer()))
  console.log("wrote", file)
}

/** The glyph alone, centered on `background` (transparent if omitted). */
function glyphImage(size, glyphSize, { background, ink, knob }) {
  return new ImageResponse(
    h(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...(background ? { background } : {}),
        },
      },
      h("div", { style: { display: "flex", marginTop: size * 0.02 } }, h(LogoGlyph, { size: glyphSize, ink, knob })),
    ),
    { width: size, height: size },
  )
}

/** Launch screen: the rounded app icon on the app's background color. */
function splash(background) {
  const size = 2732
  const icon = 440
  return new ImageResponse(
    h(
      "div",
      { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background } },
      h(
        "div",
        {
          style: {
            width: icon,
            height: icon,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: icon * 0.22,
            background: `radial-gradient(circle at 30% 20%, #3f9461 0%, ${LOGO_COLORS.green} 55%, #24633d 100%)`,
          },
        },
        h("div", { style: { display: "flex", marginTop: icon * 0.02 } }, h(LogoGlyph, { size: Math.round(icon * 0.66) })),
      ),
    ),
    { width: size, height: size },
  )
}

// iOS rounds the corners itself, so the icon is square. App Store Connect also rejects an icon with an
// alpha channel, even a fully opaque one, so flatten it with macOS's sips (via a max-quality JPEG).
await save(renderAppIcon(1024, 0), "AppIcon.appiconset/AppIcon-1024.png")
{
  const icon = path.join(assets, "AppIcon.appiconset/AppIcon-1024.png")
  const flat = path.join(os.tmpdir(), "lazychef-app-icon.jpg")
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "100", icon, "--out", flat], { stdio: "ignore" })
  execFileSync("sips", ["-s", "format", "png", flat, "--out", icon], { stdio: "ignore" })
}
// iOS 18+ dark and tinted home screens: the glyph on a transparent background.
await save(glyphImage(1024, 676, { ink: "#6cc48c", knob: LOGO_COLORS.tomato }), "AppIcon.appiconset/AppIcon-1024-dark.png")
await save(glyphImage(1024, 676, { ink: "#ffffff", knob: "#bdbdbd" }), "AppIcon.appiconset/AppIcon-1024-tinted.png")
// Same colors as --background in globals.css and native/www/offline.html.
await save(splash("#fbf8f1"), "Splash.imageset/splash-light.png")
await save(splash("#1a1714"), "Splash.imageset/splash-dark.png")
