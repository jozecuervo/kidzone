import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectRecord } from "./project-metadata.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kidzoneRoot = dirname(scriptDir);
const projectsRoot = join(kidzoneRoot, "projects");
const indexPath = join(projectsRoot, "index.json");

async function assertProjectFile(slug, path, label) {
  let details;
  try {
    details = await stat(join(projectsRoot, slug, path));
  } catch {
    throw new Error(`${slug}/project.json ${label} does not exist: ${path}`);
  }

  if (!details.isFile()) {
    throw new Error(`${slug}/project.json ${label} must refer to a file: ${path}`);
  }
}

async function readProject(directory) {
  const metadataPath = join(projectsRoot, directory.name, "project.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const record = projectRecord(directory.name, metadata);

  await assertProjectFile(directory.name, record.entry, "entry");
  if (metadata.portfolio !== undefined) {
    await assertProjectFile(directory.name, metadata.portfolio.preview, "portfolio.preview");
  }

  return record;
}

export async function projectIndex() {
  const entries = await readdir(projectsRoot, { withFileTypes: true });
  const projectDirectories = entries.filter(
    (entry) => entry.isDirectory() && !entry.name.startsWith("_")
  );
  const projects = [];

  for (const directory of projectDirectories) {
    projects.push(await readProject(directory));
  }

  projects.sort(
    (first, second) =>
      first.order - second.order || first.title.localeCompare(second.title)
  );

  return `${JSON.stringify({ projects }, null, 2)}\n`;
}

export async function updateProjectIndex() {
  const index = await projectIndex();

  await writeFile(indexPath, index, "utf8");

  return JSON.parse(index).projects;
}

export async function checkProjectIndex() {
  const expectedIndex = await projectIndex();
  const currentIndex = await readFile(indexPath, "utf8");

  if (currentIndex !== expectedIndex) {
    throw new Error("projects/index.json is stale. Run the update-project-index script.");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    await checkProjectIndex();
    console.log("projects/index.json is up to date.");
  } else {
    const projects = await updateProjectIndex();

    console.log(`Updated projects/index.json with ${projects.length} project(s).`);
  }
}
