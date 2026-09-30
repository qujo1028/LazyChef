// Lets Node scripts import the app's TypeScript modules directly (Node 22.18+ strips the
// types): "@/…" resolves to src/…, and extensionless imports try .ts, .tsx and /index.ts,
// the way the bundler does.
import { existsSync, statSync } from "node:fs"
import { registerHooks } from "node:module"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src")

function candidates(file) {
  return [file, `${file}.ts`, `${file}.tsx`, path.join(file, "index.ts")]
}

function isFile(file) {
  return existsSync(file) && statSync(file).isFile()
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base = null
    if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2))
    else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier)
    }
    if (base) {
      const found = candidates(base).find(isFile)
      if (found) return nextResolve(pathToFileURL(found).href, context)
    }
    return nextResolve(specifier, context)
  },
})

// The helpers are .ts files in a package without "type": "module"; Node warns once per file.
process.removeAllListeners("warning")
process.on("warning", (warning) => {
  if (warning.code !== "MODULE_TYPELESS_PACKAGE_JSON" && warning.name !== "ExperimentalWarning") console.warn(warning)
})
