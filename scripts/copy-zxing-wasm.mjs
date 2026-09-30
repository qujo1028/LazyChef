// Copies the barcode reader's .wasm into public/, so iPhones (no built-in BarcodeDetector)
// load it from our own site instead of a CDN. The file name carries the version, so a new
// version is never served from an old cache. Runs before `dev` and `build`.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

// The zxing-wasm that barcode-detector itself uses (it may be nested under it).
const fromDetector = createRequire(createRequire(import.meta.url).resolve("barcode-detector/ponyfill"))
let root = dirname(fromDetector.resolve("zxing-wasm/reader"))
const isRoot = (dir) => existsSync(join(dir, "package.json")) && JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).name === "zxing-wasm"
while (!isRoot(root)) root = dirname(root)
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const out = join(process.cwd(), "public", "vendor", "zxing")

mkdirSync(out, { recursive: true })
for (const old of readdirSync(out)) rmSync(join(out, old))
copyFileSync(join(root, "dist", "reader", "zxing_reader.wasm"), join(out, `zxing_reader-${version}.wasm`))
console.log(`zxing-wasm ${version} → public/vendor/zxing/`)
