import { test } from "@playwright/test";
import { publishedProjects } from "./helpers/published-projects.mjs";
import { expectProjectShell, observePage } from "./helpers/project-smoke.mjs";

for (const project of await publishedProjects()) {
  test(`${project.slug} loads a healthy project shell`, async ({ page }) => {
    const observations = observePage(page);
    await expectProjectShell(page, project, observations);
  });
}
