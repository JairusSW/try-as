import { Parser } from "assemblyscript/dist/assemblyscript.js";
import { Transform } from "assemblyscript/dist/transform.js";
import { SourceLinker } from "./passes/source.js";
import { Globals } from "./globals/globals.js";
import { removeExtension } from "./utils.js";
import { toString } from "./lib/util.js";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import { ThrowReplacer } from "./passes/replacer.js";
import { StdlibThrowRewriter } from "./passes/stdlib.js";

// Resolve a specifier from the consumer's project root. Uses Node's
// `createRequire` so it walks node_modules properly (handles npm, yarn,
// pnpm hoisting and symlinked installs without --preserve-symlinks).
// Returns null when the package isn't reachable.
//
// `selfDir` guards against Node's package self-reference: when the
// transform is being exercised *from within* try-as's own checkout (e.g.
// `cd ../try-as && npm test`), the consumer's cwd is inside try-as, and
// `createRequire(...).resolve("try-as/package.json")` resolves to the
// running package itself. That should NOT count as "consumer has try-as
// installed" — we'd otherwise inject `~lib/try-as/...` alongside the local
// `./assembly/types/...` and AS would see two copies of every type. A
// symlinked install (consumer's cwd is OUTSIDE try-as, node_modules/try-as
// symlinks back to the checkout) is the opposite case and must NOT be
// confused with self-reference, hence the cwd-based test rather than
// comparing the resolved path against `selfDir`.
function resolveFromConsumer(specifier: string, selfDir?: string): string | null {
  const anchor = path.join(process.cwd(), "package.json");
  let resolved: string;
  try {
    resolved = createRequire(anchor).resolve(specifier);
  } catch {
    return null;
  }
  if (selfDir) {
    try {
      const cwdReal = fs.realpathSync(process.cwd());
      const selfReal = fs.realpathSync(selfDir);
      if (cwdReal === selfReal || cwdReal.startsWith(selfReal + path.sep)) return null;
    } catch {
      // realpath may fail on broken symlinks; fall through rather than
      // blocking the consumer.
    }
  }
  return resolved;
}

type ImportScope = "all" | "user";

function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null || value == "") return fallback;
  if (value == "1" || value.toLowerCase() == "true" || value.toLowerCase() == "yes") return true;
  if (value == "0" || value.toLowerCase() == "false" || value.toLowerCase() == "no") return false;
  return fallback;
}

function envImportScope(name: string, fallback: ImportScope): ImportScope {
  const value = process.env[name];
  if (!value) return fallback;
  if (value == "all" || value == "user") return value;
  return fallback;
}

const TRANSFORM_OPTIONS = {
  rewriteStdlib: envBool("TRY_AS_REWRITE_STDLIB", true),
  importScope: envImportScope("TRY_AS_IMPORT_SCOPE", "all"),
  diagnostics: envBool("TRY_AS_DIAGNOSTICS", false),
};

let WRITE = process.env["WRITE"];

const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);

