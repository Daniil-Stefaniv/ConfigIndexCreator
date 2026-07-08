import fs from "node:fs";
import path from "node:path";
import { resolveProjectPaths } from "./config.mjs";
import { copyFilePreserveTimes, ensureDir, relativePath, sha1File, walkFiles } from "./utils.mjs";
import { runIndex } from "./indexer.mjs";

export async function runMerge(options) {
  if (!options.target || !options.source) {
    throw new Error("merge requires --target and --source");
  }

  const target = resolveProjectPaths({ config: options.target, confRoot: options.targetConfRoot, indexRoot: options.indexRoot });
  const source = resolveProjectPaths({ config: options.source, confRoot: options.sourceConfRoot });
  const dryRun = Boolean(options.dryRun);
  const deleteMissing = Boolean(options.deleteMissing);
  const contentCompare = options.contentCompare !== false;

  ensureDir(target.configurationRoot);
  const stats = {
    sourceRoot: source.configurationRoot,
    targetRoot: target.configurationRoot,
    copied: 0,
    updated: 0,
    unchanged: 0,
    deleted: 0,
    scanned: 0,
    dryRun,
  };

  const seen = new Set();
  for (const sourceFile of walkFiles(source.configurationRoot, { excludeRoots: [source.indexRoot] })) {
    const rel = relativePath(source.configurationRoot, sourceFile);
    seen.add(rel);
    const targetFile = path.join(target.configurationRoot, rel.split("/").join(path.sep));
    stats.scanned += 1;
    const action = await compareFiles(sourceFile, targetFile, contentCompare);
    if (action === "unchanged") {
      stats.unchanged += 1;
      continue;
    }
    if (!dryRun) {
      copyFilePreserveTimes(sourceFile, targetFile);
    }
    if (action === "create") {
      stats.copied += 1;
    } else {
      stats.updated += 1;
    }
  }

  if (deleteMissing) {
    for (const targetFile of walkFiles(target.configurationRoot, { excludeRoots: [target.indexRoot] })) {
      const rel = relativePath(target.configurationRoot, targetFile);
      if (seen.has(rel)) {
        continue;
      }
      if (!dryRun) {
        fs.rmSync(targetFile, { force: true });
      }
      stats.deleted += 1;
    }
  }

  if (!dryRun) {
    const indexResult = await runIndex("update", {
      config: options.target,
      confRoot: options.targetConfRoot,
      indexRoot: options.indexRoot,
      pretty: options.pretty,
      force: false,
      progressEvery: options.progressEvery,
      checkpointEvery: options.checkpointEvery,
    });
    stats.index = indexResult.manifest.counts;
  }

  return { stats, target, source };
}

async function compareFiles(sourceFile, targetFile, contentCompare) {
  if (!fs.existsSync(targetFile)) {
    return "create";
  }
  const sourceStat = fs.statSync(sourceFile);
  const targetStat = fs.statSync(targetFile);
  if (sourceStat.size !== targetStat.size) {
    return "update";
  }
  if (Math.trunc(sourceStat.mtimeMs) === Math.trunc(targetStat.mtimeMs)) {
    return "unchanged";
  }
  if (!contentCompare) {
    return "update";
  }
  const [sourceHash, targetHash] = await Promise.all([sha1File(sourceFile), sha1File(targetFile)]);
  return sourceHash === targetHash ? "unchanged" : "update";
}
