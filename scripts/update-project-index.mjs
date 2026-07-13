import { readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { projectRecord } from "./project-metadata.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kidzoneRoot = dirname(scriptDir);
const projectsRoot = join(kidzoneRoot, "projects");
const indexPath = join(projectsRoot, "index.json");

export async function assertProjectFile(projectRoot, path, label, slug = basename(projectRoot)) {
  const resolvedRoot = await realpath(projectRoot);
  let resolvedPath;

  let details;
  try {
    resolvedPath = await realpath(join(resolvedRoot, path));
    details = await stat(resolvedPath);
  } catch {
    throw new Error(`${slug}/project.json ${label} does not exist: ${path}`);
  }

  const projectRelativePath = relative(resolvedRoot, resolvedPath);
  if (
    projectRelativePath === ".." ||
    projectRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(projectRelativePath)
  ) {
    throw new Error(`${slug}/project.json ${label} must stay inside the project folder: ${path}`);
  }

  if (!details.isFile()) {
    throw new Error(`${slug}/project.json ${label} must refer to a file: ${path}`);
  }
}

async function readProject(directory) {
  const metadataPath = join(projectsRoot, directory.name, "project.json");
  let metadata;
  try {
    metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  } catch (error) {
    throw new Error(`${directory.name}/project.json must contain valid JSON: ${error.message}`, {
      cause: error
    });
  }
  const record = projectRecord(directory.name, metadata);
  const projectRoot = join(projectsRoot, directory.name);

  await assertProjectFile(projectRoot, record.entry, "entry", directory.name);
  if (metadata.portfolio !== undefined) {
    await assertProjectFile(projectRoot, metadata.portfolio.preview, "portfolio.preview", directory.name);
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
