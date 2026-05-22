import { access, cp, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { updateProjectIndex } from "./update-project-index.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kidzoneRoot = dirname(scriptDir);
const projectsRoot = join(kidzoneRoot, "projects");
const templateRoot = join(projectsRoot, "_template");
const slug = process.argv[2];
const title = process.argv.slice(3).join(" ").trim() || titleFromSlug(slug);

function titleFromSlug(value = "") {
  return value
    .split("-")
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!slug) {
  fail('Usage: node ./scripts/new-project.mjs <slug> "Project Title"');
} else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  fail("Project slugs must use lowercase letters, numbers, and single hyphens.");
} else {
  const projectRoot = join(projectsRoot, slug);

  try {
    await access(projectRoot);
    fail(`projects/${slug} already exists.`);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }

    await cp(templateRoot, projectRoot, { recursive: true });
    await writeFile(
      join(projectRoot, "project.json"),
      `${JSON.stringify(
        {
          title,
          summary: "A new Kidzone mini-project ready for its first idea.",
          cta: "Open project",
          tags: ["new"],
          order: 999
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    await updateProjectIndex();
    console.log(`Created projects/${slug} and refreshed projects/index.json.`);
  }
}
