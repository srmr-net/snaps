#!/usr/bin/env node

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

const imageExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
  ".svg"
]);

const playlistExtensions = new Set([".m3u", ".m3u8"]);

const mimeTypes = new Map([
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".m3u", "application/vnd.apple.mpegurl; charset=utf-8"],
  [".m3u8", "application/vnd.apple.mpegurl; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

const options = parseArgs(process.argv.slice(2));
const mediaRoot = path.resolve(options.root);

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = decodePathname(requestUrl.pathname);

    if (pathname === "/healthz") {
      return sendText(res, 200, "ok\n", "text/plain; charset=utf-8");
    }

    if (pathname === "/snaps.m3u8" || pathname === "/index.m3u8" || pathname === "/albums.m3u8") {
      return sendText(res, 200, await buildIndexPlaylist(), "application/vnd.apple.mpegurl; charset=utf-8");
    }

    if (pathname.startsWith("/albums/") && pathname.endsWith(".m3u8")) {
      const albumName = path.basename(pathname, ".m3u8");
      const relativeDir = albumName === "root" ? "" : decodeSegment(albumName);
      return sendText(
        res,
        200,
        await buildAlbumPlaylist(relativeDir),
        "application/vnd.apple.mpegurl; charset=utf-8"
      );
    }

    if (pathname.startsWith("/media/")) {
      await serveFile(res, mediaRoot, pathname.slice("/media/".length));
      return;
    }

    const publicPath = pathname === "/" ? "index.html" : pathname.slice(1);
    await serveFile(res, publicDir, publicPath);
  } catch (error) {
    if (error.statusCode === 404) {
      return sendText(res, 404, "Not found\n", "text/plain; charset=utf-8");
    }

    console.error(error);
    return sendText(res, 500, "Internal server error\n", "text/plain; charset=utf-8");
  }
});

server.listen(options.port, options.host, () => {
  const host = options.host === "0.0.0.0" ? "localhost" : options.host;
  console.log(`Snaps simple server`);
  console.log(`Media root: ${mediaRoot}`);
  console.log(`Open: http://${host}:${options.port}/`);
});

server.on("error", (error) => {
  console.error(`Failed to start server: ${error.message}`);
  process.exit(1);
});

function parseArgs(args) {
  const parsed = {
    host: "0.0.0.0",
    port: 7317,
    root: process.cwd()
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--host") {
      parsed.host = readValue(args, ++index, arg);
    } else if (arg === "--port" || arg === "-p") {
      parsed.port = Number(readValue(args, ++index, arg));
    } else if (arg === "--duration") {
      parsed.duration = Number(readValue(args, ++index, arg));
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      printHelp();
      process.exit(1);
    } else {
      parsed.root = arg;
    }
  }

  if (!Number.isInteger(parsed.port) || parsed.port < 1 || parsed.port > 65535) {
    console.error("--port must be an integer between 1 and 65535");
    process.exit(1);
  }

  if (parsed.duration !== undefined && (!Number.isFinite(parsed.duration) || parsed.duration <= 0)) {
    console.error("--duration must be a positive number of seconds");
    process.exit(1);
  }

  parsed.duration ??= 15;
  return parsed;
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value) {
    console.error(`${flag} requires a value`);
    process.exit(1);
  }
  return value;
}

function printHelp() {
  console.log(`Usage: node server.js [media-root] [--host 0.0.0.0] [--port 7317] [--duration 15]

Serves a browser Snaps slideshow client and generates playlists from image folders.

Examples:
  node server.js ~/Pictures
  node server.js ./albums --port 8080
`);
}

async function buildIndexPlaylist() {
  const entries = [];
  const rootItems = await readdir(mediaRoot, { withFileTypes: true });

  if (await directoryHasImages(mediaRoot)) {
    entries.push({
      title: "Root",
      url: "/albums/root.m3u8"
    });
  }

  for (const item of rootItems) {
    if (item.name.startsWith(".")) {
      continue;
    }

    const itemPath = path.join(mediaRoot, item.name);
    if (item.isDirectory() && await directoryHasImages(itemPath)) {
      entries.push({
        title: prettifyTitle(item.name),
        url: `/albums/${encodeSegment(item.name)}.m3u8`
      });
    } else if (item.isFile() && playlistExtensions.has(path.extname(item.name).toLowerCase())) {
      entries.push({
        title: prettifyTitle(path.basename(item.name, path.extname(item.name))),
        url: `/media/${encodePath(item.name)}`
      });
    }
  }

  return [
    "#EXTM3U",
    "#EXT-X-SNAPS-TYPE:INDEX",
    ...entries.flatMap((entry) => [`#EXTINF:-1,${escapeExtInfTitle(entry.title)}`, entry.url]),
    ""
  ].join("\n");
}

async function buildAlbumPlaylist(relativeDir) {
  const albumDir = resolveInside(mediaRoot, relativeDir);
  const entries = await listImages(albumDir);
  const albumBase = relativeDir ? `${relativeDir}/` : "";

  return [
    "#EXTM3U",
    "#EXT-X-SNAPS-TYPE:ALBUM",
    `#EXT-X-SNAPS-DEFAULT-DURATION:${options.duration}`,
    ...entries.flatMap((entry) => [
      `#EXTINF:-1,${escapeExtInfTitle(path.basename(entry, path.extname(entry)))}`,
      `/media/${encodePath(albumBase + entry)}`
    ]),
    ""
  ].join("\n");
}

async function listImages(directory) {
  const items = await readdir(directory, { withFileTypes: true });
  return items
    .filter((item) => item.isFile() && imageExtensions.has(path.extname(item.name).toLowerCase()))
    .map((item) => item.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

async function directoryHasImages(directory) {
  try {
    const items = await readdir(directory, { withFileTypes: true });
    return items.some((item) => item.isFile() && imageExtensions.has(path.extname(item.name).toLowerCase()));
  } catch {
    return false;
  }
}

async function serveFile(res, root, relativePath) {
  const filePath = resolveInside(root, relativePath);
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    throw Object.assign(new Error("Not found"), { statusCode: 404 });
  }

  res.writeHead(200, {
    "Content-Length": fileStat.size,
    "Content-Type": mimeTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream",
    "Cache-Control": root === publicDir ? "no-cache" : "public, max-age=60"
  });
  const stream = createReadStream(filePath);
  stream.on("error", (error) => {
    console.error(`Failed to read ${filePath}: ${error.message}`);
    if (!res.headersSent) {
      sendText(res, 404, "Not found\n", "text/plain; charset=utf-8");
    } else {
      res.destroy(error);
    }
  });
  stream.pipe(res);
}

function sendText(res, statusCode, body, contentType) {
  res.writeHead(statusCode, {
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": contentType,
    "Cache-Control": "no-cache"
  });
  res.end(body);
}

function resolveInside(root, relativePath) {
  const resolved = path.resolve(root, relativePath || ".");
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw Object.assign(new Error("Not found"), { statusCode: 404 });
  }
  return resolved;
}

function decodePathname(pathname) {
  try {
    return decodeURI(pathname);
  } catch {
    throw Object.assign(new Error("Not found"), { statusCode: 404 });
  }
}

function encodePath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function encodeSegment(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeSegment(value) {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    throw Object.assign(new Error("Not found"), { statusCode: 404 });
  }
}

function prettifyTitle(value) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeExtInfTitle(value) {
  return value.replace(/\r?\n/g, " ").replaceAll(",", " ");
}
