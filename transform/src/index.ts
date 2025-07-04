import { FunctionDeclaration, Parser } from "assemblyscript/dist/assemblyscript.js";
import { Transform } from "assemblyscript/dist/transform.js";
import { SourceLinker } from "./passes/source.js";
import { Globals } from "./globals/globals.js";
import { removeExtension } from "./utils.js";
import { SimpleParser, toString } from "./lib/util.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { ThrowReplacer } from "./passes/replacer.js";

let WRITE = process.env["WRITE"];
export default class Transformer extends Transform {
  afterParse(parser: Parser): void {
    let sources = parser.sources;

    const baseDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");

    const isLib = path.dirname(baseDir).endsWith("node_modules");

    if (!isLib && !sources.some((v) => v.normalizedPath.startsWith("assembly/types/exception  "))) {
      const p = "./assembly/types/exception.ts";
      if (fs.existsSync(path.join(baseDir, p))) {
        parser.parseFile(fs.readFileSync(path.join(baseDir, p.replaceAll("/", path.sep))).toString(), p, false);
      }
    }
    if (isLib && !sources.some((v) => v.normalizedPath.startsWith("~lib/try-as/assembly/types/exception.ts"))) {
      parser.parseFile(fs.readFileSync(path.join(baseDir, "assembly", "types", "exception.ts")).toString(), "~lib/try-as/assembly/types/exception.ts", false);
    }

    if (!isLib && !sources.some((v) => v.normalizedPath.startsWith("assembly/types/unreachable.ts"))) {
      const p = "./assembly/types/unreachable.ts";
      if (fs.existsSync(path.join(baseDir, p))) {
        parser.parseFile(fs.readFileSync(path.join(baseDir, p.replaceAll("/", path.sep))).toString(), p, false);
      }
    }

    if (isLib && !sources.some((v) => v.normalizedPath.startsWith("~lib/try-as/assembly/types/unreachable.ts"))) {
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

    SourceLinker.link(sources);

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
