import { Parser, SourceKind } from "assemblyscript/dist/assemblyscript.js";
import { Transform } from "assemblyscript/dist/transform.js";
// import { SourceRef, Try } from "./transform.js";
import { SourceLinker } from "./passes/source.js";
// import { FunctionLinker } from "./linkers/function.old.js";
import { isStdlib, toString } from "./lib/util.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
// import { Linker, PassKind } from "./passes/linker.js";
// import { removeExtension } from "./utils.js";
// import { ExceptionLinker } from "./linkers/exception.old.js";
const WRITE = process.env["WRITE"];
export default class Transformer extends Transform {
  afterParse(parser: Parser): void {
    let sources = parser.sources;

    const baseDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
    // // sources.forEach(v => console.log(v.normalizedPath));

    // // console.log("Base Dir: " + baseDir);

    const isLib = path.dirname(baseDir).endsWith("node_modules");

    if (!isLib && !sources.some((v) => v.normalizedPath.startsWith("assembly/types/exception.ts"))) {
      const p = "./assembly/types/exception.ts";
      if (fs.existsSync(path.join(baseDir, p))) {
        // console.log("Added source: " + p);
        parser.parseFile(fs.readFileSync(path.join(baseDir, p)).toString(), p, false);
      }
    }
    if (isLib && !sources.some((v) => v.normalizedPath.startsWith("~lib/try-as/assembly/types/exception.ts"))) {
      // console.log("Added source: ~lib/try-as/assembly/types/exception.ts");
      parser.parseFile(fs.readFileSync(path.join(baseDir, "assembly", "types", "exception.ts")).toString(), "~lib/try-as/assembly/types/exception.ts", false);
    }

    if (!isLib && !sources.some((v) => v.normalizedPath.startsWith("assembly/types/unreachable.ts"))) {
      const p = "./assembly/types/unreachable.ts";
      if (fs.existsSync(path.join(baseDir, p))) {
        // console.log("Added source: " + p);
        parser.parseFile(fs.readFileSync(path.join(baseDir, p)).toString(), p, false);
      }
    }

    if (isLib && !sources.some((v) => v.normalizedPath.startsWith("~lib/try-as/assembly/types/unreachable.ts"))) {
      // console.log("Added source: ~lib/try-as/assembly/types/unreachable.ts");
      parser.parseFile(fs.readFileSync(path.join(baseDir, "assembly", "types", "unreachable.ts")).toString(), "~lib/try-as/assembly/types/unreachable.ts", false);
    }

    sources = parser.sources
      .filter((source) => {
        const p = source.internalPath;
        if (p.startsWith("~lib/rt") || p.startsWith("~lib/performance") || p.startsWith("~lib/wasi_") || p.startsWith("~lib/shared/")) {
          return false;
        }
        return !isStdlib(source);
      })
      .sort((a, b) => {
        if (a.sourceKind >= 2 && b.sourceKind <= 1) {
          return -1;
        } else if (a.sourceKind <= 1 && b.sourceKind >= 2) {
          return 1;
        } else {
          return 0;
        }
      })
      .sort((a, b) => {
        if (a.sourceKind === SourceKind.UserEntry && b.sourceKind !== SourceKind.UserEntry) {
          return 1;
        } else {
          return 0;
        }
      });
    // ExceptionLinker.SN.program = this.program;
    // ExceptionLinker.SN.baseDir = this.baseDir;

    // FunctionLinker.visitSources(sources);

    // const transformer = Try.SN;
    // transformer.program = this.program;
    // transformer.baseDir = this.baseDir;
    // transformer.baseCWD = path.join(process.cwd(), this.baseDir);
    // transformer.parser = parser;

    // for (const source of sources) {
    //   const src = new SourceRef(source);
    //   Try.SN.sources.push(src);
    // }

    // console.log("\n========VISITING=========\n");
    // for (const source of sources) {
    //   console.log("Visiting: " + source.normalizedPath);
    //   transformer.visitSrc(source);
    // }

    // console.log("\n=========LINKING=========\n");
    // // const entry = parser.sources.find((v) => v.sourceKind === SourceKind.UserEntry);
    // // Linker.runPass(entry);
    // for (const source of sources) {
    //   Linker.runPass(source);
    // }

    // // console.log("Linking Code...");
    // // Linker.link();

    // if (WRITE) {
    //   const source1 = parser.sources.find((v) => v.normalizedPath.startsWith("assembly/foo"));
    //   if (source1) {
    //     console.log("Writing out");
    //     writeFileSync(path.join(process.cwd(), this.baseDir, removeExtension("assembly/foo") + ".tmp.ts"), toString(source1));
    //   }
    //   const source = parser.sources.find((v) => v.normalizedPath.startsWith(WRITE));
    //   if (source) {
    //     console.log("Writing out");
    //     writeFileSync(path.join(process.cwd(), this.baseDir, removeExtension(WRITE) + ".tmp.ts"), toString(source));
    //   }
    // }

    // console.log(Try.SN.sources.find((v) => v.source.normalizedPath == "~lib/json-as/")?.functions);

    SourceLinker.link(sources);
  }
}
