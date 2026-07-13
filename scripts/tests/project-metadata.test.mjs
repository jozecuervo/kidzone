import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  interactionTypes,
  projectRecord,
  scaffoldProjectMetadata
} from "../project-metadata.mjs";
import { assertProjectFile } from "../update-project-index.mjs";

function metadata(overrides = {}) {
  return {
    title: "Paper Plane Lab",
    summary: "Build paper planes and test tiny flight changes.",
    date: "2026-05-23",
    entry: "index.html",
    tags: ["science", "craft"],
    ageRange: "7-11",
    interaction: ["pointer", "touch", "keyboard"],
    safety: {
      privacy: "Local-only play with no accounts or sharing.",
      adultHelp: "None required for ordinary play.",
      notes: "No timer pressure or public posting."
    },
    runtime: {
      type: "static",
      requiresServer: false,
      networkAccess: "none",
      storesData: false,
      externalDependencies: []
    },
    ...overrides
  };
}

function rejects(overrides, pattern) {
  assert.throws(() => projectRecord("paper-plane-lab", metadata(overrides)), pattern);
}

test("accepts the documented static project shape", () => {
  const result = projectRecord("paper-plane-lab", metadata());
  assert.equal(result.href, "./projects/paper-plane-lab/");
  assert.deepEqual(interactionTypes, [
    "camera", "file-upload", "keyboard", "passive", "pointer", "touch"
  ]);
});

test("keeps newly scaffolded project metadata compatible with validation", () => {
  const scaffold = scaffoldProjectMetadata("Paper Plane Lab", "2026-05-23");
  assert.doesNotThrow(() => projectRecord("paper-plane-lab", scaffold));
  assert.deepEqual(scaffold.interaction, ["passive"]);
});

test("reports malformed top-level metadata and generated field types clearly", () => {
  assert.throws(
    () => projectRecord("Paper Plane Lab", metadata()),
    /Project folders must use lowercase letters, numbers, and single hyphens/
  );
  assert.throws(
    () => projectRecord("paper-plane-lab", null),
    /needs a top-level metadata object/
  );
  assert.throws(
    () => projectRecord("paper-plane-lab", []),
    /needs a top-level metadata object/
  );
  rejects({ dateSource: 42 }, /needs a non-empty dateSource/);
});

test("rejects unknown and duplicate interactions", () => {
  rejects({ interaction: ["pointer", "voice"] }, /interaction must only use/);
  rejects({ interaction: ["pointer", "pointer"] }, /interaction values must be unique/);
});

test("requires real ISO calendar dates", () => {
  rejects({ date: "05/23/2026" }, /YYYY-MM-DD/);
  rejects({ date: "2026-02-29" }, /valid calendar date/);
  assert.doesNotThrow(() => projectRecord("leap-day", metadata({ date: "2024-02-29" })));
});

test("rejects blank and normalized duplicate tags", () => {
  rejects({ tags: ["science", " "] }, /non-empty strings/);
  rejects({ tags: ["Science", " science "] }, /unique after trimming and case normalization/);
});

test("rejects placeholders in published required copy", () => {
  rejects({ title: "TBD" }, /placeholder text/);
  rejects({ safety: { ...metadata().safety, notes: "TODO: explain risks" } }, /placeholder text/);
});

test("enforces static hosting and network dependency cross-fields", () => {
  rejects(
    { runtime: { ...metadata().runtime, requiresServer: true } },
    /static projects must set runtime.requiresServer to false/
  );
  rejects(
    { runtime: { ...metadata().runtime, networkAccess: "declared-external-dependency" } },
    /must list a dependency/
  );
  rejects(
    {
      runtime: {
        ...metadata().runtime,
        externalDependencies: [{ name: "Library", url: "https://example.com/lib.js", reason: "Rendering" }]
      }
    },
    /cannot list external dependencies/
  );
  rejects(
    {
      runtime: {
        ...metadata().runtime,
        networkAccess: "declared-external-dependency",
        externalDependencies: [{ name: "Library", url: "file:///lib.js", reason: "Rendering" }]
      }
    },
    /valid HTTP\(S\) URLs/
  );
  rejects(
    {
      runtime: {
        ...metadata().runtime,
        networkAccess: "declared-external-dependency",
        externalDependencies: [
          { name: "First", url: "https://EXAMPLE.com:443/lib.js", reason: "Rendering" },
          { name: "Second", url: "https://example.com/lib.js", reason: "Rendering" }
        ]
      }
    },
    /URLs must be unique/
  );
  assert.doesNotThrow(() => projectRecord("case-sensitive-paths", metadata({
    runtime: {
      ...metadata().runtime,
      networkAccess: "declared-external-dependency",
      externalDependencies: [
        { name: "Upper", url: "https://example.com/Lib.js", reason: "Rendering" },
        { name: "Lower", url: "https://example.com/lib.js", reason: "Rendering" }
      ]
    }
  })));
});

test("keeps entries and portfolio previews inside the project", () => {
  rejects({ entry: "../secret.html" }, /relative path inside the project folder/);
  rejects({ entry: "https://example.com/game" }, /relative path inside the project folder/);
  rejects(
    { portfolio: { featured: true, preview: "/preview.webp", technicalHighlights: ["Canvas"] } },
    /relative path inside the project folder/
  );
  const record = projectRecord("paper-plane-lab", metadata({
    portfolio: { featured: true, preview: "assets/preview.webp", technicalHighlights: ["Canvas"] }
  }));
  assert.equal(record.portfolio.preview, "./projects/paper-plane-lab/assets/preview.webp");
});

test("requires local project paths to resolve to regular files inside the project", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "kidzone-metadata-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = join(root, "paper-plane-lab");
  const outsideFile = join(root, "outside.html");
  await mkdir(join(projectRoot, "assets"), { recursive: true });
  await writeFile(join(projectRoot, "index.html"), "<!doctype html>");
  await writeFile(outsideFile, "private");
  await symlink(outsideFile, join(projectRoot, "escaped.html"));

  await assert.doesNotReject(() => assertProjectFile(projectRoot, "index.html", "entry"));
  await assert.rejects(
    () => assertProjectFile(projectRoot, "missing.html", "entry"),
    /entry does not exist/
  );
  await assert.rejects(
    () => assertProjectFile(projectRoot, "assets", "portfolio.preview"),
    /portfolio\.preview must refer to a file/
  );
  await assert.rejects(
    () => assertProjectFile(projectRoot, "escaped.html", "entry"),
    /entry must stay inside the project folder/
  );
});
