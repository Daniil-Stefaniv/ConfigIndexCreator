import path from "node:path";
import {
  decodeTextFile,
  escapeRegExp,
  relativePath,
  stableHash,
  toPosix,
  xmlDecode,
} from "./utils.mjs";
import { sourceForPath } from "./config.mjs";

export const OBJECT_TYPE_DIR_MAP = {
  AccountingRegister: "AccountingRegisters",
  AccumulationRegister: "AccumulationRegisters",
  BusinessProcess: "BusinessProcesses",
  CalculationRegister: "CalculationRegisters",
  Catalog: "Catalogs",
  ChartOfAccounts: "ChartsOfAccounts",
  ChartOfCalculationTypes: "ChartsOfCalculationTypes",
  ChartOfCharacteristicTypes: "ChartsOfCharacteristicTypes",
  CommandGroup: "CommandGroups",
  CommonAttribute: "CommonAttributes",
  CommonCommand: "CommonCommands",
  CommonForm: "CommonForms",
  CommonModule: "CommonModules",
  CommonPicture: "CommonPictures",
  CommonTemplate: "CommonTemplates",
  Configuration: "Configuration",
  Constant: "Constants",
  DataProcessor: "DataProcessors",
  DefinedType: "DefinedTypes",
  Document: "Documents",
  DocumentJournal: "DocumentJournals",
  DocumentNumerator: "DocumentNumerators",
  Enum: "Enums",
  EventSubscription: "EventSubscriptions",
  ExchangePlan: "ExchangePlans",
  ExternalDataSource: "ExternalDataSources",
  FilterCriterion: "FilterCriteria",
  FunctionalOption: "FunctionalOptions",
  FunctionalOptionsParameter: "FunctionalOptionsParameters",
  HTTPService: "HTTPServices",
  InformationRegister: "InformationRegisters",
  IntegrationService: "IntegrationServices",
  Language: "Languages",
  Report: "Reports",
  Role: "Roles",
  ScheduledJob: "ScheduledJobs",
  Sequence: "Sequences",
  SessionParameter: "SessionParameters",
  SettingsStorage: "SettingsStorages",
  Style: "Styles",
  StyleItem: "StyleItems",
  Subsystem: "Subsystems",
  Task: "Tasks",
  WebService: "WebServices",
  WSReference: "WSReferences",
  XDTOPackage: "XDTOPackages",
};

export const DIR_OBJECT_TYPE_MAP = Object.fromEntries(
  Object.entries(OBJECT_TYPE_DIR_MAP).map(([key, value]) => [value, key]),
);

const RUS_MANAGER_TO_DIR = {
  "\u0411\u0438\u0437\u043d\u0435\u0441\u041f\u0440\u043e\u0446\u0435\u0441\u0441\u044b": "BusinessProcesses",
  "\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b": "Documents",
  "\u0416\u0443\u0440\u043d\u0430\u043b\u044b\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u043e\u0432": "DocumentJournals",
  "\u0417\u0430\u0434\u0430\u0447\u0438": "Tasks",
  "\u041a\u043e\u043d\u0441\u0442\u0430\u043d\u0442\u044b": "Constants",
  "\u041a\u0440\u0438\u0442\u0435\u0440\u0438\u0438\u041e\u0442\u0431\u043e\u0440\u0430": "FilterCriteria",
  "\u041e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0438": "DataProcessors",
  "\u041e\u0442\u0447\u0435\u0442\u044b": "Reports",
  "\u041f\u0435\u0440\u0435\u0447\u0438\u0441\u043b\u0435\u043d\u0438\u044f": "Enums",
  "\u041f\u043b\u0430\u043d\u044b\u0412\u0438\u0434\u043e\u0432\u0420\u0430\u0441\u0447\u0435\u0442\u0430": "ChartsOfCalculationTypes",
  "\u041f\u043b\u0430\u043d\u044b\u0412\u0438\u0434\u043e\u0432\u0425\u0430\u0440\u0430\u043a\u0442\u0435\u0440\u0438\u0441\u0442\u0438\u043a": "ChartsOfCharacteristicTypes",
  "\u041f\u043b\u0430\u043d\u044b\u041e\u0431\u043c\u0435\u043d\u0430": "ExchangePlans",
  "\u041f\u043b\u0430\u043d\u044b\u0421\u0447\u0435\u0442\u043e\u0432": "ChartsOfAccounts",
  "\u041f\u043e\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u0438": "Sequences",
  "\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u044b\u0411\u0443\u0445\u0433\u0430\u043b\u0442\u0435\u0440\u0438\u0438": "AccountingRegisters",
  "\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u044b\u041d\u0430\u043a\u043e\u043f\u043b\u0435\u043d\u0438\u044f": "AccumulationRegisters",
  "\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u044b\u0420\u0430\u0441\u0447\u0435\u0442\u0430": "CalculationRegisters",
  "\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u044b\u0421\u0432\u0435\u0434\u0435\u043d\u0438\u0439": "InformationRegisters",
  "\u0421\u043f\u0440\u0430\u0432\u043e\u0447\u043d\u0438\u043a\u0438": "Catalogs",
  "\u041e\u0431\u0449\u0438\u0435\u041c\u043e\u0434\u0443\u043b\u0438": "CommonModules",
  "\u041e\u0431\u0449\u0438\u0435\u0424\u043e\u0440\u043c\u044b": "CommonForms",
  "\u041e\u0431\u0449\u0438\u0435\u041a\u043e\u043c\u0430\u043d\u0434\u044b": "CommonCommands",
};

