import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kidzoneRoot = dirname(scriptDir);
const projectsRoot = join(kidzoneRoot, "projects");
const indexPath = join(projectsRoot, "index.json");

function projectRecord(slug, metadata) {
  if (!metadata.title || !metadata.summary) {
    throw new Error(`${slug}/project.json needs title and summary.`);
  }

  return {
    slug,
    title: metadata.title,
    summary: metadata.summary,
    href: `./projects/${slug}/`,
    cta: metadata.cta ?? "Open project",
    tags: metadata.tags ?? [],
    order: metadata.order ?? 999
  };
}

async function readProject(directory) {
  const metadataPath = join(projectsRoot, directory.name, "project.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));

  return projectRecord(directory.name, metadata);
}

export async function updateProjectIndex() {
  const entries = await readdir(projectsRoot, { withFileTypes: true });
  const projectDirectories = entries.filter(
    (entry) => entry.isDirectory() && !entry.name.startsWith("_")
  );
  const projects = [];

  for (const directory of projectDirectories) {
    try {
      projects.push(await readProject(directory));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  projects.sort(
    (first, second) =>
      first.order - second.order || first.title.localeCompare(second.title)
  );

  await writeFile(
    indexPath,
    `${JSON.stringify({ projects }, null, 2)}\n`,
    "utf8"
  );

  return projects;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const projects = await updateProjectIndex();

  console.log(`Updated projects/index.json with ${projects.length} project(s).`);
}
