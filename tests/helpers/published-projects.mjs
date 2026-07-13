import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export async function publishedProjects() {
  const index = JSON.parse(
    await readFile(join(repoRoot, "projects", "index.json"), "utf8")
  );

  return index.projects.map((project) => ({
    ...project,
    path: project.href.replace(/^\.\//, "")
  }));
}
