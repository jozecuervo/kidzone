import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "@playwright/test";
import { publishedProjects, repoRoot } from "./helpers/published-projects.mjs";
import { expectProjectShell, observePage } from "./helpers/project-smoke.mjs";
const snapshotsRoot = join(repoRoot, "snapshots", "projects");

test.beforeAll(async () => {
  await mkdir(snapshotsRoot, { recursive: true });
});

for (const project of await publishedProjects()) {
  test(`captures ${project.slug}`, async ({ page }, testInfo) => {
    const observations = observePage(page);
    await expectProjectShell(page, project, observations);
    await page.screenshot({
      fullPage: true,
      path: join(snapshotsRoot, `${project.slug}-${testInfo.project.name}.png`)
    });
  });
}
