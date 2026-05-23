import { execFileSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkProjectIndex } from "./update-project-index.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const skippedDirectories = new Set([".git", "node_modules"]);

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory() && !skippedDirectories.has(entry.name)) {
      files.push(...await javascriptFiles(entryPath));
    } else if (entry.isFile() && [".js", ".mjs"].includes(extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

for (const file of await javascriptFiles(repoRoot)) {
  execFileSync(process.execPath, ["--check", file], {
    stdio: "inherit"
  });
}

await checkProjectIndex();

console.log("Kidzone checks passed.");
