import crypto from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";

export const SCHEMA = "1c-universal-static-index/v1";
export const PARSER_VERSION = 2;

export function utcNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function normalizePath(value) {
  return path.resolve(value);
}

export function toPosix(value) {
  return value.split(path.sep).join("/");
}

export function relativePath(root, file) {
  const rel = path.relative(path.resolve(root), path.resolve(file));
  return toPosix(rel || ".");
}

export function stableHash(...parts) {
  return crypto
    .createHash("sha1")
    .update(parts.map((part) => (part == null ? "" : String(part))).join("|"))
    .digest("hex")
    .slice(0, 24);
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJsonIfExists(file, fallback = null) {
  if (!fs.existsSync(file)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJsonAtomic(file, data, pretty = false) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const text = JSON.stringify(data, null, pretty ? 2 : 0);
  fs.writeFileSync(temp, text, "utf8");
  fs.renameSync(temp, file);
}

export async function writeJsonArrayFile(file, scalarFields, arrayName, items, options = {}) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const pretty = Boolean(options.pretty);
  const mapItem = options.mapItem || ((item) => item);
  const stream = fs.createWriteStream(temp, { encoding: "utf8" });
  const errorPromise = once(stream, "error").then(([error]) => {
    throw error;
  });
  let count = 0;

  const write = async (chunk) => {
    if (!stream.write(chunk)) {
      await Promise.race([once(stream, "drain"), errorPromise]);
    }
  };

  await write("{");
  let firstField = true;
  for (const [key, value] of Object.entries(scalarFields)) {
    if (!firstField) {
      await write(",");
    }
    firstField = false;
    await write(`${JSON.stringify(key)}:${JSON.stringify(value, null, pretty ? 2 : 0)}`);
  }
  if (!firstField) {
    await write(",");
  }
  await write(`${JSON.stringify(arrayName)}:[`);
  let firstItem = true;
  for await (const item of items) {
    if (!firstItem) {
      await write(",");
    }
    firstItem = false;
    const mapped = mapItem(item);
    await write(JSON.stringify(mapped, null, pretty ? 2 : 0));
    count += 1;
  }
  await write("]}");

  stream.end();
  await Promise.race([once(stream, "finish"), errorPromise]);
  fs.renameSync(temp, file);
  return count;
}

export async function sha1File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha1");
    const stream = fs.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export function fileState(file, root) {
  const stat = fs.statSync(file);
  return {
    path: relativePath(root, file),
    absolutePath: path.resolve(file),
    size: stat.size,
    mtimeMs: Math.trunc(stat.mtimeMs),
  };
}

export function sameFileState(left, right) {
  return (
    left &&
    right &&
    left.size === right.size &&
    Math.trunc(left.mtimeMs) === Math.trunc(right.mtimeMs) &&
    left.parserVersion === right.parserVersion
  );
}

export function decodeTextFile(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  for (const encoding of ["utf-8", "windows-1251", "utf-16le"]) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(bytes);
    } catch {
      // Try the next likely 1C dump encoding.
    }
  }
  return new TextDecoder("utf-8").decode(bytes);
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function xmlDecode(value) {
  if (!value) {
    return "";
  }
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

export function isSubPath(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function isIgnoredDirectory(name) {
  return (
    name === ".git" ||
    name === ".svn" ||
    name === ".hg" ||
    name === "Index" ||
    name === "__pycache__" ||
    name === "node_modules"
  );
}

export function* walkFiles(root, options = {}) {
  const include = options.includeExtensions || new Set();
  const excludeRoots = (options.excludeRoots || []).map((item) => path.resolve(item));
  const stack = [path.resolve(root)];

  while (stack.length) {
    const dir = stack.pop();
    if (excludeRoots.some((excluded) => isSubPath(excluded, dir))) {
      continue;
    }

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, "ru"));

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!isIgnoredDirectory(entry.name)) {
          stack.push(fullPath);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!include.size || include.has(path.extname(entry.name).toLowerCase())) {
        yield fullPath;
      }
    }
  }
}

export function copyFilePreserveTimes(source, target) {
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
  const stat = fs.statSync(source);
  fs.utimesSync(target, stat.atime, stat.mtime);
}
