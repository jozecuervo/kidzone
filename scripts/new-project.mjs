import { access, cp, readFile, writeFile } from "node:fs/promises";
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

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function personalizeTemplate(projectRoot) {
  const indexPath = join(projectRoot, "index.html");
  const index = await readFile(indexPath, "utf8");

  await writeFile(
    indexPath,
    index
      .replace(
        "<title>Kidzone Mini-Project</title>",
        `<title>${escapeHtml(title)}</title>`
      )
      .replace("<h1>New mini-project</h1>", `<h1>${escapeHtml(title)}</h1>`),
    "utf8"
  );
  await writeFile(
    join(projectRoot, "README.md"),
    `# ${title}\n\nStart with one small playable idea and keep this project folder self-contained.\n`,
    "utf8"
  );
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
    await personalizeTemplate(projectRoot);
    await writeFile(
      join(projectRoot, "project.json"),
      `${JSON.stringify(
        {
          title,
          summary: "A new Kidzone mini-project ready for its first idea.",
          description: "A new Kidzone mini-project ready for its first idea.",
          date: new Date().toISOString().slice(0, 10),
          dateSource: "generated when the project was scaffolded",
          entry: "index.html",
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
