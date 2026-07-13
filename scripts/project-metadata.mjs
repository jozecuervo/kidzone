const runtimeTypes = new Set(["static"]);
const networkAccessModes = new Set(["none", "declared-external-dependency"]);

export const interactionTypes = Object.freeze([
  "camera",
  "file-upload",
  "keyboard",
  "passive",
  "pointer",
  "touch"
]);

const interactionTypeSet = new Set(interactionTypes);
const placeholderPattern = /\b(?:placeholder|tbd|todo)\b/i;

function assertString(value, label, slug, { noPlaceholders = false } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${slug}/project.json needs a non-empty ${label}.`);
  }

  if (noPlaceholders && placeholderPattern.test(value)) {
    throw new Error(`${slug}/project.json ${label} cannot contain placeholder text.`);
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
    throw new Error(`${slug}/project.json ${label} must contain non-empty strings.`);
  }
}

export function assertSafeProjectPath(value, label, slug) {
  assertString(value, label, slug);

  if (
    value.startsWith("/") ||
    /^[a-z][a-z\d+.-]*:/i.test(value) ||
    value.includes("\\") ||
    value.split("/").includes("..") ||
    /[?#]/.test(value)
  ) {
    throw new Error(`${slug}/project.json ${label} must be a relative path inside the project folder.`);
  }
}

function assertDate(value, slug) {
  assertString(value, "date", slug);

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`${slug}/project.json date must use YYYY-MM-DD.`);
  }

  const [, year, month, day] = match;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw new Error(`${slug}/project.json date must be a valid calendar date.`);
  }
}

function assertInteractions(value, slug) {
  assertStringArray(value, "interaction", slug);

  for (const interaction of value) {
    if (!interactionTypeSet.has(interaction)) {
      throw new Error(
        `${slug}/project.json interaction must only use: ${interactionTypes.join(", ")}.`
      );
    }
  }

  if (new Set(value).size !== value.length) {
    throw new Error(`${slug}/project.json interaction values must be unique.`);
  }
}

function assertTags(value, slug) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    throw new Error(`${slug}/project.json tags must be an array.`);
  }

  const normalized = new Set();
  for (const tag of value) {
    if (typeof tag !== "string" || !tag.trim()) {
      throw new Error(`${slug}/project.json tags must contain non-empty strings.`);
    }

    const key = tag.trim().toLocaleLowerCase("en-US");
    if (normalized.has(key)) {
      throw new Error(`${slug}/project.json tags must be unique after trimming and case normalization.`);
    }
    normalized.add(key);
  }
}

function assertSafety(metadata, slug) {
  assertString(metadata.ageRange, "ageRange", slug, { noPlaceholders: true });
  assertInteractions(metadata.interaction, slug);
  assertObject(metadata.safety, "safety", slug);
  assertString(metadata.safety.privacy, "safety.privacy", slug, { noPlaceholders: true });
  assertString(metadata.safety.adultHelp, "safety.adultHelp", slug, { noPlaceholders: true });
  assertString(metadata.safety.notes, "safety.notes", slug, { noPlaceholders: true });
}

function assertRuntime(metadata, slug) {
  assertObject(metadata.runtime, "runtime", slug);
  assertString(metadata.runtime.type, "runtime.type", slug);

  if (!runtimeTypes.has(metadata.runtime.type)) {
    throw new Error(`${slug}/project.json runtime.type must be one of: ${[...runtimeTypes].join(", ")}.`);
  }

  assertBoolean(metadata.runtime.requiresServer, "runtime.requiresServer", slug);
  if (metadata.runtime.type === "static" && metadata.runtime.requiresServer) {
    throw new Error(`${slug}/project.json static projects must set runtime.requiresServer to false.`);
  }

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

  const dependencies = new Set();
  for (const dependency of metadata.runtime.externalDependencies) {
    assertObject(dependency, "runtime.externalDependencies item", slug);
    assertString(dependency.name, "runtime.externalDependencies[].name", slug);
    assertString(dependency.url, "runtime.externalDependencies[].url", slug);
    assertString(dependency.reason, "runtime.externalDependencies[].reason", slug);

    let url;
    try {
      url = new URL(dependency.url);
    } catch {
      throw new Error(`${slug}/project.json external dependency URLs must be valid HTTP(S) URLs.`);
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error(`${slug}/project.json external dependency URLs must be valid HTTP(S) URLs.`);
    }

    const key = dependency.url.trim().toLocaleLowerCase("en-US");
    if (dependencies.has(key)) {
      throw new Error(`${slug}/project.json external dependency URLs must be unique.`);
    }
    dependencies.add(key);
  }

  const hasDependencies = metadata.runtime.externalDependencies.length > 0;
  if (metadata.runtime.networkAccess === "none" && hasDependencies) {
    throw new Error(`${slug}/project.json cannot list external dependencies when networkAccess is none.`);
  }
  if (metadata.runtime.networkAccess === "declared-external-dependency" && !hasDependencies) {
    throw new Error(`${slug}/project.json must list a dependency when networkAccess declares one.`);
  }
}

function assertPortfolio(metadata, slug) {
  if (metadata.portfolio === undefined) return;
  assertObject(metadata.portfolio, "portfolio", slug);
  assertBoolean(metadata.portfolio.featured, "portfolio.featured", slug);
  assertSafeProjectPath(metadata.portfolio.preview, "portfolio.preview", slug);
  assertStringArray(metadata.portfolio.technicalHighlights, "portfolio.technicalHighlights", slug);
}

export function projectRecord(slug, metadata) {
  assertString(metadata.title, "title", slug, { noPlaceholders: true });
  assertString(metadata.summary, "summary", slug, { noPlaceholders: true });

  if (metadata.description !== undefined) assertString(metadata.description, "description", slug);
  if (metadata.date !== undefined) assertDate(metadata.date, slug);

  const entry = metadata.entry ?? "index.html";
  assertSafeProjectPath(entry, "entry", slug);

  if (metadata.cta !== undefined) assertString(metadata.cta, "cta", slug);
  assertTags(metadata.tags, slug);
  if (metadata.order !== undefined && !Number.isFinite(metadata.order)) {
    throw new Error(`${slug}/project.json order must be a number.`);
  }

  assertSafety(metadata, slug);
  assertRuntime(metadata, slug);
  assertPortfolio(metadata, slug);

  return {
    slug,
    title: metadata.title,
    description: metadata.description ?? metadata.summary,
    date: metadata.date ?? null,
    dateSource: metadata.dateSource ?? "project metadata",
    summary: metadata.summary,
    href: entry === "index.html" ? `./projects/${slug}/` : `./projects/${slug}/${entry}`,
    entry,
    cta: metadata.cta ?? "Open project",
    tags: metadata.tags ?? [],
    order: metadata.order ?? 999,
    ageRange: metadata.ageRange,
    interaction: metadata.interaction,
    safety: metadata.safety,
    runtime: metadata.runtime,
    ...(metadata.portfolio === undefined ? {} : {
      portfolio: {
        featured: metadata.portfolio.featured,
        preview: `./projects/${slug}/${metadata.portfolio.preview}`,
        technicalHighlights: metadata.portfolio.technicalHighlights
      }
    })
  };
}