const CFG_TYPE_PREFIX_TO_DIR = {
  AccountingRegister: "AccountingRegisters",
  AccountingRegisterRecordSet: "AccountingRegisters",
  AccumulationRegister: "AccumulationRegisters",
  AccumulationRegisterRecordSet: "AccumulationRegisters",
  BusinessProcess: "BusinessProcesses",
  BusinessProcessObject: "BusinessProcesses",
  BusinessProcessRef: "BusinessProcesses",
  CalculationRegister: "CalculationRegisters",
  CalculationRegisterRecordSet: "CalculationRegisters",
  Catalog: "Catalogs",
  CatalogObject: "Catalogs",
  CatalogRef: "Catalogs",
  CatalogManager: "Catalogs",
  ChartOfAccounts: "ChartsOfAccounts",
  ChartOfAccountsRef: "ChartsOfAccounts",
  ChartOfCalculationTypes: "ChartsOfCalculationTypes",
  ChartOfCalculationTypesRef: "ChartsOfCalculationTypes",
  ChartOfCharacteristicTypes: "ChartsOfCharacteristicTypes",
  ChartOfCharacteristicTypesRef: "ChartsOfCharacteristicTypes",
  CommonCommand: "CommonCommands",
  CommonForm: "CommonForms",
  CommonModule: "CommonModules",
  Constant: "Constants",
  DataProcessor: "DataProcessors",
  DataProcessorObject: "DataProcessors",
  DefinedType: "DefinedTypes",
  Document: "Documents",
  DocumentObject: "Documents",
  DocumentRef: "Documents",
  DocumentManager: "Documents",
  Enum: "Enums",
  EnumRef: "Enums",
  ExchangePlan: "ExchangePlans",
  ExchangePlanObject: "ExchangePlans",
  ExchangePlanRef: "ExchangePlans",
  InformationRegister: "InformationRegisters",
  InformationRegisterRecordSet: "InformationRegisters",
  InformationRegisterManager: "InformationRegisters",
  Report: "Reports",
  ReportObject: "Reports",
  Task: "Tasks",
  TaskObject: "Tasks",
  TaskRef: "Tasks",
};

