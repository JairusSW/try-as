import { Transform } from "assemblyscript/dist/transform.js";
import { TryTransform } from "./transform.js";
import { FunctionLinker } from "./linkers/function.js";
import { isStdlib } from "./lib/util.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { ExceptionLinker } from "./linkers/exception.js";
export default class Transformer extends Transform {
    afterParse(parser) {
        let sources = parser.sources;
        const baseDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
        const isLib = path.dirname(baseDir).endsWith("node_modules");
        if (!isLib &&
            !sources.some((v) => v.normalizedPath.startsWith("assembly/types/exception.ts"))) {
            const p = "./assembly/types/exception.ts";
            if (fs.existsSync(path.join(baseDir, p))) {
                parser.parseFile(fs.readFileSync(path.join(baseDir, p)).toString(), p, false);
            }
        }
        if (isLib &&
            !sources.some((v) => v.normalizedPath.startsWith("~lib/as-try/assembly/types/exception.ts"))) {
            parser.parseFile(fs
                .readFileSync(path.join(baseDir, "assembly", "types", "exception.ts"))
                .toString(), "~lib/as-try/assembly/types/exception.ts", false);
        }
        if (!isLib &&
            !sources.some((v) => v.normalizedPath.startsWith("assembly/types/unreachable.ts"))) {
            const p = "./assembly/types/unreachable.ts";
            if (fs.existsSync(path.join(baseDir, p))) {
                parser.parseFile(fs.readFileSync(path.join(baseDir, p)).toString(), p, false);
            }
        }
        if (isLib &&
            !sources.some((v) => v.normalizedPath.startsWith("~lib/as-try/assembly/types/unreachable.ts"))) {
            parser.parseFile(fs
                .readFileSync(path.join(baseDir, "assembly", "types", "unreachable.ts"))
                .toString(), "~lib/as-try/assembly/types/unreachable.ts", false);
        }
        sources = parser.sources
            .filter((source) => {
            const p = source.internalPath;
            if (p.startsWith("~lib/rt") ||
                p.startsWith("~lib/performance") ||
                p.startsWith("~lib/wasi_") ||
                p.startsWith("~lib/shared/")) {
                return false;
            }
            return !isStdlib(source);
        })
            .sort((a, b) => {
            if (a.sourceKind >= 2 && b.sourceKind <= 1) {
                return -1;
            }
            else if (a.sourceKind <= 1 && b.sourceKind >= 2) {
                return 1;
            }
            else {
                return 0;
            }
        })
            .sort((a, b) => {
            if (a.sourceKind === 1 &&
                b.sourceKind !== 1) {
                return 1;
            }
            else if (a.sourceKind !== 1 &&
                b.sourceKind === 1) {
                return -1;
            }
            else {
                return 0;
            }
        });
        ExceptionLinker.SN.program = this.program;
        ExceptionLinker.SN.baseDir = this.baseDir;
        FunctionLinker.visitSources(sources);
        const transformer = new TryTransform();
        transformer.program = this.program;
        transformer.baseDir = this.baseDir;
        for (const source of sources) {
            transformer.visit(source);
        }
    }
}
//# sourceMappingURL=index.js.map