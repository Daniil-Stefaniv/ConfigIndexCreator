import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { collectSourceRoots, resolveProjectPaths } from "./config.mjs";
import { buildCallResolver, parseFile } from "./parser.mjs";
import {
  PARSER_VERSION,
  SCHEMA,
  ensureDir,
  fileState,
  readJsonIfExists,
  relativePath,
  sameFileState,
  stableHash,
  utcNow,
  walkFiles,
  writeJsonArrayFile,
  writeJsonAtomic,
} from "./utils.mjs";

export async function runIndex(mode, options = {}) {
  const paths = resolveProjectPaths(options);
  ensureDir(paths.indexRoot);
  const cacheRoot = path.join(paths.indexRoot, ".cache");
  const fileCacheRoot = path.join(cacheRoot, "files");
  ensureDir(fileCacheRoot);

  const sources = collectSourceRoots(paths.configurationRoot, paths.workspaceRoot);
  if (!sources.length) {
    throw new Error(`Configuration sources were not found in ${paths.configurationRoot}`);
  }

  const cacheManifestFile = path.join(cacheRoot, "file-manifest.json");
  const partialManifestFile = path.join(cacheRoot, "file-manifest.partial.json");
  const finalCacheManifest = readJsonIfExists(cacheManifestFile, null);
  const partialCacheManifest = readJsonIfExists(partialManifestFile, null);
  const previousManifest =
    mode === "update"
      ? finalCacheManifest || partialCacheManifest
      : options.resumeCache
        ? finalCacheManifest || partialCacheManifest
        : null;
  const previousFiles = new Map((previousManifest?.files || []).map((entry) => [entry.path, entry]));
  const useCache = (mode === "update" || options.resumeCache) && !options.force;
  const allowUnverifiedCache = Boolean(options.resumeCache && !previousManifest);

  const records = {
    objects: [],
    forms: [],
    commands: [],
    modules: [],
    procedures: [],
    references: [],
    errors: [],
  };
  const fileManifest = [];
  const stats = {
    scannedFiles: 0,
    parsedFiles: 0,
    cacheHits: 0,
    cacheMisses: 0,
    recoveredCacheHits: 0,
    skippedFiles: 0,
  };

  const includeExtensions = new Set([".xml", ".bsl"]);
  const files = walkFiles(paths.configurationRoot, {
    includeExtensions,
    excludeRoots: [paths.indexRoot],
  });
  const checkpointEvery = positiveNumber(options.checkpointEvery) || positiveNumber(options.progressEvery) || 5000;
  const spill = createRecordSpill(paths);

  try {
    for (const file of files) {
      stats.scannedFiles += 1;
      const state = {
        ...fileState(file, paths.configurationRoot),
        parserVersion: PARSER_VERSION,
        cachePath: cachePathFor(file, paths.configurationRoot),
      };
      const cacheFile = path.join(fileCacheRoot, state.cachePath);
      const previous = previousFiles.get(state.path);
      let parsed = null;

      if (useCache && previous && sameFileState(state, previous) && fs.existsSync(cacheFile)) {
        parsed = readJsonIfExists(cacheFile, null);
        if (parsed) {
          stats.cacheHits += 1;
        }
      } else if (allowUnverifiedCache && fs.existsSync(cacheFile)) {
        parsed = readJsonIfExists(cacheFile, null);
        if (parsed && parsed.file === state.path) {
          stats.cacheHits += 1;
          stats.recoveredCacheHits += 1;
        } else {
          parsed = null;
        }
      }

      if (!parsed) {
        try {
          parsed = parseFile(file, {
            workspaceRoot: paths.workspaceRoot,
            configurationRoot: paths.configurationRoot,
            indexRoot: paths.indexRoot,
            sources,
          });
        } catch (error) {
          parsed = {
            file: relativePath(paths.configurationRoot, file),
            kind: path.extname(file).slice(1).toLowerCase(),
            objects: [],
            forms: [],
            commands: [],
            modules: [],
            procedures: [],
            references: [],
            errors: [{ reason: `${error.name}: ${error.message}` }],
          };
        }
        writeJsonAtomic(cacheFile, parsed, false);
        stats.parsedFiles += 1;
        stats.cacheMisses += 1;
      }

      await appendParsed(records, parsed, spill);
      fileManifest.push(state);

      if (checkpointEvery && stats.scannedFiles % checkpointEvery === 0) {
        writeCacheManifest(partialManifestFile, paths, fileManifest, stats, false);
      }

      if (stats.scannedFiles % Number(options.progressEvery || 5000) === 0) {
        console.log(
          `Indexed files: ${stats.scannedFiles} (parsed ${stats.parsedFiles}, cache ${stats.cacheHits})`,
        );
      }
    }

    writeCacheManifest(partialManifestFile, paths, fileManifest, stats, false);
    await spill.close();

    attachRecords(records);
    const outputFiles = await writeIndexes(records, paths, sources, mode, options, spill);
    const counts = countRecords(records, outputFiles);

    const manifest = {
      schema: SCHEMA,
      parserVersion: PARSER_VERSION,
      generatedAt: utcNow(),
      mode,
      workspaceRoot: paths.workspaceRoot,
      configurationRoot: paths.configurationRoot,
      indexRoot: paths.indexRoot,
      sources,
      counts,
      stats,
      files: outputFiles.files,
      cache: {
        manifest: cacheManifestFile,
        partialManifest: partialManifestFile,
        files: fileCacheRoot,
      },
    };

    writeJsonAtomic(path.join(paths.indexRoot, "index_Manifest.json"), manifest, Boolean(options.pretty));
    writeCacheManifest(cacheManifestFile, paths, fileManifest, stats, true, manifest.generatedAt);

    return { paths, manifest };
  } finally {
    await spill.close();
    spill.cleanup();
  }
}