const IDENT = String.raw`[A-Za-z_\u0401\u0451\u0410-\u044f][0-9A-Za-z_\u0401\u0451\u0410-\u044f]*`;
const PROC_START_RE = new RegExp(
  String.raw`^\s*(Procedure|Function|\u041f\u0440\u043e\u0446\u0435\u0434\u0443\u0440\u0430|\u0424\u0443\u043d\u043a\u0446\u0438\u044f)\s+(${IDENT})\s*\(`,
  "iu",
);
const END_PROC_RE = new RegExp(
  String.raw`^\s*(EndProcedure|EndFunction|\u041a\u043e\u043d\u0435\u0446\u041f\u0440\u043e\u0446\u0435\u0434\u0443\u0440\u044b|\u041a\u043e\u043d\u0435\u0446\u0424\u0443\u043d\u043a\u0446\u0438\u0438)(?:\s|;|$)`,
  "iu",
);
const EXPORT_RE = new RegExp(
  String.raw`(?:^|[^\p{L}\p{N}_])(Export|\u042d\u043a\u0441\u043f\u043e\u0440\u0442)(?:$|[^\p{L}\p{N}_])`,
  "iu",
);
const ANNOTATION_RE = new RegExp(String.raw`^\s*&\s*(${IDENT})(?:\s*\((.*)\))?`, "iu");
const QUALIFIED_CALL_RE = new RegExp(String.raw`((?:${IDENT}\s*\.\s*)+)(${IDENT})\s*\(`, "giu");
const UNQUALIFIED_CALL_RE = new RegExp(String.raw`(?<![\.\p{L}\p{N}_])(${IDENT})\s*\(`, "giu");
const METADATA_REF_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}_])(${IDENT}(?:\.${IDENT}){1,4})(?![\p{L}\p{N}_])`,
  "giu",
);
const CFG_REF_RE = new RegExp(String.raw`\bcfg:([A-Za-z0-9_]+)\.(${IDENT})`, "giu");

const LANGUAGE_WORDS = new Set(
  [
    "if",
    "then",
    "else",
    "elseif",
    "endif",
    "for",
    "each",
    "in",
    "while",
    "do",
    "enddo",
    "try",
    "except",
    "endtry",
    "return",
    "new",
    "procedure",
    "function",
    "endprocedure",
    "endfunction",
    "true",
    "false",
    "undefined",
    "null",
    "\u0435\u0441\u043b\u0438",
    "\u0442\u043e\u0433\u0434\u0430",
    "\u0438\u043d\u0430\u0447\u0435",
    "\u0438\u043d\u0430\u0447\u0435\u0435\u0441\u043b\u0438",
    "\u043a\u043e\u043d\u0435\u0446\u0435\u0441\u043b\u0438",
    "\u0434\u043b\u044f",
    "\u043a\u0430\u0436\u0434\u043e\u0433\u043e",
    "\u0438\u0437",
    "\u043f\u043e\u043a\u0430",
    "\u0446\u0438\u043a\u043b",
    "\u043a\u043e\u043d\u0435\u0446\u0446\u0438\u043a\u043b\u0430",
    "\u043f\u043e\u043f\u044b\u0442\u043a\u0430",
    "\u0438\u0441\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435",
    "\u043a\u043e\u043d\u0435\u0446\u043f\u043e\u043f\u044b\u0442\u043a\u0438",
    "\u0432\u043e\u0437\u0432\u0440\u0430\u0442",
    "\u043d\u043e\u0432\u044b\u0439",
    "\u043f\u0440\u043e\u0446\u0435\u0434\u0443\u0440\u0430",
    "\u0444\u0443\u043d\u043a\u0446\u0438\u044f",
    "\u043a\u043e\u043d\u0435\u0446\u043f\u0440\u043e\u0446\u0435\u0434\u0443\u0440\u044b",
    "\u043a\u043e\u043d\u0435\u0446\u0444\u0443\u043d\u043a\u0446\u0438\u0438",
    "\u0438\u0441\u0442\u0438\u043d\u0430",
    "\u043b\u043e\u0436\u044c",
    "\u043d\u0435\u043e\u043f\u0440\u0435\u0434\u0435\u043b\u0435\u043d\u043e",
  ].map((item) => item.toLowerCase()),
);

export function parseFile(file, context) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".xml") {
    return parseXmlFile(file, context);
  }
  if (ext === ".bsl") {
    return parseBslFile(file, context);
  }
  return emptyParsedFile(file, context, "unknown");
}

function emptyParsedFile(file, context, kind) {
  return {
    file: relativePath(context.configurationRoot, file),
    kind,
    objects: [],
    forms: [],
    commands: [],
    modules: [],
    procedures: [],
    references: [],
    errors: [],
  };
}

function parseXmlFile(file, context) {
  const result = emptyParsedFile(file, context, "xml");
  const text = decodeTextFile(file);
  const source = sourceForPath(file, context.sources);
  if (!source) {
    return result;
  }

  const relParts = splitRelative(source.absolutePath, file);
  if (!shouldIndexXml(relParts, file)) {
    return result;
  }

  const info = inferXmlEntity(file, relParts, text);
  if (info.kind === "form") {
    result.forms.push(parseFormXml(file, context, source, relParts, text, info));
  } else if (info.kind === "command") {
    result.commands.push(parseCommandXml(file, context, source, relParts, text, info));
  } else if (info.kind === "object") {
    result.objects.push(parseObjectXml(file, context, source, relParts, text, info));
  }
  return result;
}

function parseBslFile(file, context) {
  const result = emptyParsedFile(file, context, "bsl");
  const source = sourceForPath(file, context.sources);
  if (!source) {
    return result;
  }
  const text = decodeTextFile(file);
  const relParts = splitRelative(source.absolutePath, file);
  const owner = inferOwnerFromParts(relParts);
  const moduleKind = inferModuleKind(relParts, file);
  const module = {
    id: stableHash("module", source.id, relativePath(context.configurationRoot, file)),
    source: source.id,
    sourceKind: source.kind,
    extension: source.extension,
    path: relativePath(context.workspaceRoot, file),
    configurationPath: relativePath(context.configurationRoot, file),
    sourcePath: toPosix(relParts.join("/")),
    ownerType: owner.ownerType,
    ownerName: owner.ownerName,
    ownerFullName: owner.ownerFullName,
    formName: owner.formName,
    commandName: owner.commandName,
    moduleKind,
    moduleName: moduleName(owner, moduleKind, file),
  };
  module.fullName = moduleFullName(module);
  result.modules.push(module);
  result.procedures.push(...parseProcedures(text, module));
  return result;
}

function shouldIndexXml(relParts, file) {
  const name = path.basename(file);
  if (name === "Form.xml" && relParts.includes("Ext")) {
    return true;
  }
  if (relParts.includes("Ext")) {
    return false;
  }
  return true;
}

function splitRelative(root, file) {
  const rel = path.relative(path.resolve(root), path.resolve(file));
  return rel.split(path.sep).filter(Boolean);
}

function inferXmlEntity(file, relParts, text) {
  if (path.basename(file) === "Configuration.xml") {
    return { kind: "object", objectType: "Configuration", objectName: null, xmlTag: "Configuration" };
  }
  const formIndex = relParts.indexOf("Forms");
  if (formIndex >= 0) {
    return {
      kind: "form",
      formName: formNameFromParts(relParts, formIndex, file),
      owner: inferOwnerFromParts(relParts.slice(0, formIndex + 2)),
    };
  }
  const commandIndex = relParts.indexOf("Commands");
  if (commandIndex >= 0) {
    return {
      kind: "command",
      commandName: relParts[commandIndex + 1]?.replace(/\.xml$/i, "") || path.basename(file, ".xml"),
      owner: inferOwnerFromParts(relParts.slice(0, commandIndex + 2)),
    };
  }

  const objectType = relParts[0] && DIR_OBJECT_TYPE_MAP[relParts[0]] ? relParts[0] : objectTypeFromXml(text);
  return {
    kind: "object",
    objectType: objectType || "Unknown",
    objectName: path.basename(file, ".xml"),
    xmlTag: objectTypeFromXml(text),
  };
}

function parseObjectXml(file, context, source, relParts, text, info) {
  const objectTag = objectTagInfo(text);
  const properties = tagBlock(text, "Properties") || "";
  const name = tagText(properties, "Name") || info.objectName || path.basename(file, ".xml");
  const objectType = info.objectType === "Configuration" ? "Configuration" : info.objectType;
  const types = unique(allTagTexts(text, "Type"));
  const references = types
    .map((type) => typeToReference(type))
    .filter(Boolean)
    .map((ref) => ({ kind: "xml_type", ...ref }));
  return {
    id: stableHash("object", source.id, objectType, name, relativePath(context.configurationRoot, file)),
    source: source.id,
    sourceKind: source.kind,
    extension: source.extension,
    objectType,
    xmlTag: info.xmlTag || objectTag.name || "",
    name,
    fullName: `${objectType}.${name}`,
    uuid: objectTag.attributes.uuid || "",
    path: relativePath(context.workspaceRoot, file),
    configurationPath: relativePath(context.configurationRoot, file),
    sourcePath: toPosix(relParts.join("/")),
    objectDir: objectDirectoryPath(file, context.workspaceRoot),
    synonym: parseSynonym(properties),
    comment: tagText(properties, "Comment"),
    objectBelonging: tagText(properties, "ObjectBelonging"),
    types,
    references,
    forms: [],
    commands: [],
    modules: [],
    procedures: [],
  };
}

function parseFormXml(file, context, source, relParts, text, info) {
  const owner = inferOwnerFromParts(relParts);
  const formName = info.formName || owner.formName || path.basename(file, ".xml");
  return {
    id: stableHash("form", source.id, owner.ownerFullName, formName, relativePath(context.configurationRoot, file)),
    source: source.id,
    sourceKind: source.kind,
    extension: source.extension,
    name: formName,
    formName,
    ownerType: owner.ownerType,
    ownerName: owner.ownerName,
    ownerFullName: owner.ownerFullName,
    path: relativePath(context.workspaceRoot, file),
    configurationPath: relativePath(context.configurationRoot, file),
    events: extractFormEvents(text),
    metadataReferences: extractMetadataRefs(text),
  };
}

function parseCommandXml(file, context, source, relParts, text, info) {
  const owner = inferOwnerFromParts(relParts);
  const properties = tagBlock(text, "Properties") || "";
  const name = tagText(properties, "Name") || info.commandName || path.basename(file, ".xml");
  const types = unique(allTagTexts(text, "Type"));
  return {
    id: stableHash("command", source.id, owner.ownerFullName, name, relativePath(context.configurationRoot, file)),
    source: source.id,
    sourceKind: source.kind,
    extension: source.extension,
    name,
    ownerType: owner.ownerType,
    ownerName: owner.ownerName,
    ownerFullName: owner.ownerFullName,
    path: relativePath(context.workspaceRoot, file),
    configurationPath: relativePath(context.configurationRoot, file),
    synonym: parseSynonym(properties),
    types,
    typeReferences: types.map((type) => typeToReference(type)).filter(Boolean),
  };
}

function parseProcedures(text, module) {
  const lines = text.split(/\r\n|\n|\r/);
  const procedures = [];
  let current = null;
  let pendingAnnotations = [];

  for (let idx = 0; idx < lines.length; idx += 1) {
    const lineNumber = idx + 1;
    const line = lines[idx];
    const annotation = parseAnnotation(line, lineNumber);
    if (!current && annotation) {
      pendingAnnotations.push(annotation);
      continue;
    }

    if (!current) {
      const start = PROC_START_RE.exec(line);
      if (start) {
        current = {
          id: stableHash("procedure", module.id, start[2], lineNumber),
          source: module.source,
          sourceKind: module.sourceKind,
          extension: module.extension,
          moduleId: module.id,
          moduleKind: module.moduleKind,
          moduleName: module.moduleName,
          moduleFullName: module.fullName,
          path: module.path,
          configurationPath: module.configurationPath,
          ownerType: module.ownerType,
          ownerName: module.ownerName,
          ownerFullName: module.ownerFullName,
          formName: module.formName,
          commandName: module.commandName,
          name: start[2],
          kind: normalizeProcedureKind(start[1]),
          startLine: lineNumber,
          endLine: lineNumber,
          export: EXPORT_RE.test(line),
          annotations: pendingAnnotations,
          calls: [],
          metadataReferences: [],
        };
        pendingAnnotations = [];
      } else if (line.trim() && !line.trim().startsWith("//")) {
        pendingAnnotations = [];
      }
      continue;
    }

    if (!current.export && EXPORT_RE.test(line) && current.endLine === current.startLine) {
      current.export = true;
    }
    const stripped = stripCommentsAndStrings(line);
    current.calls.push(...extractCalls(stripped.code, lineNumber));
    current.metadataReferences.push(...extractMetadataRefs(`${stripped.code}\n${stripped.strings.join("\n")}`, lineNumber));

    if (END_PROC_RE.test(line)) {
      current.endLine = lineNumber;
      current.calls = dedupeByKey(current.calls, (call) => `${call.line}|${call.kind}|${call.qualifier || ""}|${call.method}`);
      current.metadataReferences = dedupeByKey(current.metadataReferences, (ref) => `${ref.line || 0}|${ref.raw}`);
      procedures.push(current);
      current = null;
      pendingAnnotations = [];
    }
  }

  if (current) {
    current.endLine = lines.length;
    procedures.push(current);
  }
  return procedures;
}

function normalizeProcedureKind(value) {
  const lower = value.toLowerCase();
  if (lower === "function" || lower === "\u0444\u0443\u043d\u043a\u0446\u0438\u044f") {
    return "function";
  }
  return "procedure";
}

function parseAnnotation(line, lineNumber) {
  const match = ANNOTATION_RE.exec(line);
  if (!match) {
    return null;
  }
  return {
    name: match[1],
    normalizedName: match[1].toLowerCase(),
    args: match[2] || "",
    stringArgs: [...(match[2] || "").matchAll(/"((?:""|[^"])*)"/g)].map((item) => item[1].replace(/""/g, '"')),
    raw: line.trim(),
    line: lineNumber,
  };
}

function stripCommentsAndStrings(line) {
  let code = "";
  const strings = [];
  let string = "";
  let inString = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (inString) {
      if (ch === '"') {
        if (next === '"') {
          string += '"';
          i += 1;
        } else {
          strings.push(string);
          string = "";
          inString = false;
        }
      } else {
        string += ch;
      }
      code += " ";
      continue;
    }
    if (ch === '"') {
      inString = true;
      code += " ";
      continue;
    }
    if (ch === "/" && next === "/") {
      break;
    }
    code += ch;
  }
  return { code, strings };
}

function extractCalls(code, line) {
  const calls = [];
  const occupiedStarts = new Set();
  QUALIFIED_CALL_RE.lastIndex = 0;
  for (const match of code.matchAll(QUALIFIED_CALL_RE)) {
    const qualifier = match[1].replace(/\s+/g, "").replace(/\.$/, "");
    const method = match[2];
    if (isLanguageWord(method)) {
      continue;
    }
    occupiedStarts.add(match.index + match[0].lastIndexOf(method));
    calls.push({
      kind: "qualified",
      qualifier,
      method,
      raw: `${qualifier}.${method}`,
      line,
    });
  }
  UNQUALIFIED_CALL_RE.lastIndex = 0;
  for (const match of code.matchAll(UNQUALIFIED_CALL_RE)) {
    const method = match[1];
    if (isLanguageWord(method) || occupiedStarts.has(match.index)) {
      continue;
    }
    calls.push({
      kind: "unqualified",
      qualifier: "",
      method,
      raw: method,
      line,
    });
  }
  return calls;
}

export function extractMetadataRefs(text, line = undefined) {
  const refs = [];
  CFG_REF_RE.lastIndex = 0;
  for (const match of text.matchAll(CFG_REF_RE)) {
    const ref = typeToReference(`cfg:${match[1]}.${match[2]}`);
    if (ref) {
      refs.push({ kind: "cfg_type", raw: match[0], line, ...ref });
    }
  }
  METADATA_REF_RE.lastIndex = 0;
  for (const match of text.matchAll(METADATA_REF_RE)) {
    const ref = metadataRefToTarget(match[1]);
    if (ref) {
      refs.push({ kind: "metadata_ref", line, ...ref });
    }
  }
  return dedupeByKey(refs, (ref) => `${ref.kind}|${ref.raw}|${ref.line || 0}`);
}

function metadataRefToTarget(ref) {
  const parts = ref.split(".");
  if (parts.length < 2) {
    return null;
  }
  const first = parts[0];
  if (RUS_MANAGER_TO_DIR[first]) {
    return {
      raw: ref,
      targetType: RUS_MANAGER_TO_DIR[first],
      targetName: parts[1],
      targetFullName: `${RUS_MANAGER_TO_DIR[first]}.${parts[1]}`,
    };
  }
  if (CFG_TYPE_PREFIX_TO_DIR[first]) {
    return {
      raw: ref,
      targetType: CFG_TYPE_PREFIX_TO_DIR[first],
      targetName: parts[1],
      targetFullName: `${CFG_TYPE_PREFIX_TO_DIR[first]}.${parts[1]}`,
    };
  }
  if (DIR_OBJECT_TYPE_MAP[first]) {
    return {
      raw: ref,
      targetType: first,
      targetName: parts[1],
      targetFullName: `${first}.${parts[1]}`,
    };
  }
  return null;
}

function typeToReference(value) {
  let raw = value.trim();
  if (raw.startsWith("cfg:")) {
    raw = raw.slice(4);
  }
  if (!raw.includes(".")) {
    return null;
  }
  const [prefix, ...rest] = raw.split(".");
  const name = rest.join(".");
  let targetType = CFG_TYPE_PREFIX_TO_DIR[prefix];
  if (!targetType) {
    const reduced = prefix.replace(/(Ref|Object|RecordSet|Manager|Selection|List)$/u, "");
    targetType = CFG_TYPE_PREFIX_TO_DIR[reduced];
  }
  if (!targetType) {
    return null;
  }
  return {
    raw: value,
    typePrefix: prefix,
    targetType,
    targetName: name,
    targetFullName: `${targetType}.${name}`,
  };
}

function inferOwnerFromParts(relParts) {
  const owner = {
    ownerType: "",
    ownerName: "",
    ownerFullName: "",
    formName: "",
    commandName: "",
  };

  for (let i = 0; i < relParts.length; i += 1) {
    const folder = relParts[i];
    if (DIR_OBJECT_TYPE_MAP[folder] && relParts[i + 1]) {
      owner.ownerType = folder;
      owner.ownerName = relParts[i + 1].replace(/\.xml$/i, "");
      owner.ownerFullName = `${owner.ownerType}.${owner.ownerName}`;
      i += 1;
      continue;
    }
    if (folder === "Forms" && relParts[i + 1]) {
      owner.formName = relParts[i + 1].replace(/\.xml$/i, "");
      i += 1;
      continue;
    }
    if (folder === "Commands" && relParts[i + 1]) {
      owner.commandName = relParts[i + 1].replace(/\.xml$/i, "");
      i += 1;
    }
  }
  return owner;
}

function inferModuleKind(relParts, file) {
  const basename = path.basename(file);
  if (relParts.includes("Forms") && basename === "Module.bsl") {
    return "FormModule";
  }
  if (relParts.includes("CommonModules") && basename === "Module.bsl") {
    return "CommonModule";
  }
  if (basename === "CommandModule.bsl") {
    return "CommandModule";
  }
  if (basename === "ManagerModule.bsl") {
    return "ManagerModule";
  }
  if (basename === "ObjectModule.bsl") {
    return "ObjectModule";
  }
  if (basename === "RecordSetModule.bsl") {
    return "RecordSetModule";
  }
  return path.basename(file, ".bsl");
}

function moduleName(owner, moduleKind, file) {
  if (moduleKind === "CommonModule" && owner.ownerName) {
    return owner.ownerName;
  }
  if (moduleKind === "FormModule" && owner.formName) {
    return owner.formName;
  }
  if (moduleKind === "CommandModule" && owner.commandName) {
    return owner.commandName;
  }
  return path.basename(file, ".bsl");
}

function moduleFullName(module) {
  const parts = [];
  if (module.ownerFullName) {
    parts.push(module.ownerFullName);
  }
  if (module.formName) {
    parts.push(`Form.${module.formName}`);
  }
  if (module.commandName) {
    parts.push(`Command.${module.commandName}`);
  }
  parts.push(module.moduleKind);
  return parts.join(".");
}

function formNameFromParts(relParts, formIndex, file) {
  if (path.basename(file) === "Form.xml" && relParts[formIndex + 1]) {
    return relParts[formIndex + 1];
  }
  return relParts[formIndex + 1]?.replace(/\.xml$/i, "") || path.basename(file, ".xml");
}

function objectDirectoryPath(file, workspaceRoot) {
  const dir = path.join(path.dirname(file), path.basename(file, ".xml"));
  return relativePath(workspaceRoot, dir);
}

function objectTypeFromXml(text) {
  const info = objectTagInfo(text);
  if (!info.name) {
    return "";
  }
  return OBJECT_TYPE_DIR_MAP[info.name] || info.name;
}

function objectTagInfo(text) {
  const tagRe = /<(?!!|\?)([A-Za-z_][\w:.-]*)([^>]*)>/g;
  let first = null;
  for (const match of text.matchAll(tagRe)) {
    const local = localName(match[1]);
    if (!first) {
      first = { name: local, attributes: parseAttributes(match[2] || ""), index: match.index };
      if (local !== "MetaDataObject") {
        return first;
      }
      continue;
    }
    return { name: local, attributes: parseAttributes(match[2] || ""), index: match.index };
  }
  return first || { name: "", attributes: {} };
}

function parseAttributes(value) {
  const attrs = {};
  for (const match of value.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
    attrs[localName(match[1])] = xmlDecode(match[2]);
  }
  return attrs;
}

function localName(value) {
  return value.includes(":") ? value.split(":").pop() : value;
}

function tagBlock(text, tag) {
  const escaped = escapeRegExp(tag);
  const re = new RegExp(String.raw`<(?:[\w.-]+:)?${escaped}\b[^>]*>([\s\S]*?)</(?:[\w.-]+:)?${escaped}>`, "i");
  const match = re.exec(text);
  return match ? match[1] : "";
}

function tagText(text, tag) {
  return xmlDecode(tagBlock(text, tag));
}

function allTagTexts(text, tag) {
  const escaped = escapeRegExp(tag);
  const re = new RegExp(String.raw`<(?:[\w.-]+:)?${escaped}\b[^>]*>([\s\S]*?)</(?:[\w.-]+:)?${escaped}>`, "gi");
  return [...text.matchAll(re)].map((match) => xmlDecode(match[1])).filter(Boolean);
}

function parseSynonym(properties) {
  const block = tagBlock(properties, "Synonym");
  if (!block) {
    return {};
  }
  const result = {};
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  for (const match of block.matchAll(itemRe)) {
    const lang = tagText(match[1], "lang") || "";
    const content = tagText(match[1], "content");
    if (content) {
      result[lang] = content;
    }
  }
  return result;
}

function extractFormEvents(text) {
  const events = [];
  const eventRe = /<Event\b([^>]*)>([\s\S]*?)<\/Event>/gi;
  for (const match of text.matchAll(eventRe)) {
    const attrs = parseAttributes(match[1] || "");
    const name = attrs.name || tagText(match[2], "Name") || tagText(match[2], "Event");
    const handler = tagText(match[2], "Handler") || tagText(match[2], "Action") || tagText(match[2], "ProcedureName");
    if (name || handler) {
      events.push({ name, handler });
    }
  }
  const handlerTags = ["Handler", "ProcedureName"];
  for (const tag of handlerTags) {
    for (const handler of allTagTexts(text, tag)) {
      if (!events.some((event) => event.handler === handler)) {
        events.push({ name: "", handler });
      }
    }
  }
  return events;
}

function isLanguageWord(value) {
  return LANGUAGE_WORDS.has(value.toLowerCase());
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function dedupeByKey(values, keyFn) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = keyFn(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function buildCallResolver(modules, procedures) {
  const procedureById = new Map();
  const moduleProc = new Map();
  const commonProc = new Map();
  const objectModuleProc = new Map();
  const commonModuleNames = new Map();

  for (const module of modules) {
    if (module.moduleKind === "CommonModule" && module.moduleName) {
      commonModuleNames.set(module.moduleName.toLowerCase(), module.moduleName);
    }
  }

  for (const proc of procedures) {
    procedureById.set(proc.id, proc);
    pushMap(moduleProc, `${proc.moduleId}|${proc.name.toLowerCase()}`, proc);
    if (proc.moduleKind === "CommonModule" && proc.moduleName) {
      pushMap(commonProc, `${proc.moduleName.toLowerCase()}|${proc.name.toLowerCase()}`, proc);
    }
    if (proc.ownerType && proc.ownerName) {
      pushMap(
        objectModuleProc,
        `${proc.ownerType}|${proc.ownerName}|${proc.moduleKind}|${proc.name.toLowerCase()}`,
        proc,
      );
    }
  }

  return {
    resolve(call, proc) {
      const method = call.method.toLowerCase();
      if (call.kind === "unqualified") {
        return compactTargets(moduleProc.get(`${proc.moduleId}|${method}`) || []);
      }
      const qualifierParts = call.qualifier.split(".").filter(Boolean);
      const targets = [];
      if (qualifierParts.length === 1) {
        const commonModuleName = commonModuleNames.get(qualifierParts[0].toLowerCase());
        if (commonModuleName) {
          targets.push(...(commonProc.get(`${commonModuleName.toLowerCase()}|${method}`) || []));
        }
      }
      if (qualifierParts.length >= 2) {
        const first = qualifierParts[0];
        const targetType = RUS_MANAGER_TO_DIR[first] || (DIR_OBJECT_TYPE_MAP[first] ? first : "");
        if (targetType) {
          targets.push(...(objectModuleProc.get(`${targetType}|${qualifierParts[1]}|ManagerModule|${method}`) || []));
        }
      }
      return compactTargets(targets);
    },
  };
}

function pushMap(map, key, value) {
  if (!map.has(key)) {
    map.set(key, []);
  }
  map.get(key).push(value);
}

function compactTargets(procedures) {
  const seen = new Set();
  const result = [];
  for (const proc of procedures) {
    if (seen.has(proc.id)) {
      continue;
    }
    seen.add(proc.id);
    result.push({
      procedureId: proc.id,
      name: proc.name,
      moduleId: proc.moduleId,
      moduleKind: proc.moduleKind,
      moduleName: proc.moduleName,
      ownerType: proc.ownerType,
      ownerName: proc.ownerName,
      source: proc.source,
      sourceKind: proc.sourceKind,
      extension: proc.extension,
      startLine: proc.startLine,
    });
  }
  return result;
}
