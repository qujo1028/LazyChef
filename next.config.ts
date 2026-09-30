import path from "node:path"

import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // A package-lock.json in a parent folder would otherwise be mistaken for the root.
  turbopack: { root: path.join(__dirname) },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nothing in the app is meant to be embedded; blocks clickjacking.
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        // The barcode reader's .wasm: its file name carries the version, so it never changes.
        source: "/vendor/zxing/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ]
  },
}

export default nextConfig