async function appendParsed(records, parsed, spill) {
  records.objects.push(...(parsed.objects || []));
  records.forms.push(...(parsed.forms || []));
  records.commands.push(...(parsed.commands || []));
  records.modules.push(...(parsed.modules || []));
  for (const procedure of parsed.procedures || []) {
    await spill.addProcedure(procedure);
    records.procedures.push(compactProcedure(procedure));
  }
  records.references.push(...(parsed.references || []));
  records.errors.push(...(parsed.errors || []).map((error) => ({ file: parsed.file, ...error })));
}

function compactProcedure(procedure) {
  const { calls, metadataReferences, ...compact } = procedure;
  return {
    ...compact,
    callsCount: calls?.length || 0,
    metadataReferencesCount: metadataReferences?.length || 0,
  };
}

function positiveNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function writeCacheManifest(file, paths, files, stats, complete, generatedAt = utcNow()) {
  writeJsonAtomic(
    file,
    {
      schema: SCHEMA,
      parserVersion: PARSER_VERSION,
      generatedAt,
      complete: Boolean(complete),
      configurationRoot: paths.configurationRoot,
      files,
      stats,
    },
    false,
  );
}

function createRecordSpill(paths) {
  const root = path.join(paths.indexRoot, ".cache", "spill", `${process.pid}-${Date.now()}`);
  ensureDir(root);
  const callsFile = path.join(root, "procedure-calls.ndjson");
  const procedureRefsFile = path.join(root, "procedure-references.ndjson");
  const callWriter = createJsonLineWriter(callsFile);
  const procedureRefWriter = createJsonLineWriter(procedureRefsFile);

  let closed = false;
  const spill = {
    root,
    callsFile,
    procedureRefsFile,
    callRecords: 0,
    callItems: 0,
    procedureReferenceRecords: 0,
    procedureReferenceItems: 0,
    async addProcedure(procedure) {
      const calls = procedure.calls || [];
      if (calls.length) {
        await callWriter.write({ procedureId: procedure.id, calls });
        spill.callRecords += 1;
        spill.callItems += calls.length;
      }

      const metadataReferences = procedure.metadataReferences || [];
      if (metadataReferences.length) {
        await procedureRefWriter.write({ procedureId: procedure.id, metadataReferences });
        spill.procedureReferenceRecords += 1;
        spill.procedureReferenceItems += metadataReferences.length;
      }
    },
    async close() {
      if (closed) {
        return;
      }
      await Promise.all([callWriter.close(), procedureRefWriter.close()]);
      closed = true;
    },
    cleanup() {
      if (!closed) {
        return;
      }
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
  return spill;
}

function createJsonLineWriter(file) {
  ensureDir(path.dirname(file));
  const stream = fs.createWriteStream(file, { encoding: "utf8" });
  let closed = false;
  let streamError = null;
  stream.on("error", (error) => {
    streamError = error;
  });

  return {
    async write(value) {
      if (closed) {
        throw new Error(`Cannot write to closed spill file: ${file}`);
      }
      if (streamError) {
        throw streamError;
      }
      const line = `${JSON.stringify(value)}\n`;
      if (!stream.write(line)) {
        await waitForStreamEvent(stream, "drain");
      }
      if (streamError) {
        throw streamError;
      }
    },
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      if (streamError) {
        throw streamError;
      }
      stream.end();
      await waitForStreamEvent(stream, "finish");
      if (streamError) {
        throw streamError;
      }
    },
  };
}

function waitForStreamEvent(stream, eventName) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      stream.off(eventName, onEvent);
      stream.off("error", onError);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };

    stream.once(eventName, onEvent);
    stream.once("error", onError);
  });
}

