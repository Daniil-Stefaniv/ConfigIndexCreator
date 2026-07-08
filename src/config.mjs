import fs from "node:fs";
import path from "node:path";
import { relativePath, toPosix } from "./utils.mjs";

const DEFAULT_DUMP_DIRS = [
  "AllConf",
  "ALConf",
  "Conf",
  "Config",
  "Configuration",
  "configuration",
  "src",
];

const EXTENSION_ROOT_DIRS = [
  "ExtentionsConf",
  "ExtensionsConf",
  "Extentions",
  "Extensions",
];

function existsDir(value) {
  try {
    return fs.statSync(value).isDirectory();
  } catch {
    return false;
  }
}

function existsFile(value) {
  try {
    return fs.statSync(value).isFile();
  } catch {
    return false;
  }
}

function hasDumpSigns(dir) {
  return (
    existsDir(path.join(dir, "MainConf")) ||
    existsFile(path.join(dir, "Configuration.xml")) ||
    existsFile(path.join(dir, "ConfigDumpInfo.xml"))
  );
}

export function detectConfigurationRoot(workspaceRoot) {
  const root = path.resolve(workspaceRoot);
  if (hasDumpSigns(root)) {
    return root;
  }

  for (const candidateName of DEFAULT_DUMP_DIRS) {
    const candidate = path.join(root, candidateName);
    if (hasDumpSigns(candidate)) {
      return candidate;
    }
  }

  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return root;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = path.join(root, entry.name);
    if (hasDumpSigns(candidate)) {
      return candidate;
    }
  }
  return root;
}

export function resolveProjectPaths(options) {
  const workspaceRoot = path.resolve(options.config || ".");
  const configurationRoot = options.confRoot
    ? path.resolve(workspaceRoot, options.confRoot)
    : detectConfigurationRoot(workspaceRoot);
  const indexRoot = path.resolve(options.indexRoot || path.join(workspaceRoot, "Index"));
  return { workspaceRoot, configurationRoot, indexRoot };
}

export function collectSourceRoots(configurationRoot, workspaceRoot) {
  const sources = [];
  const mainConf = path.join(configurationRoot, "MainConf");
  if (existsDir(mainConf)) {
    sources.push(sourceRecord("MainConf", "main", mainConf, workspaceRoot, configurationRoot));
  } else if (existsFile(path.join(configurationRoot, "Configuration.xml"))) {
    sources.push(sourceRecord("MainConf", "main", configurationRoot, workspaceRoot, configurationRoot));
  }

  for (const extensionRootName of EXTENSION_ROOT_DIRS) {
    const extensionRoot = path.join(configurationRoot, extensionRootName);
    if (!existsDir(extensionRoot)) {
      continue;
    }
    const folders = fs
      .readdirSync(extensionRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
    for (const folder of folders) {
      const sourcePath = path.join(extensionRoot, folder.name);
      sources.push(
        sourceRecord(
          `Extension:${folder.name}`,
          "extension",
          sourcePath,
          workspaceRoot,
          configurationRoot,
          {
            folder: folder.name,
            rootFolder: extensionRootName,
            folderType: extensionFolderType(folder.name),
          },
        ),
      );
    }
  }
  return sources.sort((a, b) => b.absolutePath.length - a.absolutePath.length);
}

function sourceRecord(id, kind, sourcePath, workspaceRoot, configurationRoot, extension = null) {
  return {
    id,
    kind,
    extension,
    path: toPosix(path.relative(configurationRoot, sourcePath) || "."),
    relativePath: relativePath(workspaceRoot, sourcePath),
    absolutePath: path.resolve(sourcePath),
  };
}

function extensionFolderType(folder) {
  if (folder.startsWith("EF") || folder.endsWith("_repair")) {
    return "repair";
  }
  if (folder.endsWith("_adapt")) {
    return "adaptation";
  }
  return "extension";
}

export function sourceForPath(file, sources) {
  const absolute = path.resolve(file);
  return sources.find((source) => {
    const rel = path.relative(source.absolutePath, absolute);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  });
}
