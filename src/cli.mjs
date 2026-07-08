import { runIndex } from "./indexer.mjs";
import { runMerge } from "./merge.mjs";

const HELP = `
ConfigIndexCreator

Usage:
  .\\config-indexer.cmd primary --config <path> [--conf-root <path>] [--index-root <path>]
  .\\config-indexer.cmd update  --config <path> [--conf-root <path>] [--index-root <path>] [--force]
  .\\config-indexer.cmd merge   --target <path> --source <path> [--delete-missing] [--dry-run]

Modes:
  primary   Build indexes from source files and recreate the incremental cache.
  update    Reuse Index/.cache for unchanged XML/BSL files and rebuild aggregate indexes.
  merge     Copy changes from source configuration dump to target, then run update.

Options:
  --config <path>             Configuration workspace root for primary/update.
  --conf-root <path>          Actual dump folder relative to --config, for example AllConf.
  --index-root <path>         Output folder. Default: <config>/Index.
  --target <path>             Target configuration workspace for merge.
  --source <path>             Source configuration workspace for merge.
  --target-conf-root <path>   Actual target dump folder relative to --target.
  --source-conf-root <path>   Actual source dump folder relative to --source.
  --delete-missing            During merge, delete target files missing in source.
  --dry-run                   Show merge stats without copying/deleting or indexing.
  --no-content-compare        During merge, copy same-size timestamp-different files without hashing.
  --pretty                    Pretty JSON output. Easier to read, larger and slower.
  --force                     In update mode, ignore cache and parse all files.
  --progress-every <number>   Progress log interval by scanned files. Default: 5000.
  --help                      Show this help.

Runtime:
  The Windows launcher uses local Node.js from tools/node/win-x64/node.exe.
`;

export async function main(argv) {
  const command = argv[0];
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(HELP.trim());
    return;
  }

  const options = parseArgs(argv.slice(1));
  if (command === "primary" || command === "init" || command === "index") {
    const result = await runIndex("primary", options);
    printIndexSummary(result);
    return;
  }
  if (command === "update") {
    const result = await runIndex("update", options);
    printIndexSummary(result);
    return;
  }
  if (command === "merge") {
    const result = await runMerge(options);
    printMergeSummary(result);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = toCamel(arg.slice(2));
    if (["pretty", "force", "deleteMissing", "dryRun"].includes(key)) {
      options[key] = true;
      continue;
    }
    if (key === "noContentCompare") {
      options.contentCompare = false;
      continue;
    }
    const value = argv[i + 1];
    if (value == null || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    i += 1;
    if (key === "progressEvery") {
      options[key] = Number(value);
    } else {
      options[key] = value;
    }
  }
  return options;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function printIndexSummary(result) {
  const counts = result.manifest.counts;
  const stats = result.manifest.stats;
  console.log("Index generated");
  console.log(`  Configuration: ${result.paths.configurationRoot}`);
  console.log(`  Index: ${result.paths.indexRoot}`);
  console.log(`  Objects: ${counts.objects}`);
  console.log(`  Forms: ${counts.forms}`);
  console.log(`  Commands: ${counts.commands}`);
  console.log(`  Modules: ${counts.modules}`);
  console.log(`  Procedures: ${counts.procedures}`);
  console.log(`  Call edges: ${counts.callEdges}`);
  console.log(`  References: ${counts.references}`);
  console.log(`  Files scanned: ${stats.scannedFiles}, parsed: ${stats.parsedFiles}, cache hits: ${stats.cacheHits}`);
}

function printMergeSummary(result) {
  const stats = result.stats;
  console.log("Merge completed");
  console.log(`  Source: ${stats.sourceRoot}`);
  console.log(`  Target: ${stats.targetRoot}`);
  console.log(`  Scanned: ${stats.scanned}`);
  console.log(`  Created: ${stats.copied}`);
  console.log(`  Updated: ${stats.updated}`);
  console.log(`  Unchanged: ${stats.unchanged}`);
  console.log(`  Deleted: ${stats.deleted}`);
  if (stats.dryRun) {
    console.log("  Dry run: index update was not started");
  } else if (stats.index) {
    console.log(`  Reindexed objects: ${stats.index.objects}, procedures: ${stats.index.procedures}`);
  }
}
