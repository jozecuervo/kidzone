import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kidzoneRoot = dirname(scriptDir);
const projectsRoot = join(kidzoneRoot, "projects");
const indexPath = join(projectsRoot, "index.json");
const runtimeTypes = new Set(["static"]);
const networkAccessModes = new Set(["none", "declared-external-dependency"]);

function assertString(value, label, slug) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${slug}/project.json needs a non-empty ${label}.`);
  }
}

function assertBoolean(value, label, slug) {
  if (typeof value !== "boolean") {
    throw new Error(`${slug}/project.json needs a boolean ${label}.`);
  }
}

function assertObject(value, label, slug) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${slug}/project.json needs a ${label} object.`);
  }
}

function assertStringArray(value, label, slug) {
  if (!Array.isArray(value) || !value.length) {
    throw new Error(`${slug}/project.json needs a non-empty ${label} array.`);
  }

  if (!value.every((item) => typeof item === "string" && item.trim())) {
    throw new Error(`${slug}/project.json ${label} must contain strings.`);
  }
}

function assertSafeEntry(entry, slug) {
  assertString(entry, "entry", slug);

  if (entry.startsWith("/") || entry.split("/").includes("..")) {
    throw new Error(`${slug}/project.json entry must stay inside the project folder.`);
  }
}

function assertSafety(metadata, slug) {
  assertString(metadata.ageRange, "ageRange", slug);
  assertStringArray(metadata.interaction, "interaction", slug);
  assertObject(metadata.safety, "safety", slug);
  assertString(metadata.safety.privacy, "safety.privacy", slug);
  assertString(metadata.safety.adultHelp, "safety.adultHelp", slug);
  assertString(metadata.safety.notes, "safety.notes", slug);
}

function assertRuntime(metadata, slug) {
  assertObject(metadata.runtime, "runtime", slug);
  assertString(metadata.runtime.type, "runtime.type", slug);

  if (!runtimeTypes.has(metadata.runtime.type)) {
    throw new Error(`${slug}/project.json runtime.type must be one of: ${[...runtimeTypes].join(", ")}.`);
  }

  assertBoolean(metadata.runtime.requiresServer, "runtime.requiresServer", slug);
  assertString(metadata.runtime.networkAccess, "runtime.networkAccess", slug);

  if (!networkAccessModes.has(metadata.runtime.networkAccess)) {
    throw new Error(
      `${slug}/project.json runtime.networkAccess must be one of: ${[...networkAccessModes].join(", ")}.`
    );
  }

  assertBoolean(metadata.runtime.storesData, "runtime.storesData", slug);

  if (!Array.isArray(metadata.runtime.externalDependencies)) {
    throw new Error(`${slug}/project.json runtime.externalDependencies must be an array.`);
  }

  for (const dependency of metadata.runtime.externalDependencies) {
    assertObject(dependency, "runtime.externalDependencies item", slug);
    assertString(dependency.name, "runtime.externalDependencies[].name", slug);
    assertString(dependency.url, "runtime.externalDependencies[].url", slug);
    assertString(dependency.reason, "runtime.externalDependencies[].reason", slug);
  }

  if (
    metadata.runtime.networkAccess === "none" &&
    metadata.runtime.externalDependencies.length
  ) {
    throw new Error(`${slug}/project.json cannot list external dependencies when networkAccess is none.`);
  }
}

function assertPortfolio(metadata, slug) {
  if (metadata.portfolio === undefined) {
    return;
  }

  assertObject(metadata.portfolio, "portfolio", slug);
  assertBoolean(metadata.portfolio.featured, "portfolio.featured", slug);
  assertSafeEntry(metadata.portfolio.preview, slug);
  assertStringArray(
    metadata.portfolio.technicalHighlights,
    "portfolio.technicalHighlights",
    slug
  );
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

  assertSafety(metadata, slug);
  assertRuntime(metadata, slug);
  assertPortfolio(metadata, slug);

  const portfolio = metadata.portfolio
    ? {
        featured: metadata.portfolio.featured,
        preview: `./projects/${slug}/${metadata.portfolio.preview}`,
        technicalHighlights: metadata.portfolio.technicalHighlights
      }
    : null;

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
    order: metadata.order ?? 999,
    ageRange: metadata.ageRange,
    interaction: metadata.interaction,
    safety: metadata.safety,
    runtime: metadata.runtime,
    portfolio
  };
}

async function readProject(directory) {
  const metadataPath = join(projectsRoot, directory.name, "project.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const entry = metadata.entry ?? "index.html";

  await access(join(projectsRoot, directory.name, entry));

  if (metadata.portfolio?.preview) {
    await access(join(projectsRoot, directory.name, metadata.portfolio.preview));
  }

  return projectRecord(directory.name, metadata);
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
