import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const snapshotsRoot = join(repoRoot, "snapshots", "projects");

async function publishedProjects() {
  const indexPath = join(repoRoot, "projects", "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));

  return index.projects.map((project) => ({
    slug: project.slug,
    href: project.href.replace(/^\.\//, "/")
  }));
}

test.beforeAll(async () => {
  await rm(snapshotsRoot, { recursive: true, force: true });
  await mkdir(snapshotsRoot, { recursive: true });
});

for (const project of await publishedProjects()) {
  test(`captures ${project.slug}`, async ({ page }) => {
    await page.goto(project.href, { waitUntil: "networkidle" });
    await page.screenshot({
      fullPage: true,
      path: join(snapshotsRoot, `${project.slug}.png`)
    });
  });
}
