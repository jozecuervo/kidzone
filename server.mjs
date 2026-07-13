import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = fileURLToPath(new URL(".", import.meta.url));
const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const configuredBasePath = process.env.SITE_BASE_PATH ?? "/";
const basePath = `/${configuredBasePath.replace(/^\/+|\/+$/g, "")}`.replace(/^\/$/, "");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webm", "video/webm"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end(body);
}

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl ?? "/", "http://kidzone.local");
  let pathname = decodeURIComponent(url.pathname);

  if (basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))) {
    pathname = pathname.slice(basePath.length) || "/";
  }

  const filePath = resolve(siteRoot, `.${pathname}`);
  const pathFromRoot = relative(siteRoot, filePath);

  if (pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === "..") {
    return null;
  }

  return filePath;
}

async function indexFilePath(filePath) {
  const fileStats = await stat(filePath);

  if (fileStats.isDirectory()) {
    return resolve(filePath, "index.html");
  }

  return filePath;
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  let filePath;

  try {
    filePath = resolveRequestPath(request.url);
  } catch {
    sendText(response, 400, "Bad request\n");
    return;
  }

  if (!filePath) {
    sendText(response, 403, "Forbidden\n");
    return;
  }

  try {
    filePath = await indexFilePath(filePath);
    const fileStats = await stat(filePath);

    if (!fileStats.isFile()) {
      sendText(response, 404, "Not found\n");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Length": fileStats.size,
      "Content-Type":
        contentTypes.get(extname(filePath).toLowerCase()) ??
        "application/octet-stream"
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      sendText(response, 404, "Not found\n");
      return;
    }

    console.error(error);
    sendText(response, 500, "Server error\n");
  }
});

server.listen(port, host, () => {
  console.log(`Kidzone static server listening at http://${host}:${port}${basePath}/`);
});
