import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkProjectIndex } from "./update-project-index.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const projectsRoot = join(repoRoot, "projects");
const skippedDirectories = new Set([".git", "node_modules"]);
const codeExtensions = new Set([".css", ".html", ".js", ".mjs"]);
const localHosts = new Set(["127.0.0.1", "localhost", "kidzone.local"]);
const ignoredExternalHosts = new Set(["www.w3.org"]);

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory() && !skippedDirectories.has(entry.name)) {
      files.push(...await javascriptFiles(entryPath));
    } else if (entry.isFile() && [".js", ".mjs"].includes(extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

async function projectDirectories() {
  const entries = await readdir(projectsRoot, { withFileTypes: true });

  return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"));
}

async function codeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory() && !skippedDirectories.has(entry.name)) {
      files.push(...await codeFiles(entryPath));
    } else if (entry.isFile() && codeExtensions.has(extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

function externalUrls(text) {
  return [...text.matchAll(/https?:\/\/[^\s"'<>)]*/g)]
    .map((match) => match[0].replace(/[.,;]+$/, ""))
    .filter((url) => {
      let parsed;

      try {
        parsed = new URL(url);
      } catch {
        return false;
      }

      return !localHosts.has(parsed.hostname) && !ignoredExternalHosts.has(parsed.hostname);
    });
}

function assertDeclaredExternalUrls(slug, metadata, file, text) {
  const declaredUrls = new Set(
    metadata.runtime.externalDependencies.map((dependency) => dependency.url)
  );

  for (const url of externalUrls(text)) {
    if (!declaredUrls.has(url)) {
      throw new Error(
        `${slug} references undeclared external URL ${url} in ${file}. Add it to runtime.externalDependencies.`
      );
    }
  }
}

function assertSensitiveApis(slug, metadata, file, text) {
  if (
    /navigator\.mediaDevices|getUserMedia/.test(text) &&
    !metadata.interaction.includes("camera")
  ) {
    throw new Error(`${slug} uses camera APIs in ${file} but interaction does not include camera.`);
  }

  if (/type=["']file["']/.test(text) && !metadata.interaction.includes("file-upload")) {
    throw new Error(`${slug} uses file upload in ${file} but interaction does not include file-upload.`);
  }

  if (
    /localStorage|sessionStorage|indexedDB|document\.cookie/.test(text) &&
    !metadata.runtime.storesData
  ) {
    throw new Error(`${slug} uses browser storage in ${file} but runtime.storesData is false.`);
  }
}

async function checkProjectRiskDeclarations() {
  for (const directory of await projectDirectories()) {
    const slug = directory.name;
    const projectRoot = join(projectsRoot, slug);
    const metadata = JSON.parse(await readFile(join(projectRoot, "project.json"), "utf8"));

    for (const file of await codeFiles(projectRoot)) {
      const text = await readFile(file, "utf8");

      assertDeclaredExternalUrls(slug, metadata, file, text);
      assertSensitiveApis(slug, metadata, file, text);
    }
  }
}

for (const file of await javascriptFiles(repoRoot)) {
  execFileSync(process.execPath, ["--check", file], {
    stdio: "inherit"
  });
}

await checkProjectIndex();
await checkProjectRiskDeclarations();

console.log("Kidzone checks passed.");
