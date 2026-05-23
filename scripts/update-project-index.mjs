import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kidzoneRoot = dirname(scriptDir);
const projectsRoot = join(kidzoneRoot, "projects");
const indexPath = join(projectsRoot, "index.json");

function assertString(value, label, slug) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${slug}/project.json needs a non-empty ${label}.`);
  }
}

function assertSafeEntry(entry, slug) {
  assertString(entry, "entry", slug);

  if (entry.startsWith("/") || entry.split("/").includes("..")) {
    throw new Error(`${slug}/project.json entry must stay inside the project folder.`);
  }
}

function projectRecord(slug, metadata) {
  assertString(metadata.title, "title", slug);
  assertString(metadata.summary, "summary", slug);

  if (metadata.description !== undefined) {
    assertString(metadata.description, "description", slug);
  }

  if (metadata.date !== undefined) {
    assertString(metadata.date, "date", slug);
  }

  const entry = metadata.entry ?? "index.html";

  assertSafeEntry(entry, slug);

  if (metadata.cta !== undefined) {
    assertString(metadata.cta, "cta", slug);
  }

  if (
    metadata.tags !== undefined &&
    (!Array.isArray(metadata.tags) || !metadata.tags.every((tag) => typeof tag === "string"))
  ) {
    throw new Error(`${slug}/project.json tags must be strings.`);
  }

  if (metadata.order !== undefined && !Number.isFinite(metadata.order)) {
    throw new Error(`${slug}/project.json order must be a number.`);
  }

  return {
    slug,
    title: metadata.title,
    description: metadata.description ?? metadata.summary,
    date: metadata.date ?? null,
    dateSource: metadata.dateSource ?? "project metadata",
    summary: metadata.summary,
    href:
      entry === "index.html"
        ? `./projects/${slug}/`
        : `./projects/${slug}/${entry}`,
    entry,
    cta: metadata.cta ?? "Open project",
    tags: metadata.tags ?? [],
    order: metadata.order ?? 999
  };
}

async function readProject(directory) {
  const metadataPath = join(projectsRoot, directory.name, "project.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const entry = metadata.entry ?? "index.html";

  await access(join(projectsRoot, directory.name, entry));

  return projectRecord(directory.name, metadata);
}

export async function projectIndex() {
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
