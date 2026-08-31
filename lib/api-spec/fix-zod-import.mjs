import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const directory = path.dirname(fileURLToPath(import.meta.url));
const generatedApi = path.resolve(directory, "..", "api-zod", "src", "generated", "api.ts");
const source = await readFile(generatedApi, "utf8");
const updated = source.replace("from 'zod';", "from 'zod/v4';");

if (updated === source && !source.includes("from 'zod/v4';")) {
  throw new Error("Generated Zod import was not found.");
}

await writeFile(generatedApi, updated);