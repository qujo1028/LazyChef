// Runs `npm audit --omit=dev` and fails on high or critical advisories, except the ones listed below.
// npm can't audit one workspace on its own, so the Expo app's build tooling shows up here too.
// Every exception needs a reason and should be removed once a fixed version exists.
import { execFileSync } from "node:child_process"

const ALLOWED = {
  // picomatch ReDoS: every version is affected and there is no fix yet. It only reaches the
  // tree through Expo and React Native build tools (config plugins, Metro), not the web app.
  "GHSA-fc5q-39xc-vjpf": "picomatch via Expo build tooling, no fixed version (2026-11-18)",
}

let raw
try {
  raw = execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
} catch (error) {
  raw = error.stdout // npm audit exits non-zero when it finds anything
}
const report = JSON.parse(raw)

const blocking = []
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via !== "object") continue // "depends on another vulnerable package"
    if (via.severity !== "high" && via.severity !== "critical") continue
    const id = via.url?.split("/").pop()
    if (id && ALLOWED[id]) continue
    blocking.push(`${via.severity}: ${via.name} ${via.range} ${via.title} ${via.url}`)
  }
}

for (const [id, reason] of Object.entries(ALLOWED)) console.log(`allowed ${id}: ${reason}`)
if (blocking.length > 0) {
  console.error([...new Set(blocking)].join("\n"))
  process.exit(1)
}
console.log("No blocking high or critical advisories.")