async function* readJsonLines(file) {
  if (!fs.existsSync(file)) {
    return;
  }
  const input = fs.createReadStream(file, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      yield JSON.parse(trimmed);
    }
  }
}

function cachePathFor(file, configurationRoot) {
  const rel = relativePath(configurationRoot, file);
  return `${stableHash(rel)}.json`;
}

function attachRecords(records) {
  const objectMap = new Map();
  for (const object of records.objects) {
    object.forms = object.forms || [];
    object.commands = object.commands || [];
    object.modules = object.modules || [];
    object.procedures = object.procedures || [];
    objectMap.set(objectKey(object.source, object.objectType, object.name), object);
  }

  for (const form of records.forms) {
    const object = objectMap.get(objectKey(form.source, form.ownerType, form.ownerName));
    if (object) {
      object.forms.push({
        id: form.id,
        name: form.name,
        path: form.path,
        eventsCount: form.events?.length || 0,
      });
    }
  }

  for (const command of records.commands) {
    const object = objectMap.get(objectKey(command.source, command.ownerType, command.ownerName));
    if (object) {
      object.commands.push({
        id: command.id,
        name: command.name,
        path: command.path,
      });
    }
  }

  const procCountsByModule = new Map();
  for (const proc of records.procedures) {
    procCountsByModule.set(proc.moduleId, (procCountsByModule.get(proc.moduleId) || 0) + 1);
    const object = objectMap.get(objectKey(proc.source, proc.ownerType, proc.ownerName));
    if (object) {
      object.procedures.push({
        id: proc.id,
        name: proc.name,
        moduleId: proc.moduleId,
        moduleKind: proc.moduleKind,
        startLine: proc.startLine,
        endLine: proc.endLine,
        export: proc.export,
        callsCount: proc.callsCount ?? proc.calls?.length ?? 0,
      });
    }
  }

  for (const module of records.modules) {
    module.proceduresCount = procCountsByModule.get(module.id) || 0;
    const object = objectMap.get(objectKey(module.source, module.ownerType, module.ownerName));
    if (object) {
      object.modules.push({
        id: module.id,
        moduleKind: module.moduleKind,
        moduleName: module.moduleName,
        path: module.path,
        proceduresCount: module.proceduresCount,
      });
    }
  }
}