function hasParsedSource(sources: Parser["sources"], targetPath: string): boolean {
  const normalizedTarget = targetPath.replaceAll("\\", "/");
  const withoutExtension = removeExtension(normalizedTarget).replaceAll("\\", "/");
  const candidates = new Set<string>([normalizedTarget, withoutExtension, normalizedTarget.replace(/^\.\//, ""), withoutExtension.replace(/^\.\//, "")]);

  return sources.some((source) => {
    const paths = [source.normalizedPath, source.internalPath].filter((value): value is string => Boolean(value)).map((value) => value.replaceAll("\\", "/"));

    return paths.some((value) => candidates.has(value) || candidates.has(value.replace(/^\.\//, "")));
  });
}

export default class Transformer extends Transform {
  afterParse(parser: Parser): void {
    // Clear all per-compilation state before touching anything. This module
    // (and the `Globals` singleton) is loaded ONCE per process, but a single
    // process can compile many modules back to back — e.g. as-test runs the
    // compiler in-process inside a pooled build-worker that it reuses across
    // every spec. Without this reset, `Globals.sources`/`methods`/etc. retain
    // the previous build's ref graph; the next build then resolves call/throw
    // sites to those stale, already-generated refs, so its throws never get
    // lowered to `__ErrorState` and fire as raw (uncatchable) aborts instead.
    Globals.reset();

    let sources = parser.sources;

    const baseDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");

    // The transform is "lib" mode (inject runtime as ~lib/try-as/...) whenever
    // try-as is reachable as a module from the consumer's perspective. The
    // baseDir-parent check only catches the flat `node_modules/try-as` case;
    // `resolveFromConsumer` covers symlinks, hoisted workspaces, and pnpm
    // layouts that the literal path probe would miss.
    const isLib = path.dirname(baseDir).endsWith("node_modules") || resolveFromConsumer("try-as/package.json", baseDir) != null;

    // Runtime types live in `assembly/types/`. When the consumer has try-as
    // available through node_modules, AS will resolve everything by walking
    // ~lib/try-as itself, so re-injecting would produce duplicate symbol
    // definitions and a parser assertion failure. Only inject when there is
    // no node_modules entry point - e.g. running directly from try-as's own
    // tree against a source file outside it.
    // Inject every runtime type under a single prefix so transitive imports
    // (`exception.ts` -> `./abort`, `./error`) resolve to the same injected
    // siblings rather than to whatever lives in the consumer tree. In `isLib`
    // mode AS can already walk node_modules/try-as for us, so the inject is
    // a no-op (hasParsedSource will short-circuit once AS pulls those files
    // in via the user's `import "try-as"`).
    const RUNTIME_TYPES = ["exception.ts", "abort.ts", "error.ts", "unreachable.ts"];
    const prefix = isLib ? "~lib/try-as/assembly/types" : "./assembly/types";
    for (const file of RUNTIME_TYPES) {
      const target = `${prefix}/${file}`;
      if (hasParsedSource(sources, target)) continue;
      const diskPath = path.join(baseDir, "assembly", "types", file);
      if (!fs.existsSync(diskPath)) continue;
      parser.parseFile(fs.readFileSync(diskPath).toString(), target, false);
    }

    sources = parser.sources.filter((source) => {
      const p = source.internalPath;
      if (p.startsWith("~lib/rt") || p.startsWith("~lib/performance") || p.startsWith("~lib/wasi_") || p.startsWith("~lib/shared/")) {
        return false;
      }
      return true;
    });

    Globals.baseCWD = path.join(process.cwd(), this.baseDir).replaceAll("\\", "/");

    if (TRANSFORM_OPTIONS.diagnostics) {
      console.log("[try-as] rewriteStdlib=%s importScope=%s", TRANSFORM_OPTIONS.rewriteStdlib.toString(), TRANSFORM_OPTIONS.importScope);
    }

    SourceLinker.link(sources, { importScope: TRANSFORM_OPTIONS.importScope });

    if (TRANSFORM_OPTIONS.rewriteStdlib) {
      StdlibThrowRewriter.rewrite(sources);
    } else if (TRANSFORM_OPTIONS.diagnostics) {
      console.log("[try-as] skipped stdlib throw rewrite");
    }

    ThrowReplacer.replace(sources);

    if (WRITE) {
      if (DEBUG > 0) console.log("\n======WRITING======\n");
      for (let file of WRITE.split(",")) {
        if (DEBUG > 0) console.log("Writing " + file);
        file = removeExtension(file);
        const source = parser.sources.find((v) => v.normalizedPath.includes(file));
        if (source) {
          fs.writeFileSync(path.join(process.cwd(), this.baseDir, file.replace("~lib/", "./node_modules/") + ".tmp.ts"), toString(source));
        }
      }
      if (DEBUG > 0) console.log("\n");
    }
  }
}
