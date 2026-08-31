import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { rm } from "node:fs/promises";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(artifactDir, ".test-dist");

try {
  await rm(outDir, { recursive: true, force: true });
  await build({
    entryPoints: [path.resolve(artifactDir, "tests/member-journey.integration.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: path.resolve(outDir, "member-journey.integration.mjs"),
    external: ["*.node", "pg-native"],
    logLevel: "warning",
    banner: {
      js: `import { createRequire as __createRequire } from "node:module";
import __path from "node:path";
import __url from "node:url";
globalThis.require = __createRequire(import.meta.url);
globalThis.__filename = __url.fileURLToPath(import.meta.url);
globalThis.__dirname = __path.dirname(globalThis.__filename);`,
    },
  });
  await import(path.resolve(outDir, "member-journey.integration.mjs"));
} finally {
  await rm(outDir, { recursive: true, force: true });
}