function objectKey(source, type, name) {
  return `${source || ""}|${type || ""}|${name || ""}`;
}

async function writeIndexes(records, paths, sources, mode, options, spill) {
  const pretty = Boolean(options.pretty);
  const files = {};
  const write = (name, data) => {
    const file = path.join(paths.indexRoot, name);
    writeJsonAtomic(file, data, pretty);
    files[name] = file;
  };

  const byType = groupBy(records.objects, (object) => object.objectType || "Unknown");
  for (const [objectType, objects] of [...byType.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    write(`index_${objectType}.json`, {
      schema: SCHEMA,
      generatedAt: utcNow(),
      objectType,
      objects,
    });
  }

  await writeJsonArrayFile(
    path.join(paths.indexRoot, "index_AllObjects.json"),
    { schema: SCHEMA, generatedAt: utcNow() },
    "objects",
    records.objects,
    { pretty },
  );
  files["index_AllObjects.json"] = path.join(paths.indexRoot, "index_AllObjects.json");

  write("index_Forms.json", {
    schema: SCHEMA,
    generatedAt: utcNow(),
    forms: records.forms,
  });
  write("index_Commands.json", {
    schema: SCHEMA,
    generatedAt: utcNow(),
    commands: records.commands,
  });
  write("index_Modules.json", {
    schema: SCHEMA,
    generatedAt: utcNow(),
    modules: records.modules,
  });

  await writeJsonArrayFile(
    path.join(paths.indexRoot, "index_Procedures.json"),
    { schema: SCHEMA, generatedAt: utcNow() },
    "procedures",
    records.procedures,
    {
      pretty,
      mapItem: (proc) => ({
        ...proc,
        callsCount: proc.callsCount ?? proc.calls?.length ?? 0,
        metadataReferencesCount: proc.metadataReferencesCount ?? proc.metadataReferences?.length ?? 0,
        calls: undefined,
        metadataReferences: undefined,
      }),
    },
  );
  files["index_Procedures.json"] = path.join(paths.indexRoot, "index_Procedures.json");

  const procedureById = new Map(records.procedures.map((procedure) => [procedure.id, procedure]));
  const references = await writeReferences(
    path.join(paths.indexRoot, "index_References.json"),
    records,
    spill,
    pretty,
    procedureById,
  );
  files["index_References.json"] = path.join(paths.indexRoot, "index_References.json");

  const callEdges = await writeCallGraph(
    path.join(paths.indexRoot, "index_CallGraph.json"),
    records,
    spill,
    pretty,
    procedureById,
  );
  files["index_CallGraph.json"] = path.join(paths.indexRoot, "index_CallGraph.json");

  const extensionTransitions = buildExtensionTransitions(records);
  write("index_ExtensionTransitions.json", {
    schema: SCHEMA,
    generatedAt: utcNow(),
    transitions: extensionTransitions,
  });

  if (records.errors.length) {
    write("index_Errors.json", {
      schema: SCHEMA,
      generatedAt: utcNow(),
      errors: records.errors,
    });
  }

  return { files, callEdges, references, mode, sources };
}

async function writeReferences(file, records, spill, pretty, procedureById) {
  async function* references() {
    for (const object of records.objects) {
      for (const ref of object.references || []) {
        yield {
          kind: ref.kind || "object_reference",
          fromSource: object.source,
          fromObjectType: object.objectType,
          fromObjectName: object.name,
          fromFullName: object.fullName,
          fromPath: object.path,
          ...ref,
        };
      }
    }
    for (const form of records.forms) {
      for (const ref of form.metadataReferences || []) {
        yield {
          kind: ref.kind || "form_reference",
          fromSource: form.source,
          fromFormId: form.id,
          fromOwnerType: form.ownerType,
          fromOwnerName: form.ownerName,
          fromPath: form.path,
          ...ref,
        };
      }
    }
    for (const command of records.commands) {
      for (const ref of command.typeReferences || []) {
        yield {
          kind: "command_type",
          fromSource: command.source,
          fromCommandId: command.id,
          fromOwnerType: command.ownerType,
          fromOwnerName: command.ownerName,
          fromPath: command.path,
          ...ref,
        };
      }
    }
    for await (const entry of readJsonLines(spill.procedureRefsFile)) {
      const proc = procedureById.get(entry.procedureId);
      if (!proc) {
        continue;
      }
      for (const ref of entry.metadataReferences || []) {
        yield {
          kind: ref.kind || "bsl_reference",
          fromSource: proc.source,
          fromProcedureId: proc.id,
          fromModuleId: proc.moduleId,
          fromOwnerType: proc.ownerType,
          fromOwnerName: proc.ownerName,
          fromPath: proc.path,
          ...ref,
        };
      }
    }
  }

  return writeJsonArrayFile(file, { schema: SCHEMA, generatedAt: utcNow() }, "references", references(), { pretty });
}

async function writeCallGraph(file, records, spill, pretty, procedureById) {
  const resolver = buildCallResolver(records.modules, records.procedures);
  async function* edges() {
    for await (const entry of readJsonLines(spill.callsFile)) {
      const proc = procedureById.get(entry.procedureId);
      if (!proc) {
        continue;
      }
      for (const call of entry.calls || []) {
        const targets = resolver.resolve(call, proc);
        yield {
          fromProcedureId: proc.id,
          fromModuleId: proc.moduleId,
          fromSource: proc.source,
          fromSourceKind: proc.sourceKind,
          fromOwnerType: proc.ownerType,
          fromOwnerName: proc.ownerName,
          line: call.line,
          callKind: call.kind,
          raw: call.raw,
          qualifier: call.qualifier,
          method: call.method,
          resolved: targets.length > 0,
          targets,
        };
      }
    }
  }
  return writeJsonArrayFile(file, { schema: SCHEMA, generatedAt: utcNow() }, "edges", edges(), { pretty });
}

function buildExtensionTransitions(records) {
  const transitions = [];
  const extensionHookNames = new Map([
    ["\u0432\u043c\u0435\u0441\u0442\u043e", "instead"],
    ["\u043f\u0435\u0440\u0435\u0434", "before"],
    ["\u043f\u043e\u0441\u043b\u0435", "after"],
    ["\u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0435\u0438\u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044c", "changeAndControl"],
    ["instead", "instead"],
    ["before", "before"],
    ["after", "after"],
  ]);

  for (const proc of records.procedures) {
    if (proc.sourceKind !== "extension") {
      continue;
    }
    for (const annotation of proc.annotations || []) {
      const kind = extensionHookNames.get(annotation.normalizedName);
      if (!kind) {
        continue;
      }
      transitions.push({
        kind: "bsl_interceptor",
        interceptorKind: kind,
        targetMethod: annotation.stringArgs?.[0] || "",
        extensionProcedureId: proc.id,
        extensionModuleId: proc.moduleId,
        extensionSource: proc.source,
        ownerType: proc.ownerType,
        ownerName: proc.ownerName,
        moduleKind: proc.moduleKind,
        line: annotation.line,
        raw: annotation.raw,
      });
    }
  }
  return transitions;
}

function countRecords(records, outputFiles) {
  const objectTypeCounts = {};
  for (const object of records.objects) {
    objectTypeCounts[object.objectType] = (objectTypeCounts[object.objectType] || 0) + 1;
  }
  return {
    objects: records.objects.length,
    objectTypeCounts,
    forms: records.forms.length,
    commands: records.commands.length,
    modules: records.modules.length,
    procedures: records.procedures.length,
    callEdges: outputFiles.callEdges,
    references: outputFiles.references,
    errors: records.errors.length,
  };
}

function groupBy(values, keyFn) {
  const map = new Map();
  for (const value of values) {
    const key = keyFn(value);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(value);
  }
  return map;
}
