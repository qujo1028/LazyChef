import path from "node:path"

import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // A package-lock.json in a parent folder would otherwise be mistaken for the root.
  turbopack: { root: path.join(__dirname) },
}

export default nextConfig
