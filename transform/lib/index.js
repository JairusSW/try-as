import { Transform } from "assemblyscript/dist/transform.js";
import { SourceLinker } from "./passes/source.js";
import { Globals } from "./globals/globals.js";
import { removeExtension } from "./utils.js";
import { toString } from "./lib/util.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { ThrowReplacer } from "./passes/replacer.js";
import { StdlibThrowRewriter } from "./passes/stdlib.js";
function envBool(name, fallback) {
    const value = process.env[name];
    if (value == null || value == "")
        return fallback;
    if (value == "1" || value.toLowerCase() == "true" || value.toLowerCase() == "yes")
        return true;
    if (value == "0" || value.toLowerCase() == "false" || value.toLowerCase() == "no")
        return false;
    return fallback;
}
function envImportScope(name, fallback) {
    const value = process.env[name];
    if (!value)
        return fallback;
    if (value == "all" || value == "user")
        return value;
    return fallback;
}
const TRANSFORM_OPTIONS = {
    rewriteStdlib: envBool("TRY_AS_REWRITE_STDLIB", true),
    importScope: envImportScope("TRY_AS_IMPORT_SCOPE", "all"),
    diagnostics: envBool("TRY_AS_DIAGNOSTICS", false),
};
let WRITE = process.env["WRITE"];
function hasParsedSource(sources, targetPath) {
    const normalizedTarget = targetPath.replaceAll("\\", "/");
    const withoutExtension = removeExtension(normalizedTarget).replaceAll("\\", "/");
    const candidates = new Set([normalizedTarget, withoutExtension, normalizedTarget.replace(/^\.\//, ""), withoutExtension.replace(/^\.\//, "")]);
    return sources.some((source) => {
        const paths = [source.normalizedPath, source.internalPath].filter((value) => Boolean(value)).map((value) => value.replaceAll("\\", "/"));
        return paths.some((value) => candidates.has(value) || candidates.has(value.replace(/^\.\//, "")));
    });
}
export default class Transformer extends Transform {
    afterParse(parser) {
        let sources = parser.sources;
        const baseDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
        const isLib = path.dirname(baseDir).endsWith("node_modules");
        if (!isLib && !hasParsedSource(sources, "assembly/types/exception.ts")) {
            const p = "./assembly/types/exception.ts";
            if (fs.existsSync(path.join(baseDir, p))) {
                parser.parseFile(fs.readFileSync(path.join(baseDir, p.replaceAll("/", path.sep))).toString(), p, false);
            }
        }
        if (isLib && !hasParsedSource(sources, "~lib/try-as/assembly/types/exception.ts")) {
            parser.parseFile(fs.readFileSync(path.join(baseDir, "assembly", "types", "exception.ts")).toString(), "~lib/try-as/assembly/types/exception.ts", false);
        }
        if (!isLib && !hasParsedSource(sources, "assembly/types/unreachable.ts")) {
            const p = "./assembly/types/unreachable.ts";
            if (fs.existsSync(path.join(baseDir, p))) {
                parser.parseFile(fs.readFileSync(path.join(baseDir, p.replaceAll("/", path.sep))).toString(), p, false);
            }
        }
        if (isLib && !hasParsedSource(sources, "~lib/try-as/assembly/types/unreachable.ts")) {
            parser.parseFile(fs.readFileSync(path.join(baseDir, "assembly", "types", "unreachable.ts")).toString(), "~lib/try-as/assembly/types/unreachable.ts", false);
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
        }
        else if (TRANSFORM_OPTIONS.diagnostics) {
            console.log("[try-as] skipped stdlib throw rewrite");
        }
        ThrowReplacer.replace(sources);
        if (WRITE) {
            console.log("\n======WRITING======\n");
            for (let file of WRITE.split(",")) {
                console.log("Writing " + file);
                file = removeExtension(file);
                const source = parser.sources.find((v) => v.normalizedPath.includes(file));
                if (source) {
                    fs.writeFileSync(path.join(process.cwd(), this.baseDir, file.replace("~lib/", "./node_modules/") + ".tmp.ts"), toString(source));
                }
            }
            console.log("\n");
        }
    }
}
//# sourceMappingURL=index.js.map