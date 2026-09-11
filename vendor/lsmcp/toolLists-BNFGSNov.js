import { __commonJS, __require, __toESM } from "./chunk-BLXvPPr8.js";
import { CodeActionKind, CompletionItemKind, DiagnosticResultBuilder, LogLevel, SYMBOL_CACHE_SCHEMA_VERSION, SYMBOL_KIND_NAMES, SymbolKind, commonSchemas, createAdvancedCompletionHandler, createLSPSymbolProvider, debug, defaultLog, fileLocationSchema, formatError, getLanguageIdFromPath, getSymbolKindName, loadFileContext, parseSymbolKind, resolveLineIndexOrThrow, resolveLineParameter, validateLineAndSymbol, waitForDiagnosticsWithRetry, withLSPOperation, withTemporaryDocument } from "./src-B-h8l8uA.js";
import { debugLogWithPrefix, errorLog } from "./debugLog-LfbHS9a2.js";
import { loadIndexConfig } from "./configLoader-CZlYj_hr.js";
import { nodeFileSystemApi } from "./NodeFileSystemApi-CcTrKwya.js";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import * as fs$3 from "fs";
import { existsSync as existsSync$1, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import * as path$2 from "path";
import * as path$1 from "path";
import path, { dirname, isAbsolute, join as join$1, relative, resolve as resolve$1 } from "path";
import { z } from "zod";
import { spawn } from "child_process";
import { EventEmitter } from "events";
import { createHash } from "crypto";
import { fileURLToPath, pathToFileURL } from "url";
import * as fs$2 from "fs/promises";
import * as fs$1 from "fs/promises";
import fs, { readFile, stat } from "fs/promises";
import { DatabaseSync } from "node:sqlite";
import { glob } from "glob";
import { glob as glob$1 } from "gitaware-glob";
import { minimatch } from "minimatch";
import { mkdir as mkdir$1, readFile as readFile$1, readdir, unlink, writeFile as writeFile$1 } from "node:fs/promises";
import { platform } from "node:os";

//#region src/config/schema.ts
const serverCharacteristicsSchema = z.object({
	documentOpenDelay: z.number().optional().describe("Time to wait after opening a document before sending requests (ms)"),
	readinessCheckTimeout: z.number().optional().describe("Time to wait for server readiness check (ms)"),
	initialDiagnosticsTimeout: z.number().optional().describe("Time to wait for initial diagnostics (ms)"),
	requiresProjectInit: z.boolean().optional().describe("Whether the server requires project-level initialization"),
	sendsInitialDiagnostics: z.boolean().optional().describe("Whether the server sends diagnostics on document open"),
	operationTimeout: z.number().optional().describe("Maximum timeout for general operations (ms)"),
	supportsIncrementalSync: z.boolean().optional().describe("Whether the server supports incremental document synchronization"),
	supportsPullDiagnostics: z.boolean().optional().describe("Whether the server supports pull diagnostics")
});
const serverCapabilitiesSchema = z.object({
	supportsRename: z.boolean().optional(),
	supportsReferences: z.boolean().optional(),
	supportsDefinition: z.boolean().optional(),
	supportsHover: z.boolean().optional(),
	supportsDocumentSymbol: z.boolean().optional(),
	supportsWorkspaceSymbol: z.boolean().optional(),
	supportsCompletion: z.boolean().optional(),
	supportsSignatureHelp: z.boolean().optional(),
	supportsDocumentFormatting: z.boolean().optional(),
	supportsRangeFormatting: z.boolean().optional(),
	supportsCodeAction: z.boolean().optional(),
	supportsDiagnostics: z.boolean().optional(),
	supportsInlayHint: z.boolean().optional(),
	supportsSemanticTokens: z.boolean().optional()
});
const binFindStrategyItemSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("venv"),
		names: z.array(z.string()).describe("Binary names to search in venv/bin"),
		venvDirs: z.array(z.string()).default([".venv", "venv"]).describe("Virtual environment directory names")
	}),
	z.object({
		type: z.literal("node_modules"),
		names: z.array(z.string()).describe("Binary names to search in node_modules/.bin"),
		requires: z.object({
			package: z.string().describe("Package that must be installed in the same node_modules"),
			minMajor: z.number().int().describe("Minimum major version of that package")
		}).optional().describe("Only accept a binary when the given package is installed next to it at or above this major version (e.g. typescript >= 7 ships the native server as tsc)")
	}),
	z.object({
		type: z.literal("global"),
		names: z.array(z.string()).describe("Binary names to search globally")
	}),
	z.object({
		type: z.literal("uv"),
		tool: z.string().describe("UV tool name (e.g., 'pyright', 'ruff')"),
		command: z.string().optional().describe("Specific command to run from the tool")
	}),
	z.object({
		type: z.literal("npx"),
		package: z.string().describe("NPX package name")
	}),
	z.object({
		type: z.literal("path"),
		path: z.string().describe("Direct path to binary")
	})
]);
const binFindStrategySchema = z.object({
	strategies: z.array(binFindStrategyItemSchema).describe("Ordered list of strategies to find the binary"),
	defaultArgs: z.array(z.string()).optional().describe("Default arguments to pass to the LSP server")
});
const lspClientConfigBaseSchema = z.object({
	id: z.string().optional().describe("Adapter ID"),
	bin: z.string().optional().describe("LSP server binary command"),
	args: z.array(z.string()).optional().describe("Command line arguments for the LSP server"),
	binFindStrategy: binFindStrategySchema.optional().describe("Strategy for finding the LSP server binary"),
	initializationOptions: z.unknown().optional().describe("LSP initialization options"),
	files: z.array(z.string()).describe("Glob patterns for files to analyze"),
	disable: z.array(z.string()).optional().describe("List of unsupported LSP features"),
	needsDiagnosticDeduplication: z.boolean().optional().describe("Whether diagnostics need deduplication"),
	serverCharacteristics: serverCharacteristicsSchema.optional(),
	serverCapabilities: serverCapabilitiesSchema.optional(),
	baseLanguage: z.string().optional().describe("Base language for this adapter")
});
const lspClientConfigSchema = lspClientConfigBaseSchema;
const presetSchema = lspClientConfigSchema.extend({
	presetId: z.string().describe("Unique preset identifier"),
	name: z.string().optional().describe("Display name"),
	description: z.string().optional().describe("Description"),
	languageFeatures: z.unknown().optional().describe("Language-specific features"),
	unsupported: z.array(z.string()).optional().describe("Unsupported features")
});
const configSchema = z.object({
	$schema: z.string().optional().describe("JSON Schema reference"),
	preset: z.string().optional().describe("Preset adapter to use"),
	files: z.array(z.string()).optional().describe("Glob patterns for files to index"),
	settings: z.object({
		autoIndex: z.boolean().default(false).describe("Automatically index files on startup"),
		indexConcurrency: z.number().min(1).max(20).default(5).describe("Number of files to index in parallel"),
		autoIndexDelay: z.number().min(100).max(5e3).default(500).describe("Delay before auto-indexing after file changes (ms)"),
		enableWatchers: z.boolean().default(true).describe("Enable file watchers for auto-indexing"),
		memoryLimit: z.number().min(100).max(4096).default(1024).describe("Memory limit for indexing operations (MB)")
	}).default({}).describe("Additional settings"),
	ignorePatterns: z.array(z.string()).default([
		"**/node_modules/**",
		"**/dist/**",
		"**/.git/**"
	]).describe("Additional ignore patterns for indexing"),
	symbolFilter: z.object({
		excludeKinds: z.array(z.string()).optional().describe("Symbol kinds to exclude from indexing"),
		excludePatterns: z.array(z.string()).optional().describe("Regex patterns for symbols to exclude"),
		includeOnlyTopLevel: z.boolean().optional().describe("Whether to include only top-level symbols")
	}).optional().describe("Symbol filtering configuration"),
	experiments: z.object({ memory: z.boolean().default(false).describe("Enable advanced memory features with database storage") }).default({}).describe("Experimental features configuration"),
	memoryAdvanced: z.boolean().optional().describe("[Deprecated] Use experiments.memory instead"),
	bin: z.string().optional().describe("LSP server binary command"),
	args: z.array(z.string()).optional().describe("Command line arguments"),
	initializationOptions: z.unknown().optional().describe("LSP initialization options"),
	unsupported: z.array(z.string()).optional().describe("Unsupported LSP features"),
	serverCharacteristics: serverCharacteristicsSchema.optional()
}).refine((data) => {
	if (!data.preset && !data.files) return false;
	return true;
}, {
	message: "'files' is required when no preset is specified",
	path: ["files"]
});
/**
* Validate config against schema
*/
function validateConfig(config) {
	return configSchema.parse(config);
}

//#endregion
//#region src/presets/typescript-language-server.ts
/**
* TypeScript Language Server adapter (default)
*/
const typescriptAdapter = {
	presetId: "typescript",
	binFindStrategy: {
		strategies: [
			{
				type: "node_modules",
				names: ["typescript-language-server"]
			},
			{
				type: "global",
				names: ["typescript-language-server"]
			},
			{
				type: "npx",
				package: "typescript-language-server"
			}
		],
		defaultArgs: ["--stdio"]
	},
	files: [
		"**/*.ts",
		"**/*.tsx",
		"**/*.d.ts",
		"**/*.js",
		"**/*.jsx",
		"**/*.mjs",
		"**/*.mts",
		"**/*.cjs"
	],
	initializationOptions: { preferences: {
		includeCompletionsForModuleExports: true,
		includeCompletionsWithInsertText: true
	} },
	serverCharacteristics: {
		documentOpenDelay: 2e3,
		readinessCheckTimeout: 1e3,
		initialDiagnosticsTimeout: 3e3,
		requiresProjectInit: true,
		sendsInitialDiagnostics: true,
		operationTimeout: 15e3
	},
	languageFeatures: { typescript: {
		enabled: true,
		indexNodeModules: true,
		maxFiles: 5e3
	} },
	unsupported: []
};

//#endregion
//#region src/presets/tsgo.ts
/**
* tsgo adapter - Fast TypeScript language server
*
* Known issues:
* - May report duplicate diagnostics
* - May report diagnostics for non-existent lines
* - Diagnostics are deduplicated and filtered by the test helper
*/
const tsgoAdapter = {
	presetId: "tsgo",
	binFindStrategy: {
		strategies: [
			{
				type: "node_modules",
				names: ["tsgo"]
			},
			{
				type: "node_modules",
				names: ["tsc"],
				requires: {
					package: "typescript",
					minMajor: 7
				}
			},
			{
				type: "global",
				names: ["tsgo"]
			},
			{
				type: "npx",
				package: "@typescript/native-preview"
			}
		],
		defaultArgs: ["--lsp", "--stdio"]
	},
	files: [
		"**/*.ts",
		"**/*.tsx",
		"**/*.d.ts"
	],
	disable: [
		"get_code_actions",
		"rename_symbol",
		"delete_symbol"
	],
	needsDiagnosticDeduplication: true,
	serverCharacteristics: {
		documentOpenDelay: 500,
		readinessCheckTimeout: 200,
		initialDiagnosticsTimeout: 1e3,
		requiresProjectInit: false,
		sendsInitialDiagnostics: false,
		operationTimeout: 5e3
	},
	initializationOptions: {
		preferences: {
			includeInlayParameterNameHints: "none",
			includeInlayParameterNameHintsWhenArgumentMatchesName: false,
			includeInlayFunctionParameterTypeHints: false,
			includeInlayVariableTypeHints: false,
			includeInlayPropertyDeclarationTypeHints: false,
			includeInlayFunctionLikeReturnTypeHints: false,
			includeInlayEnumMemberValueHints: false
		},
		maxTsServerMemory: 4096
	},
	languageFeatures: { typescript: {
		enabled: true,
		indexNodeModules: true,
		maxFiles: 5e3
	} }
};

//#endregion
//#region src/presets/deno.ts
/**
* Deno language server adapter
*/
const denoAdapter = {
	presetId: "deno",
	bin: "deno",
	args: ["lsp"],
	files: [
		"**/*.ts",
		"**/*.tsx",
		"**/*.d.ts"
	],
	initializationOptions: {
		enable: true,
		lint: true,
		unstable: true
	},
	serverCharacteristics: {
		documentOpenDelay: 1500,
		readinessCheckTimeout: 1e3,
		initialDiagnosticsTimeout: 2500,
		requiresProjectInit: false,
		sendsInitialDiagnostics: true,
		operationTimeout: 1e4
	}
};

//#endregion
//#region src/presets/pyright.ts
/**
* Pyright adapter - Microsoft's Python language server
*/
const pyrightAdapter = {
	presetId: "pyright",
	name: "Pyright",
	description: "Microsoft's Python language server",
	binFindStrategy: {
		strategies: [
			{
				type: "uv",
				tool: "pyright",
				command: "pyright-langserver"
			},
			{
				type: "global",
				names: ["pyright-langserver"]
			},
			{
				type: "venv",
				names: ["pyright-langserver"],
				venvDirs: [".venv", "venv"]
			},
			{
				type: "node_modules",
				names: ["pyright-langserver"]
			},
			{
				type: "npx",
				package: "pyright"
			}
		],
		defaultArgs: ["--stdio"]
	},
	files: ["**/*.py", "**/*.pyi"],
	initializationOptions: { python: { analysis: {
		autoSearchPaths: true,
		useLibraryCodeForTypes: true,
		diagnosticMode: "workspace"
	} } },
	serverCharacteristics: {
		documentOpenDelay: 1500,
		readinessCheckTimeout: 800,
		initialDiagnosticsTimeout: 2500,
		requiresProjectInit: false,
		sendsInitialDiagnostics: true,
		operationTimeout: 12e3
	}
};

//#endregion
//#region src/presets/ruff.ts
/**
* Ruff adapter - Fast Python linter and formatter with LSP support
*/
const ruffAdapter = {
	presetId: "ruff",
	name: "Ruff LSP",
	description: "Fast Python linter and formatter with LSP",
	binFindStrategy: {
		strategies: [
			{
				type: "uv",
				tool: "ruff"
			},
			{
				type: "global",
				names: ["ruff", "ruff-lsp"]
			},
			{
				type: "venv",
				names: ["ruff", "ruff-lsp"],
				venvDirs: [".venv", "venv"]
			}
		],
		defaultArgs: ["server"]
	},
	files: ["**/*.py", "**/*.pyi"],
	initializationOptions: { settings: {
		lineLength: 88,
		lint: { enable: true },
		format: { enable: true }
	} },
	serverCharacteristics: {
		documentOpenDelay: 300,
		readinessCheckTimeout: 500,
		initialDiagnosticsTimeout: 1e3,
		requiresProjectInit: false,
		sendsInitialDiagnostics: true,
		operationTimeout: 5e3
	}
};

//#endregion
//#region src/presets/rust-analyzer.ts
/**
* rust-analyzer adapter
*/
const rustAnalyzerAdapter = {
	presetId: "rust-analyzer",
	name: "rust-analyzer",
	description: "Language Server for Rust",
	binFindStrategy: {
		strategies: [
			{
				type: "global",
				names: ["rust-analyzer"]
			},
			{
				type: "path",
				path: "~/.cargo/bin/rust-analyzer"
			},
			{
				type: "path",
				path: "/usr/bin/rust-analyzer"
			},
			{
				type: "path",
				path: "/usr/local/bin/rust-analyzer"
			}
		],
		defaultArgs: []
	},
	files: ["**/*.rs"],
	initializationOptions: { cargo: { features: "all" } },
	languageFeatures: { rust: {
		enabled: true,
		indexCargo: true
	} }
};

//#endregion
//#region src/presets/fsharp.ts
/**
* F# Autocomplete (fsautocomplete) adapter
*/
const fsharpAdapter = {
	presetId: "fsharp",
	bin: "fsautocomplete",
	args: [],
	files: [
		"**/*.fs",
		"**/*.fsi",
		"**/*.fsx"
	],
	initializationOptions: { AutomaticWorkspaceInit: true },
	disable: ["get_all_diagnostics"]
};

//#endregion
//#region src/presets/moonbit.ts
/**
* MoonBit language server adapter
*
* Known issues:
* - May have slower response times for some operations
* - Hover operations may timeout on large files
*/
const moonbitAdapter = {
	presetId: "moonbit",
	bin: "moonbit-lsp",
	args: [],
	files: ["**/*.mbt", "**/*.mbti"],
	binFindStrategy: { strategies: [{
		type: "node_modules",
		names: ["@moonbit/moonbit-lsp"]
	}, {
		type: "global",
		names: ["moonbit-lsp"]
	}] },
	disable: []
};

//#endregion
//#region src/presets/gopls.ts
/**
* Gopls adapter for Go language support
* @see https://pkg.go.dev/golang.org/x/tools/gopls
*/
const goplsAdapter = {
	presetId: "gopls",
	bin: "gopls",
	args: ["serve"],
	files: [
		"**/*.go",
		"go.mod",
		"go.sum"
	],
	initializationOptions: {
		codelenses: {
			gc_details: true,
			generate: true,
			regenerate_cgo: true,
			run_govulncheck: true,
			test: true,
			tidy: true,
			upgrade_dependency: true,
			vendor: true
		},
		analyses: {
			unusedparams: true,
			unusedwrite: true,
			useany: true
		},
		staticcheck: true,
		gofumpt: true,
		semanticTokens: true,
		noSemanticString: false,
		usePlaceholders: true,
		completeUnimported: true,
		completionBudget: "500ms"
	}
};

//#endregion
//#region src/presets/hls.ts
/**
* Haskell Language Server (HLS) adapter
*/
const hlsAdapter = {
	presetId: "hls",
	name: "Haskell Language Server",
	description: "Official language server for Haskell",
	baseLanguage: "haskell",
	binFindStrategy: {
		strategies: [
			{
				type: "path",
				path: "~/.ghcup/bin/haskell-language-server-wrapper"
			},
			{
				type: "global",
				names: ["haskell-language-server-wrapper", "haskell-language-server"]
			},
			{
				type: "path",
				path: ".stack-work/install/*/bin/haskell-language-server-wrapper"
			},
			{
				type: "path",
				path: "dist-newstyle/build/*/haskell-language-server-wrapper"
			}
		],
		defaultArgs: ["--lsp"]
	},
	files: ["**/*.hs", "**/*.lhs"],
	initializationOptions: { haskell: {
		formattingProvider: "ormolu",
		checkProject: true
	} },
	serverCharacteristics: {
		documentOpenDelay: 3e3,
		readinessCheckTimeout: 5e3,
		initialDiagnosticsTimeout: 1e4,
		requiresProjectInit: true,
		sendsInitialDiagnostics: true,
		operationTimeout: 2e4
	}
};

//#endregion
//#region src/presets/ocaml.ts
/**
* OCaml Language Server (ocaml-lsp) adapter
*/
const ocamlAdapter = {
	presetId: "ocaml",
	name: "OCaml Language Server",
	description: "Official language server for OCaml",
	baseLanguage: "ocaml",
	binFindStrategy: {
		strategies: [
			{
				type: "global",
				names: ["ocamllsp"]
			},
			{
				type: "path",
				path: "_opam/bin/ocamllsp"
			},
			{
				type: "path",
				path: "~/.opam/default/bin/ocamllsp"
			},
			{
				type: "path",
				path: "_esy/default/build/install/default/bin/ocamllsp"
			}
		],
		defaultArgs: ["--stdio"]
	},
	files: [
		"**/*.ml",
		"**/*.mli",
		"**/*.mll",
		"**/*.mly"
	],
	initializationOptions: {
		codelens: { enable: true },
		extendedHover: { enable: true }
	},
	serverCharacteristics: {
		documentOpenDelay: 1500,
		readinessCheckTimeout: 800,
		initialDiagnosticsTimeout: 3e3,
		requiresProjectInit: true,
		sendsInitialDiagnostics: true,
		operationTimeout: 12e3
	}
};

//#endregion
//#region src/config/presets.ts
/**
* Register all built-in adapters to the registry
*/
function registerBuiltinAdapters(registry) {
	registry.register(typescriptAdapter);
	registry.register(tsgoAdapter);
	registry.register(denoAdapter);
	registry.register(pyrightAdapter);
	registry.register(ruffAdapter);
	registry.register(rustAnalyzerAdapter);
	registry.register(fsharpAdapter);
	registry.register(moonbitAdapter);
	registry.register(goplsAdapter);
	registry.register(hlsAdapter);
	registry.register(ocamlAdapter);
}

//#endregion
//#region src/config/loader.ts
/**
* Default base configuration
*/
const DEFAULT_BASE_CONFIG = {
	files: [],
	settings: {
		autoIndex: false,
		indexConcurrency: 5,
		autoIndexDelay: 500,
		enableWatchers: true,
		memoryLimit: 1024
	},
	symbolFilter: {
		excludeKinds: [
			"Variable",
			"Constant",
			"String",
			"Number",
			"Boolean",
			"Array",
			"Object",
			"Key",
			"Null"
		],
		excludePatterns: [
			"callback",
			"temp",
			"tmp",
			"_",
			"^[a-z]$"
		],
		includeOnlyTopLevel: false
	},
	ignorePatterns: [
		"**/node_modules/**",
		"**/dist/**",
		"**/.git/**"
	],
	experiments: { memory: false }
};
/**
* Merge configurations with deep merging for nested objects
*/
function mergeConfigs(base, override) {
	const result = { ...base };
	if (override.preset !== void 0) result.preset = override.preset;
	if (override.memoryAdvanced !== void 0) {
		result.experiments = result.experiments || {};
		result.experiments.memory = override.memoryAdvanced;
	}
	if (override.experiments) result.experiments = {
		...base.experiments,
		...override.experiments
	};
	if (override.settings) result.settings = {
		...base.settings,
		...override.settings
	};
	if (override.symbolFilter) result.symbolFilter = {
		...base.symbolFilter,
		...override.symbolFilter
	};
	if (override.files !== void 0) result.files = override.files;
	if (override.ignorePatterns !== void 0) result.ignorePatterns = override.ignorePatterns;
	return result;
}
/**
* Registry for preset adapters
*/
var PresetRegistry = class {
	presets = /* @__PURE__ */ new Map();
	register(preset) {
		this.presets.set(preset.presetId, preset);
	}
	get(id) {
		return this.presets.get(id);
	}
	list() {
		return Array.from(this.presets.values());
	}
	has(id) {
		return this.presets.has(id);
	}
};
const globalPresetRegistry = new PresetRegistry();
registerBuiltinAdapters(globalPresetRegistry);
/**
* Configuration loader class
*/
var ConfigLoader = class {
	rootPath;
	cache;
	constructor(rootPath = process.cwd()) {
		this.rootPath = rootPath;
	}
	/**
	* Load configuration from sources
	*/
	async load(sources = {}, options = {}) {
		const opts = {
			validate: true,
			applyDefaults: true,
			...options
		};
		if (this.cache && !sources.config && !sources.configFile && !sources.preset) return this.cache;
		let result;
		if (sources.config) result = this.loadFromConfig(sources.config, opts);
		else if (sources.configFile) result = await this.loadFromFile(sources.configFile, opts);
		else if (sources.preset) result = this.loadFromPreset(sources.preset, opts);
		else {
			const configPath = this.findConfigFile();
			if (configPath) result = await this.loadFromFile(configPath, opts);
			else result = this.loadDefaults(opts);
		}
		this.cache = result;
		return result;
	}
	/**
	* Load configuration from a direct config object
	*/
	loadFromConfig(config, options) {
		const merged = options.applyDefaults ? this.mergeWithDefaults(config) : {
			...DEFAULT_BASE_CONFIG,
			...config
		};
		const validated = options.validate ? validateConfig(merged) : merged;
		return {
			config: validated,
			source: "config"
		};
	}
	/**
	* Load configuration from a file
	*/
	async loadFromFile(filePath, options) {
		const absolutePath = isAbsolute(filePath) ? filePath : join$1(this.rootPath, filePath);
		if (!existsSync$1(absolutePath)) throw new Error(`Configuration file not found: ${absolutePath}`);
		try {
			const content = readFileSync(absolutePath, "utf-8");
			const parsed = JSON.parse(content);
			let merged = { ...parsed };
			if (parsed.preset) {
				const registeredPreset = globalPresetRegistry.get(parsed.preset);
				if (registeredPreset) {
					const preset = registeredPreset;
					const presetConfig = {
						id: preset.presetId,
						name: preset.name || preset.presetId,
						bin: preset.bin,
						args: preset.args || [],
						binFindStrategy: preset.binFindStrategy,
						baseLanguage: preset.baseLanguage,
						initializationOptions: preset.initializationOptions,
						serverCharacteristics: preset.serverCharacteristics,
						unsupported: preset.unsupported,
						languageFeatures: preset.languageFeatures,
						files: preset.files
					};
					merged = {
						...presetConfig,
						...parsed
					};
					if (parsed.bin) merged.binFindStrategy = void 0;
					if (presetConfig.languageFeatures) {
						if (parsed.languageFeatures) merged.languageFeatures = this.mergeConfigObjects(presetConfig.languageFeatures, parsed.languageFeatures);
						else if (!("languageFeatures" in parsed)) merged.languageFeatures = presetConfig.languageFeatures;
					}
				} else {
					const registeredPreset$1 = globalPresetRegistry.get(parsed.preset);
					if (registeredPreset$1 && registeredPreset$1.files) {
						const presetConfig = {
							preset: parsed.preset,
							files: registeredPreset$1.files
						};
						merged = {
							...presetConfig,
							...parsed
						};
					}
				}
			}
			if (options.applyDefaults) merged = this.mergeWithDefaults(merged);
			else merged = merged;
			const finalConfig = options.validate ? {
				...validateConfig(merged),
				id: merged.id,
				name: merged.name,
				description: merged.description,
				bin: merged.bin,
				args: merged.args,
				binFindStrategy: merged.binFindStrategy,
				baseLanguage: merged.baseLanguage,
				initializationOptions: merged.initializationOptions,
				serverCharacteristics: merged.serverCharacteristics,
				unsupported: merged.unsupported,
				languageFeatures: merged.languageFeatures
			} : merged;
			return {
				config: finalConfig,
				source: "file"
			};
		} catch (error) {
			if (error instanceof SyntaxError) throw new Error(`Invalid JSON in config file ${absolutePath}: ${error.message}`);
			throw error;
		}
	}
	/**
	* Load configuration from a preset
	*/
	loadFromPreset(presetName, options) {
		const registeredPreset = globalPresetRegistry.get(presetName);
		if (registeredPreset) {
			const preset = registeredPreset;
			const config = {
				preset: presetName,
				files: preset.files,
				id: preset.presetId,
				name: preset.name || preset.presetId,
				bin: preset.bin,
				args: preset.args || [],
				binFindStrategy: preset.binFindStrategy,
				baseLanguage: preset.baseLanguage,
				initializationOptions: preset.initializationOptions,
				serverCharacteristics: preset.serverCharacteristics,
				unsupported: preset.unsupported,
				languageFeatures: preset.languageFeatures
			};
			const merged = options.applyDefaults ? this.mergeWithDefaults(config) : {
				...DEFAULT_BASE_CONFIG,
				...config
			};
			return {
				config: merged,
				source: "preset"
			};
		}
		const available = globalPresetRegistry.list().map((p) => p.presetId).join(", ");
		throw new Error(`Unknown preset: ${presetName}. Available presets: ${available}`);
	}
	/**
	* Load default configuration
	*/
	loadDefaults(options) {
		const config = options.validate ? validateConfig(DEFAULT_BASE_CONFIG) : DEFAULT_BASE_CONFIG;
		return {
			config,
			source: "default",
			warnings: ["No configuration found, using defaults"]
		};
	}
	/**
	* Find configuration file in standard locations
	*/
	findConfigFile() {
		const locations = [
			".lsmcp/config.json",
			"lsmcp.config.json",
			".lsmcprc.json",
			".lsmcprc"
		];
		for (const location of locations) {
			const path$3 = join$1(this.rootPath, location);
			if (existsSync$1(path$3)) return location;
		}
		return null;
	}
	/**
	* Merge configuration with defaults
	*/
	mergeWithDefaults(config) {
		const extendedFields = {};
		const extendedKeys = [
			"id",
			"name",
			"description",
			"bin",
			"args",
			"binFindStrategy",
			"baseLanguage",
			"initializationOptions",
			"serverCharacteristics",
			"unsupported",
			"languageFeatures"
		];
		for (const key of extendedKeys) if (config[key] !== void 0) extendedFields[key] = config[key];
		const merged = mergeConfigs(DEFAULT_BASE_CONFIG, config);
		const result = {
			...merged,
			...extendedFields
		};
		return result;
	}
	/**
	* Deep merge two configurations
	*/
	mergeConfigObjects(base, override) {
		const result = { ...base };
		for (const key in override) {
			const overrideValue = override[key];
			if (overrideValue === void 0) continue;
			if (overrideValue === null) {
				result[key] = null;
				continue;
			}
			if (typeof overrideValue === "object" && !Array.isArray(overrideValue)) {
				const baseValue = base[key];
				result[key] = this.mergeConfigObjects(baseValue || {}, overrideValue);
			} else result[key] = overrideValue;
		}
		return result;
	}
	/**
	* Get the list of available presets
	*/
	static getAvailablePresets() {
		return globalPresetRegistry.list().map((p) => p.presetId);
	}
	/**
	* Get preset configuration
	*/
	static getPreset(name) {
		const preset = globalPresetRegistry.get(name);
		if (preset && preset.files) return {
			preset: name,
			files: preset.files
		};
		return void 0;
	}
	/**
	* Validate a configuration object
	*/
	static validate(config) {
		return validateConfig(config);
	}
	/**
	* Clear the cache
	*/
	clearCache() {
		this.cache = void 0;
	}
};

//#endregion
//#region node_modules/.pnpm/neverthrow@8.2.0/node_modules/neverthrow/dist/index.cjs.js
var require_index_cjs = __commonJS({ "node_modules/.pnpm/neverthrow@8.2.0/node_modules/neverthrow/dist/index.cjs.js"(exports) {
	const defaultErrorConfig = { withStackTrace: false };
	const createNeverThrowError = (message, result, config = defaultErrorConfig) => {
		const data = result.isOk() ? {
			type: "Ok",
			value: result.value
		} : {
			type: "Err",
			value: result.error
		};
		const maybeStack = config.withStackTrace ? new Error().stack : void 0;
		return {
			data,
			message,
			stack: maybeStack
		};
	};
	/******************************************************************************
	
	Copyright (c) Microsoft Corporation.
	
	
	
	Permission to use, copy, modify, and/or distribute this software for any
	
	purpose with or without fee is hereby granted.
	
	
	
	THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
	
	REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
	
	AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
	
	INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
	
	LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
	
	OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
	
	PERFORMANCE OF THIS SOFTWARE.
	
	***************************************************************************** */
	function __awaiter(thisArg, _arguments, P, generator) {
		function adopt(value) {
			return value instanceof P ? value : new P(function(resolve$2) {
				resolve$2(value);
			});
		}
		return new (P || (P = Promise))(function(resolve$2, reject) {
			function fulfilled(value) {
				try {
					step(generator.next(value));
				} catch (e) {
					reject(e);
				}
			}
			function rejected(value) {
				try {
					step(generator["throw"](value));
				} catch (e) {
					reject(e);
				}
			}
			function step(result) {
				result.done ? resolve$2(result.value) : adopt(result.value).then(fulfilled, rejected);
			}
			step((generator = generator.apply(thisArg, _arguments || [])).next());
		});
	}
	function __values(o) {
		var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
		if (m) return m.call(o);
		if (o && typeof o.length === "number") return { next: function() {
			if (o && i >= o.length) o = void 0;
			return {
				value: o && o[i++],
				done: !o
			};
		} };
		throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
	}
	function __await(v) {
		return this instanceof __await ? (this.v = v, this) : new __await(v);
	}
	function __asyncGenerator(thisArg, _arguments, generator) {
		if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
		var g = generator.apply(thisArg, _arguments || []), i, q = [];
		return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function() {
			return this;
		}, i;
		function awaitReturn(f) {
			return function(v) {
				return Promise.resolve(v).then(f, reject);
			};
		}
		function verb(n, f) {
			if (g[n]) {
				i[n] = function(v) {
					return new Promise(function(a, b) {
						q.push([
							n,
							v,
							a,
							b
						]) > 1 || resume(n, v);
					});
				};
				if (f) i[n] = f(i[n]);
			}
		}
		function resume(n, v) {
			try {
				step(g[n](v));
			} catch (e) {
				settle(q[0][3], e);
			}
		}
		function step(r) {
			r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r);
		}
		function fulfill(value) {
			resume("next", value);
		}
		function reject(value) {
			resume("throw", value);
		}
		function settle(f, v) {
			if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]);
		}
	}
	function __asyncDelegator(o) {
		var i, p;
		return i = {}, verb("next"), verb("throw", function(e) {
			throw e;
		}), verb("return"), i[Symbol.iterator] = function() {
			return this;
		}, i;
		function verb(n, f) {
			i[n] = o[n] ? function(v) {
				return (p = !p) ? {
					value: __await(o[n](v)),
					done: false
				} : f ? f(v) : v;
			} : f;
		}
	}
	function __asyncValues(o) {
		if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
		var m = o[Symbol.asyncIterator], i;
		return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function() {
			return this;
		}, i);
		function verb(n) {
			i[n] = o[n] && function(v) {
				return new Promise(function(resolve$2, reject) {
					v = o[n](v), settle(resolve$2, reject, v.done, v.value);
				});
			};
		}
		function settle(resolve$2, reject, d, v) {
			Promise.resolve(v).then(function(v$1) {
				resolve$2({
					value: v$1,
					done: d
				});
			}, reject);
		}
	}
	var ResultAsync = class ResultAsync {
		constructor(res) {
			this._promise = res;
		}
		static fromSafePromise(promise) {
			const newPromise = promise.then((value) => new Ok(value));
			return new ResultAsync(newPromise);
		}
		static fromPromise(promise, errorFn) {
			const newPromise = promise.then((value) => new Ok(value)).catch((e) => new Err(errorFn(e)));
			return new ResultAsync(newPromise);
		}
		static fromThrowable(fn, errorFn) {
			return (...args) => {
				return new ResultAsync((() => __awaiter(this, void 0, void 0, function* () {
					try {
						return new Ok(yield fn(...args));
					} catch (error) {
						return new Err(errorFn ? errorFn(error) : error);
					}
				}))());
			};
		}
		static combine(asyncResultList) {
			return combineResultAsyncList(asyncResultList);
		}
		static combineWithAllErrors(asyncResultList) {
			return combineResultAsyncListWithAllErrors(asyncResultList);
		}
		map(f) {
			return new ResultAsync(this._promise.then((res) => __awaiter(this, void 0, void 0, function* () {
				if (res.isErr()) return new Err(res.error);
				return new Ok(yield f(res.value));
			})));
		}
		andThrough(f) {
			return new ResultAsync(this._promise.then((res) => __awaiter(this, void 0, void 0, function* () {
				if (res.isErr()) return new Err(res.error);
				const newRes = yield f(res.value);
				if (newRes.isErr()) return new Err(newRes.error);
				return new Ok(res.value);
			})));
		}
		andTee(f) {
			return new ResultAsync(this._promise.then((res) => __awaiter(this, void 0, void 0, function* () {
				if (res.isErr()) return new Err(res.error);
				try {
					yield f(res.value);
				} catch (e) {}
				return new Ok(res.value);
			})));
		}
		orTee(f) {
			return new ResultAsync(this._promise.then((res) => __awaiter(this, void 0, void 0, function* () {
				if (res.isOk()) return new Ok(res.value);
				try {
					yield f(res.error);
				} catch (e) {}
				return new Err(res.error);
			})));
		}
		mapErr(f) {
			return new ResultAsync(this._promise.then((res) => __awaiter(this, void 0, void 0, function* () {
				if (res.isOk()) return new Ok(res.value);
				return new Err(yield f(res.error));
			})));
		}
		andThen(f) {
			return new ResultAsync(this._promise.then((res) => {
				if (res.isErr()) return new Err(res.error);
				const newValue = f(res.value);
				return newValue instanceof ResultAsync ? newValue._promise : newValue;
			}));
		}
		orElse(f) {
			return new ResultAsync(this._promise.then((res) => __awaiter(this, void 0, void 0, function* () {
				if (res.isErr()) return f(res.error);
				return new Ok(res.value);
			})));
		}
		match(ok$7, _err) {
			return this._promise.then((res) => res.match(ok$7, _err));
		}
		unwrapOr(t) {
			return this._promise.then((res) => res.unwrapOr(t));
		}
		/**
		
		* @deprecated will be removed in 9.0.0.
		
		*
		
		* You can use `safeTry` without this method.
		
		* @example
		
		* ```typescript
		
		* safeTry(async function* () {
		
		*   const okValue = yield* yourResult
		
		* })
		
		* ```
		
		* Emulates Rust's `?` operator in `safeTry`'s body. See also `safeTry`.
		
		*/
		safeUnwrap() {
			return __asyncGenerator(this, arguments, function* safeUnwrap_1() {
				return yield __await(yield __await(yield* __asyncDelegator(__asyncValues(yield __await(this._promise.then((res) => res.safeUnwrap()))))));
			});
		}
		then(successCallback, failureCallback) {
			return this._promise.then(successCallback, failureCallback);
		}
		[Symbol.asyncIterator]() {
			return __asyncGenerator(this, arguments, function* _a() {
				const result = yield __await(this._promise);
				if (result.isErr()) yield yield __await(errAsync(result.error));
				return yield __await(result.value);
			});
		}
	};
	function okAsync(value) {
		return new ResultAsync(Promise.resolve(new Ok(value)));
	}
	function errAsync(err$7) {
		return new ResultAsync(Promise.resolve(new Err(err$7)));
	}
	const fromPromise = ResultAsync.fromPromise;
	const fromSafePromise = ResultAsync.fromSafePromise;
	const fromAsyncThrowable = ResultAsync.fromThrowable;
	/**
	
	* Short circuits on the FIRST Err value that we find
	
	*/
	const combineResultList = (resultList) => {
		let acc = ok$6([]);
		for (const result of resultList) if (result.isErr()) {
			acc = err$6(result.error);
			break;
		} else acc.map((list) => list.push(result.value));
		return acc;
	};
	const combineResultAsyncList = (asyncResultList) => ResultAsync.fromSafePromise(Promise.all(asyncResultList)).andThen(combineResultList);
	/**
	
	* Give a list of all the errors we find
	
	*/
	const combineResultListWithAllErrors = (resultList) => {
		let acc = ok$6([]);
		for (const result of resultList) if (result.isErr() && acc.isErr()) acc.error.push(result.error);
		else if (result.isErr() && acc.isOk()) acc = err$6([result.error]);
		else if (result.isOk() && acc.isOk()) acc.value.push(result.value);
		return acc;
	};
	const combineResultAsyncListWithAllErrors = (asyncResultList) => ResultAsync.fromSafePromise(Promise.all(asyncResultList)).andThen(combineResultListWithAllErrors);
	exports.Result = void 0;
	(function(Result) {
		/**
		
		* Wraps a function with a try catch, creating a new function with the same
		
		* arguments but returning `Ok` if successful, `Err` if the function throws
		
		*
		
		* @param fn function to wrap with ok on success or err on failure
		
		* @param errorFn when an error is thrown, this will wrap the error result if provided
		
		*/
		function fromThrowable$1(fn, errorFn) {
			return (...args) => {
				try {
					const result = fn(...args);
					return ok$6(result);
				} catch (e) {
					return err$6(errorFn ? errorFn(e) : e);
				}
			};
		}
		Result.fromThrowable = fromThrowable$1;
		function combine(resultList) {
			return combineResultList(resultList);
		}
		Result.combine = combine;
		function combineWithAllErrors(resultList) {
			return combineResultListWithAllErrors(resultList);
		}
		Result.combineWithAllErrors = combineWithAllErrors;
	})(exports.Result || (exports.Result = {}));
	function ok$6(value) {
		return new Ok(value);
	}
	function err$6(err$7) {
		return new Err(err$7);
	}
	function safeTry(body) {
		const n = body().next();
		if (n instanceof Promise) return new ResultAsync(n.then((r) => r.value));
		return n.value;
	}
	var Ok = class {
		constructor(value) {
			this.value = value;
		}
		isOk() {
			return true;
		}
		isErr() {
			return !this.isOk();
		}
		map(f) {
			return ok$6(f(this.value));
		}
		mapErr(_f) {
			return ok$6(this.value);
		}
		andThen(f) {
			return f(this.value);
		}
		andThrough(f) {
			return f(this.value).map((_value) => this.value);
		}
		andTee(f) {
			try {
				f(this.value);
			} catch (e) {}
			return ok$6(this.value);
		}
		orTee(_f) {
			return ok$6(this.value);
		}
		orElse(_f) {
			return ok$6(this.value);
		}
		asyncAndThen(f) {
			return f(this.value);
		}
		asyncAndThrough(f) {
			return f(this.value).map(() => this.value);
		}
		asyncMap(f) {
			return ResultAsync.fromSafePromise(f(this.value));
		}
		unwrapOr(_v) {
			return this.value;
		}
		match(ok$7, _err) {
			return ok$7(this.value);
		}
		safeUnwrap() {
			const value = this.value;
			return function* () {
				return value;
			}();
		}
		_unsafeUnwrap(_) {
			return this.value;
		}
		_unsafeUnwrapErr(config) {
			throw createNeverThrowError("Called `_unsafeUnwrapErr` on an Ok", this, config);
		}
		*[Symbol.iterator]() {
			return this.value;
		}
	};
	var Err = class {
		constructor(error) {
			this.error = error;
		}
		isOk() {
			return false;
		}
		isErr() {
			return !this.isOk();
		}
		map(_f) {
			return err$6(this.error);
		}
		mapErr(f) {
			return err$6(f(this.error));
		}
		andThrough(_f) {
			return err$6(this.error);
		}
		andTee(_f) {
			return err$6(this.error);
		}
		orTee(f) {
			try {
				f(this.error);
			} catch (e) {}
			return err$6(this.error);
		}
		andThen(_f) {
			return err$6(this.error);
		}
		orElse(f) {
			return f(this.error);
		}
		asyncAndThen(_f) {
			return errAsync(this.error);
		}
		asyncAndThrough(_f) {
			return errAsync(this.error);
		}
		asyncMap(_f) {
			return errAsync(this.error);
		}
		unwrapOr(v) {
			return v;
		}
		match(_ok, err$7) {
			return err$7(this.error);
		}
		safeUnwrap() {
			const error = this.error;
			return function* () {
				yield err$6(error);
				throw new Error("Do not use this generator out of `safeTry`");
			}();
		}
		_unsafeUnwrap(config) {
			throw createNeverThrowError("Called `_unsafeUnwrap` on an Err", this, config);
		}
		_unsafeUnwrapErr(_) {
			return this.error;
		}
		*[Symbol.iterator]() {
			const self = this;
			yield self;
			return self;
		}
	};
	const fromThrowable = exports.Result.fromThrowable;
	exports.Err = Err;
	exports.Ok = Ok;
	exports.ResultAsync = ResultAsync;
	exports.err = err$6;
	exports.errAsync = errAsync;
	exports.fromAsyncThrowable = fromAsyncThrowable;
	exports.fromPromise = fromPromise;
	exports.fromSafePromise = fromSafePromise;
	exports.fromThrowable = fromThrowable;
	exports.ok = ok$6;
	exports.okAsync = okAsync;
	exports.safeTry = safeTry;
} });

//#endregion
//#region src/tools/lsp/toolFactory.ts
/**
* Factory function for creating MCP tools with consistent structure
*
* @example
* ```typescript
* export const myTool = createTool({
*   name: "my_tool",
*   description: "Does something useful",
*   schema: z.object({ root: z.string() }),
*   handler: async (args) => {
*     // Tool implementation
*     return ok({ message: "Success" });
*   },
*   formatSuccess: (result) => result.message,
* });
* ```
*/
function createTool(options) {
	const { name, description, schema: schema$15, handler, formatSuccess, formatError: formatError$1 } = options;
	return {
		name,
		description,
		schema: schema$15,
		execute: async (args) => {
			try {
				const result = await handler(args);
				if (result.isOk()) return formatSuccess(result.value);
				else {
					if (formatError$1) throw formatError$1(result.error, args);
					throw new Error(`${name} failed: ${result.error}`);
				}
			} catch (error) {
				if (error instanceof Error) throw error;
				throw new Error(`${name} failed: ${String(error)}`);
			}
		}
	};
}
/**
* Factory function for creating LSP-based tools with language-aware error handling
*/
function createLSPTool(options) {
	const { language = "unknown",...rest } = options;
	return createTool({
		...rest,
		formatError: (error, _args) => {
			if (error.includes("not running") || error.includes("not initialized")) return new Error(`LSP not running for ${language}: ${error}`);
			if (error.includes("timeout") || error.includes("timed out")) return new Error(`LSP operation timeout for ${language}: ${error}`);
			return new Error(`LSP error for ${language}: ${error}`);
		}
	});
}

//#endregion
//#region src/tools/lsp/common.ts
/**
* Common function to resolve file and symbol position for LSP operations
*/
function resolveFileAndSymbol(params) {
	const pathToUse = params.relativePath;
	if (!pathToUse) throw new Error("relativePath must be provided");
	const { content: fileContent, uri: fileUri, absolutePath } = readFileWithUri(params.root, pathToUse);
	const lines = fileContent.split("\n");
	let lineIndex = 0;
	let symbolIndex = 0;
	if (params.line !== void 0) if (typeof params.line === "number") lineIndex = params.line - 1;
	else {
		lineIndex = lines.findIndex((l) => l.includes(params.line));
		if (lineIndex === -1) throw new Error(`Line containing "${params.line}" not found in ${pathToUse}`);
	}
	if (params.symbolName) {
		const lineContent = lines[lineIndex];
		symbolIndex = lineContent.indexOf(params.symbolName);
		if (symbolIndex === -1) throw new Error(`Symbol "${params.symbolName}" not found on line ${lineIndex + 1} in ${pathToUse}`);
	} else if (params.textTarget) {
		const targetText = params.textTarget;
		if (params.line === void 0) {
			for (let i = 0; i < lines.length; i++) {
				const idx = lines[i].indexOf(targetText);
				if (idx !== -1) {
					lineIndex = i;
					symbolIndex = idx;
					break;
				}
			}
			if (symbolIndex === -1) throw new Error(`Target "${targetText}" not found in ${pathToUse}`);
		} else {
			const lineContent = lines[lineIndex];
			symbolIndex = lineContent.indexOf(targetText);
			if (symbolIndex === -1) throw new Error(`Target "${targetText}" not found on line ${lineIndex + 1} in ${pathToUse}`);
		}
	}
	return {
		fileUri,
		fileContent,
		absolutePath,
		lines,
		lineIndex,
		symbolIndex
	};
}
/**
* Helper to read file with metadata (simplified version)
*/
/**
* Read file content and generate file URI
*/
function readFileWithUri(root, relativePath) {
	const absolutePath = resolve$1(root, relativePath);
	try {
		const content = fs$3.readFileSync(absolutePath, "utf-8");
		const uri = pathToFileURL(absolutePath).toString();
		return {
			content,
			uri,
			absolutePath
		};
	} catch (error) {
		throw new Error(`File not found: ${relativePath}`);
	}
}
/**
* Common LSP operation wrapper for opening document, executing operation, and closing
*/
async function withLSPDocument(client, fileUri, content, operation, delay = 500) {
	client.openDocument(fileUri, content);
	try {
		await new Promise((resolve$2) => setTimeout(resolve$2, delay));
		return await operation();
	} finally {
		client.closeDocument(fileUri);
	}
}

//#endregion
//#region src/tools/lsp/hover.ts
var import_index_cjs$5 = __toESM(require_index_cjs(), 1);
const schema$14 = z.object({
	root: z.string().describe("Root directory for resolving relative paths"),
	relativePath: z.string().describe("File path containing the symbol (relative to root)"),
	line: z.union([z.number(), z.string()]).describe("Line number (1-based) or string to match in the line").optional(),
	character: z.number().describe("Character position in the line (0-based)").optional(),
	column: z.number().describe("Column position in the line (0-based)").optional(),
	textTarget: z.string().describe("Text to find and get hover information for").optional()
});
/**
* Format hover result into GetHoverSuccess
*/
function formatHoverResult(result, request, targetLine, symbolPosition) {
	if (!result) return (0, import_index_cjs$5.ok)({
		message: `No hover information available${request.textTarget ? ` for "${request.textTarget}"` : ""} at ${request.relativePath}:${targetLine + 1}:${symbolPosition + 1}`,
		hover: null
	});
	const formattedContents = formatHoverContents$1(result.contents);
	let range;
	if (result.range) range = {
		start: {
			line: result.range.start.line + 1,
			character: result.range.start.character + 1
		},
		end: {
			line: result.range.end.line + 1,
			character: result.range.end.character + 1
		}
	};
	else {
		const resolution = resolveFileAndSymbol({
			root: request.root,
			relativePath: request.relativePath
		});
		const lines = resolution.lines;
		range = {
			start: {
				line: 1,
				character: 1
			},
			end: {
				line: lines.length,
				character: lines[lines.length - 1]?.length || 0
			}
		};
	}
	return (0, import_index_cjs$5.ok)({
		message: `Hover information for ${request.textTarget ? `"${request.textTarget}" at ` : ""}${request.relativePath}:${targetLine + 1}:${symbolPosition + 1}`,
		hover: {
			contents: formattedContents,
			range
		}
	});
}
/**
* Gets hover information for a TypeScript symbol using LSP
*/
async function getHover(request, client) {
	try {
		let resolution;
		let targetLine;
		let symbolPosition;
		if (request.line === void 0 && request.textTarget) {
			resolution = resolveFileAndSymbol({
				root: request.root,
				relativePath: request.relativePath,
				textTarget: request.textTarget
			});
			targetLine = resolution.lineIndex;
			symbolPosition = resolution.symbolIndex;
		} else if (request.line !== void 0) if (request.character !== void 0) {
			resolution = resolveFileAndSymbol({
				root: request.root,
				relativePath: request.relativePath,
				line: request.line
			});
			targetLine = resolution.lineIndex;
			symbolPosition = request.character;
		} else if (request.textTarget) {
			resolution = resolveFileAndSymbol({
				root: request.root,
				relativePath: request.relativePath,
				line: request.line,
				symbolName: request.textTarget
			});
			targetLine = resolution.lineIndex;
			symbolPosition = resolution.symbolIndex;
		} else {
			resolution = resolveFileAndSymbol({
				root: request.root,
				relativePath: request.relativePath,
				line: request.line
			});
			targetLine = resolution.lineIndex;
			symbolPosition = 0;
		}
		else return (0, import_index_cjs$5.err)("Either line or textTarget must be provided");
		const { fileUri, fileContent } = resolution;
		const languageId = getLanguageIdFromPath(request.relativePath);
		if (!client) return (0, import_index_cjs$5.err)("LSP client not available");
		const result = await withLSPOperation({
			client,
			fileUri,
			fileContent,
			languageId: languageId || void 0,
			timeout: 5e3,
			operation: async (client$1) => {
				return await client$1.getHover(fileUri, {
					line: targetLine,
					character: symbolPosition
				});
			},
			errorContext: {
				operation: "get_hover",
				relativePath: request.relativePath,
				symbolName: request.textTarget,
				line: request.line
			}
		});
		return formatHoverResult(result, request, targetLine, symbolPosition);
	} catch (error) {
		return (0, import_index_cjs$5.err)(error instanceof Error ? error.message : String(error));
	}
}
/**
* Formats hover contents from various LSP formats to a string
*/
function formatHoverContents$1(contents) {
	if (typeof contents === "string") return contents;
	else if (Array.isArray(contents)) return contents.map((content) => {
		if (typeof content === "string") return content;
		else return content.value;
	}).join("\n");
	else if (typeof contents === "object" && contents && "value" in contents) return contents.value;
	return "";
}
/**
* Create hover tool with injected LSP client
*/
function createHoverTool(client) {
	return createLSPTool({
		name: "lsp_get_hover",
		description: "Get hover information (type signature, documentation) at a specific position using LSP. Requires exact line:column coordinates.",
		schema: schema$14,
		language: "lsp",
		handler: (request) => getHover(request, client),
		formatSuccess: (result) => {
			const messages = [result.message];
			if (result.hover) messages.push(result.hover.contents);
			return messages.join("\n\n");
		}
	});
}

//#endregion
//#region src/tools/lsp/references.ts
var import_index_cjs$4 = __toESM(require_index_cjs(), 1);
function readFileWithMetadata$1(root, filePath) {
	const absolutePath = path.resolve(root, filePath);
	try {
		const fileContent = readFileSync(absolutePath, "utf-8");
		const fileUri = pathToFileURL(absolutePath).toString();
		return {
			fileContent,
			fileUri,
			absolutePath
		};
	} catch (error) {
		throw new Error(`File not found: ${filePath}`);
	}
}
const schema$13 = z.object({
	root: z.string().describe("Root directory for resolving relative paths"),
	relativePath: z.string().describe("File path containing the symbol (relative to root)"),
	line: z.union([z.number(), z.string()]).describe("Line number (1-based) or string to match in the line"),
	column: z.number().optional().describe("Character position in the line (0-based)"),
	symbolName: z.string().describe("Name of the symbol to find references for")
});
/**
* Finds all references to a symbol using LSP
*/
async function findReferencesWithLSP(request, client) {
	try {
		if (!client) return (0, import_index_cjs$4.err)("LSP client not available");
		let fileContent;
		let fileUri;
		try {
			const result = readFileWithMetadata$1(request.root, request.relativePath);
			fileContent = result.fileContent;
			fileUri = result.fileUri;
		} catch (error) {
			const context = {
				operation: "find references",
				filePath: request.relativePath,
				language: "lsp"
			};
			return (0, import_index_cjs$4.err)(formatError(error, context));
		}
		let targetLine;
		let symbolPosition;
		try {
			const result = validateLineAndSymbol(fileContent, request.line, request.symbolName, request.relativePath);
			targetLine = result.lineIndex;
			symbolPosition = result.symbolIndex;
		} catch (error) {
			const context = {
				operation: "symbol validation",
				filePath: request.relativePath,
				symbolName: request.symbolName,
				details: { line: request.line }
			};
			return (0, import_index_cjs$4.err)(formatError(error, context));
		}
		client.openDocument(fileUri, fileContent);
		await new Promise((resolve$2) => setTimeout(resolve$2, 1e3));
		const locations = await client.findReferences(fileUri, {
			line: targetLine,
			character: symbolPosition
		});
		const references = [];
		for (const location of locations) {
			const refPath = location.uri?.replace("file://", "") || "";
			let refContent;
			try {
				refContent = readFileSync(refPath, "utf-8");
			} catch (error) {
				continue;
			}
			const refLines = refContent.split("\n");
			const startLine = location.range.start.line;
			const startCol = location.range.start.character;
			const endCol = location.range.end.character;
			const refLineText = refLines[startLine] || "";
			const text = refLineText.substring(startCol, endCol);
			const prevLine = startLine > 0 ? refLines[startLine - 1] : "";
			const nextLine = startLine < refLines.length - 1 ? refLines[startLine + 1] : "";
			const preview = [
				prevLine && `${startLine}: ${prevLine}`,
				`${startLine + 1}: ${refLineText}`,
				nextLine && `${startLine + 2}: ${nextLine}`
			].filter(Boolean).join("\n");
			references.push({
				relativePath: path.relative(request.root, refPath),
				line: startLine + 1,
				column: startCol + 1,
				text,
				preview
			});
		}
		return (0, import_index_cjs$4.ok)({
			message: `Found ${references.length} reference${references.length === 1 ? "" : "s"} to "${request.symbolName}"`,
			references
		});
	} catch (error) {
		const context = {
			operation: "find references",
			filePath: request.relativePath,
			symbolName: request.symbolName,
			language: "lsp"
		};
		return (0, import_index_cjs$4.err)(formatError(error, context));
	}
}
/**
* Create references tool with injected LSP client
*/
function createReferencesTool(client) {
	return {
		name: "lsp_find_references",
		description: "Find all references to a symbol at a specific position using LSP. Requires exact line:column coordinates.",
		schema: schema$13,
		execute: async (args) => {
			const result = await findReferencesWithLSP(args, client);
			if (result.isOk()) {
				const messages = [result.value.message];
				if (result.value.references.length > 0) messages.push(result.value.references.map((ref) => `\n${ref.relativePath}:${ref.line}:${ref.column}\n${ref.preview}`).join("\n"));
				return messages.join("\n\n");
			} else throw new Error(result.error);
		}
	};
}

//#endregion
//#region src/tools/lsp/definitions.ts
var import_index_cjs$3 = __toESM(require_index_cjs(), 1);
function readFileWithMetadata(root, filePath) {
	const absolutePath = path.resolve(root, filePath);
	try {
		const fileContent = readFileSync(absolutePath, "utf-8");
		const fileUri = pathToFileURL(absolutePath).toString();
		return {
			fileContent,
			fileUri,
			absolutePath
		};
	} catch (error) {
		throw new Error(`File not found: ${filePath}`);
	}
}
const schema$12 = z.object({
	root: commonSchemas.root,
	relativePath: commonSchemas.relativePath.describe("File path containing the symbol (relative to root)"),
	line: commonSchemas.line,
	column: commonSchemas.character.optional().describe("Character position in the line (0-based)"),
	symbolName: commonSchemas.symbolName.describe("Name of the symbol to get definitions for"),
	before: commonSchemas.before.optional(),
	after: commonSchemas.after.optional(),
	includeBody: commonSchemas.includeBody.optional().describe("Include the full body of the symbol (for classes, functions, interfaces)")
});
/**
* Find the symbol containing the given position in a document symbols tree
*/
function findSymbolAtPosition(symbols, line, character) {
	for (const symbol of symbols) if ("range" in symbol) {
		const ds = symbol;
		const range = ds.range;
		if ((range.start.line < line || range.start.line === line && range.start.character <= character) && (range.end.line > line || range.end.line === line && range.end.character >= character)) {
			if (ds.children && ds.children.length > 0) {
				const childMatch = findSymbolAtPosition(ds.children, line, character);
				if (childMatch) return childMatch;
			}
			return ds;
		}
	} else {
		const si = symbol;
		const range = si.location.range;
		if ((range.start.line < line || range.start.line === line && range.start.character <= character) && (range.end.line > line || range.end.line === line && range.end.character >= character)) return si;
	}
	return null;
}
/**
* Gets definitions for a TypeScript symbol using LSP
*/
async function getDefinitionsWithLSP(request, client) {
	try {
		if (!client) return (0, import_index_cjs$3.err)("LSP client not available");
		const { fileContent, fileUri } = readFileWithMetadata(request.root, request.relativePath);
		const { lineIndex: targetLine, symbolIndex: symbolPosition } = validateLineAndSymbol(fileContent, request.line, request.symbolName, request.relativePath);
		client.openDocument(fileUri, fileContent);
		await new Promise((resolve$2) => setTimeout(resolve$2, 2e3));
		debug("[lspGetDefinitions] Getting definition for:", {
			fileUri,
			position: {
				line: targetLine,
				character: symbolPosition
			},
			symbolName: request.symbolName
		});
		const result = await client.getDefinition(fileUri, {
			line: targetLine,
			character: symbolPosition
		});
		const locations = result ? Array.isArray(result) ? result : [result] : [];
		debug("[lspGetDefinitions] Raw LSP result:", JSON.stringify(result, null, 2));
		debug("[lspGetDefinitions] Normalized locations:", JSON.stringify(locations, null, 2));
		const definitions = [];
		const contextBefore = request.before || 2;
		const contextAfter = request.after || 2;
		if (locations.length === 0) {
			debug("[lspGetDefinitions] No definitions found");
			return (0, import_index_cjs$3.ok)({
				message: `No definitions found for "${request.symbolName}"`,
				definitions: []
			});
		}
		for (const loc of locations) {
			let location;
			if ("targetUri" in loc) {
				const link = loc;
				location = {
					uri: link.targetUri,
					range: link.targetSelectionRange || link.targetRange
				};
			} else location = loc;
			let defPath = "";
			if (location.uri) {
				debug("[lspGetDefinitions] Processing location URI:", location.uri);
				defPath = location.uri.replace(/^file:\/\/\/?/, "/");
				if (defPath.match(/^\/[A-Za-z]:\//)) defPath = defPath.substring(1);
				debug("[lspGetDefinitions] Resolved path:", defPath);
			} else {
				debug("[lspGetDefinitions] Location has no URI:", location);
				continue;
			}
			let defContent;
			let defLines;
			try {
				defContent = readFileSync(defPath, "utf-8");
				defLines = defContent.split("\n");
			} catch (e) {
				continue;
			}
			const startLine = location.range.start.line;
			const startCol = location.range.start.character;
			const defLineText = defLines[startLine] || "";
			let symbolName = "";
			const identifierPattern = /[a-zA-Z_$][a-zA-Z0-9_$]*/g;
			let match;
			while ((match = identifierPattern.exec(defLineText)) !== null) if (match.index <= startCol && startCol < match.index + match[0].length) {
				symbolName = match[0];
				break;
			}
			if (!symbolName) symbolName = request.symbolName;
			let preview;
			if (request.includeBody) try {
				const defFileUri = `file://${defPath}`;
				const symbols = await client.getDocumentSymbols(defFileUri);
				const targetSymbol = findSymbolAtPosition(symbols, startLine, startCol);
				if (targetSymbol) {
					const symbolRange = "range" in targetSymbol ? targetSymbol.range : targetSymbol.location.range;
					const bodyLines = [];
					for (let i = symbolRange.start.line; i <= Math.min(defLines.length - 1, symbolRange.end.line); i++) bodyLines.push(`${i + 1}: ${defLines[i]}`);
					preview = bodyLines.join("\n");
				} else {
					const previewLines = [];
					for (let i = Math.max(0, startLine - contextBefore); i <= Math.min(defLines.length - 1, startLine + contextAfter); i++) previewLines.push(`${i + 1}: ${defLines[i]}`);
					preview = previewLines.join("\n");
				}
			} catch (e) {
				const previewLines = [];
				for (let i = Math.max(0, startLine - contextBefore); i <= Math.min(defLines.length - 1, startLine + contextAfter); i++) previewLines.push(`${i + 1}: ${defLines[i]}`);
				preview = previewLines.join("\n");
			}
			else {
				const previewLines = [];
				for (let i = Math.max(0, startLine - contextBefore); i <= Math.min(defLines.length - 1, startLine + contextAfter); i++) previewLines.push(`${i + 1}: ${defLines[i]}`);
				preview = previewLines.join("\n");
			}
			definitions.push({
				relativePath: path.relative(request.root, defPath),
				line: startLine + 1,
				column: startCol + 1,
				symbolName,
				preview
			});
		}
		return (0, import_index_cjs$3.ok)({
			message: `Found ${definitions.length} definition${definitions.length === 1 ? "" : "s"} for "${request.symbolName}"`,
			definitions
		});
	} catch (error) {
		return (0, import_index_cjs$3.err)(error instanceof Error ? error.message : String(error));
	}
}
/**
* Create definitions tool with injected LSP client
*/
function createDefinitionsTool(client) {
	return {
		name: "lsp_get_definitions",
		description: "Get the definition(s) of a symbol at a specific position using LSP. Requires exact line:column coordinates.",
		schema: schema$12,
		execute: async (args) => {
			const result = await getDefinitionsWithLSP(args, client);
			if (result.isOk()) {
				const messages = [result.value.message];
				if (result.value.definitions.length > 0) for (const def of result.value.definitions) messages.push(`\n${def.relativePath}:${def.line}:${def.column} - ${def.symbolName}\n${def.preview}`);
				return messages.join("\n\n");
			} else throw new Error(result.error);
		}
	};
}

//#endregion
//#region src/tools/lsp/diagnostics.ts
var import_index_cjs$2 = __toESM(require_index_cjs(), 1);
const schema$11 = z.object({
	root: z.string().describe("Root directory for resolving relative paths"),
	relativePath: z.string().describe("File path to check for diagnostics (relative to root)"),
	timeout: z.number().optional().describe("Timeout in milliseconds (default: 5000)"),
	forceRefresh: z.boolean().optional().describe("Force document refresh (default: true)")
});
/**
* Enhanced diagnostics with better error handling and debugging
*/
async function getDiagnosticsWithLSPV2(request, lspClient) {
	const startTime = Date.now();
	const timeout = request.timeout || 5e3;
	let attempts = 0;
	let method = "push";
	try {
		const fs$4 = await import("fs/promises");
		const path$3 = await import("path");
		const absolutePath = path$3.resolve(request.root, request.relativePath);
		const fileContent = await fs$4.readFile(absolutePath, "utf-8");
		const fileUri = `file://${absolutePath}`;
		const client = lspClient;
		if (!client) throw new Error("LSP client not provided");
		const languageId = getLanguageIdFromPath(request.relativePath);
		const documentWasOpen = client.isDocumentOpen(fileUri);
		const diagnostics = await waitForDiagnosticsWithRetry(client, fileUri, fileContent, languageId || void 0, {
			timeout,
			forceRefresh: request.forceRefresh !== false
		});
		const diagnosticSupport = client.getDiagnosticSupport();
		if (diagnostics.length > 0) if (diagnosticSupport.pushDiagnostics) method = "push";
		else if (diagnosticSupport.pullDiagnostics && typeof client.pullDiagnostics === "function") method = "pull";
		else method = "polling";
		attempts = Math.max(3, Math.floor((Date.now() - startTime) / 100));
		const builder = new DiagnosticResultBuilder(request.root, request.relativePath);
		builder.addLSPDiagnostics(diagnostics);
		const totalTime = Date.now() - startTime;
		if (!documentWasOpen) try {
			client.closeDocument(fileUri);
		} catch (cleanupError) {}
		const result = builder.build();
		return (0, import_index_cjs$2.ok)({
			...result,
			debug: {
				method,
				attempts,
				totalTime,
				documentWasOpen
			}
		});
	} catch (error) {
		const totalTime = Date.now() - startTime;
		const errorMessage = error instanceof Error ? error.message : String(error);
		defaultLog(LogLevel.ERROR, "DiagnosticsV2", `Failed after ${totalTime}ms: ${errorMessage}`, void 0, error instanceof Error ? error : void 0);
		return (0, import_index_cjs$2.err)(`Diagnostics failed: ${errorMessage} (${totalTime}ms, ${attempts} attempts)`);
	}
}
/**
* Create diagnostics tool with injected LSP client
*/
function createDiagnosticsTool(client) {
	return createLSPTool({
		name: "lsp_get_diagnostics",
		description: "Get diagnostics (errors, warnings) for a specific file using LSP. Provides detailed error and warning information.",
		schema: schema$11,
		language: "lsp",
		handler: (request) => getDiagnosticsWithLSPV2(request, client),
		formatSuccess: (result) => {
			const messages = [result.message, `\nDebug Info: ${result.debug.method} method, ${result.debug.attempts} attempts, ${result.debug.totalTime}ms`];
			if (result.diagnostics.length > 0) {
				messages.push(`\nFound ${result.diagnostics.length} diagnostic(s):`);
				for (const diag of result.diagnostics) {
					const sourceInfo = diag.source ? ` (${diag.source})` : "";
					messages.push(`\n${diag.severity.toUpperCase()}: ${diag.message}${sourceInfo}\n  at line ${diag.line}:${diag.column}`);
				}
			} else messages.push("\nNo diagnostics found.");
			return messages.join("\n");
		}
	});
}

//#endregion
//#region src/utils/applyTextEdits.ts
/**
* Apply text edits to a document content.
* Edits should be sorted in reverse order (last to first) before applying.
*/
function applyTextEdits(content, edits) {
	const sortedEdits = [...edits].sort((a, b) => {
		const lineDiff = b.range.start.line - a.range.start.line;
		if (lineDiff !== 0) return lineDiff;
		return b.range.start.character - a.range.start.character;
	});
	let lines = content.split("\n");
	for (const edit of sortedEdits) {
		const startLine = edit.range.start.line;
		const startChar = edit.range.start.character;
		const endLine = edit.range.end.line;
		const endChar = edit.range.end.character;
		if (startLine === endLine) {
			const line = lines[startLine] || "";
			lines[startLine] = line.substring(0, startChar) + edit.newText + line.substring(endChar);
		} else {
			const startLineText = lines[startLine] || "";
			const endLineText = lines[endLine] || "";
			const newContent = startLineText.substring(0, startChar) + edit.newText + endLineText.substring(endChar);
			lines.splice(startLine, endLine - startLine + 1, ...newContent.split("\n"));
		}
	}
	return lines.join("\n");
}

//#endregion
//#region src/tools/lsp/rename.ts
var import_index_cjs$1 = __toESM(require_index_cjs(), 1);
function parseLineNumber(content, line) {
	if (typeof line === "number") return line - 1;
	const lines = content.split("\n");
	const index = lines.findIndex((l) => l.includes(line));
	if (index === -1) throw new Error(`Line containing "${line}" not found`);
	return index;
}
function findSymbolInLine$1(lineContent, symbolName, occurrence = 0) {
	let index = -1;
	for (let i = 0; i <= occurrence; i++) {
		index = lineContent.indexOf(symbolName, index + 1);
		if (index === -1) throw new Error(`Symbol "${symbolName}" not found`);
	}
	return index;
}
function findTargetInFile(content, target) {
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const index = lines[i].indexOf(target);
		if (index !== -1) return {
			line: i,
			character: index
		};
	}
	throw new Error(`Target "${target}" not found in file`);
}
const schema$10 = z.object({
	root: z.string().describe("Root directory for resolving relative paths"),
	relativePath: z.string().describe("File path containing the symbol (relative to root)"),
	line: z.union([z.number(), z.string()]).describe("Line number (1-based) or string to match in the line").optional(),
	textTarget: z.string().describe("Symbol to rename"),
	newName: z.string().describe("New name for the symbol")
});
/**
* Helper to handle rename request when line is not provided
*/
async function performRenameWithoutLine(request, client) {
	try {
		const absolutePath = path.resolve(request.root, request.relativePath);
		const fileContent = readFileSync(absolutePath, "utf-8");
		const fileUri = `file://${absolutePath}`;
		const targetResult = findTargetInFile(fileContent, request.textTarget);
		const targetLine = targetResult.line;
		const symbolPosition = targetResult.character;
		return performRenameAtPosition(request, fileUri, fileContent, targetLine, symbolPosition, client);
	} catch (error) {
		return (0, import_index_cjs$1.err)(error instanceof Error ? error.message : String(error));
	}
}
/**
* Handle rename request when line is provided
*/
async function performRenameWithLine(request, client) {
	try {
		const absolutePath = path.resolve(request.root, request.relativePath);
		const fileContent = readFileSync(absolutePath, "utf-8");
		const fileUri = `file://${absolutePath}`;
		const targetLine = parseLineNumber(fileContent, request.line);
		const lines = fileContent.split("\n");
		const lineText = lines[targetLine] || "";
		const symbolPosition = findSymbolInLine$1(lineText, request.textTarget);
		return performRenameAtPosition(request, fileUri, fileContent, targetLine, symbolPosition, client);
	} catch (error) {
		return (0, import_index_cjs$1.err)(error instanceof Error ? error.message : String(error));
	}
}
/**
* Perform rename at a specific position
*/
async function performRenameAtPosition(request, fileUri, fileContent, targetLine, symbolPosition, client) {
	try {
		if (!client) return (0, import_index_cjs$1.err)("LSP client not available");
		const projectFiles = await findProjectFiles(request.root);
		for (const file of projectFiles) if (file !== path.resolve(request.root, request.relativePath)) try {
			const content = readFileSync(file, "utf-8");
			client.openDocument(`file://${file}`, content);
		} catch (e) {
			debug(`[lspRenameSymbol] Failed to open file: ${file}`, e);
		}
		client.openDocument(fileUri, fileContent);
		await new Promise((resolve$2) => setTimeout(resolve$2, 1e3));
		const position = {
			line: targetLine,
			character: symbolPosition
		};
		try {
			const prepareResult = await client.prepareRename(fileUri, position);
			if (prepareResult === null) return (0, import_index_cjs$1.err)(`Cannot rename symbol at line ${targetLine + 1}, column ${symbolPosition + 1}`);
		} catch {}
		let workspaceEdit = null;
		try {
			workspaceEdit = await client.rename(fileUri, position, request.newName);
		} catch (error) {
			if (error.code === -32601 || error.message?.includes("Unhandled method") || error.message?.includes("Method not found")) return (0, import_index_cjs$1.err)("LSP server doesn't support rename operation");
			throw error;
		}
		if (!workspaceEdit) return (0, import_index_cjs$1.err)("No changes from LSP rename operation");
		debug("[lspRenameSymbol] WorkspaceEdit from LSP:", JSON.stringify(workspaceEdit, null, 2));
		const result = await applyWorkspaceEdit(request.root, workspaceEdit);
		client.closeDocument(fileUri);
		for (const file of projectFiles) if (file !== path.resolve(request.root, request.relativePath)) try {
			client.closeDocument(`file://${file}`);
		} catch (e) {}
		return (0, import_index_cjs$1.ok)(result);
	} catch (error) {
		return (0, import_index_cjs$1.err)(error instanceof Error ? error.message : String(error));
	}
}
/**
* Apply workspace edit and return formatted result
*/
async function applyWorkspaceEdit(_root, workspaceEdit) {
	const changedFiles = [];
	const allFileContents = /* @__PURE__ */ new Map();
	if (workspaceEdit.changes) for (const [uri, _edits] of Object.entries(workspaceEdit.changes)) {
		if (!uri) continue;
		const filePath = uri.replace("file://", "");
		const content = readFileSync(filePath, "utf-8");
		allFileContents.set(filePath, content.split("\n"));
	}
	if (workspaceEdit.documentChanges) {
		for (const change of workspaceEdit.documentChanges) if ("textDocument" in change && change.textDocument?.uri) {
			const filePath = change.textDocument.uri.replace("file://", "");
			if (!allFileContents.has(filePath)) {
				const content = readFileSync(filePath, "utf-8");
				allFileContents.set(filePath, content.split("\n"));
			}
		}
	}
	if (workspaceEdit.changes) for (const [uri, edits] of Object.entries(workspaceEdit.changes)) {
		if (!uri) continue;
		const filePath = uri.replace("file://", "");
		const lines = allFileContents.get(filePath);
		if (!lines) continue;
		const fileChanges = processTextEdits(filePath, lines, edits);
		if (fileChanges.changes.length > 0) {
			changedFiles.push(fileChanges);
			const newContent = applyTextEdits(lines.join("\n"), edits);
			writeFileSync(filePath, newContent, "utf-8");
		}
	}
	if (workspaceEdit.documentChanges) {
		for (const change of workspaceEdit.documentChanges) if ("textDocument" in change && "edits" in change && change.textDocument?.uri) {
			const filePath = change.textDocument.uri.replace("file://", "");
			const lines = allFileContents.get(filePath);
			if (!lines) continue;
			const fileChanges = processTextEdits(filePath, lines, change.edits);
			if (fileChanges.changes.length > 0) {
				const existingFile = changedFiles.find((f) => f.filePath === filePath);
				if (existingFile) existingFile.changes.push(...fileChanges.changes);
				else changedFiles.push(fileChanges);
				const newContent = applyTextEdits(lines.join("\n"), change.edits);
				writeFileSync(filePath, newContent, "utf-8");
			}
		}
	}
	const totalChanges = changedFiles.reduce((sum, file) => sum + file.changes.length, 0);
	return {
		message: `Successfully renamed symbol in ${changedFiles.length} file(s) with ${totalChanges} change(s)`,
		changedFiles
	};
}
/**
* Process text edits and extract change information
*/
function processTextEdits(filePath, lines, edits) {
	const changes = [];
	for (const edit of edits) {
		const startLine = edit.range.start.line;
		const startCol = edit.range.start.character;
		const endLine = edit.range.end.line;
		const endCol = edit.range.end.character;
		let oldText = "";
		if (startLine === endLine) oldText = lines[startLine].substring(startCol, endCol);
		else {
			oldText = lines[startLine].substring(startCol);
			for (let i = startLine + 1; i < endLine; i++) oldText += "\n" + lines[i];
			oldText += "\n" + lines[endLine].substring(0, endCol);
		}
		changes.push({
			line: startLine + 1,
			column: startCol + 1,
			oldText,
			newText: edit.newText
		});
	}
	return {
		filePath,
		changes
	};
}
/**
* Handle rename symbol request
*/
async function handleRenameSymbol(request, client) {
	try {
		if (request.line !== void 0) return performRenameWithLine(request, client);
		else return performRenameWithoutLine(request, client);
	} catch (error) {
		return (0, import_index_cjs$1.err)(error instanceof Error ? error.message : String(error));
	}
}
/**
* Find all TypeScript/JavaScript files in the project
*/
async function findProjectFiles(rootPath) {
	const files = [];
	const extensions = [
		".ts",
		".tsx",
		".js",
		".jsx",
		".mts",
		".mjs"
	];
	function walkDir(dir) {
		try {
			const entries = readdirSync(dir);
			for (const entry of entries) {
				const fullPath = path.join(dir, entry);
				const stat$2 = statSync(fullPath);
				if (stat$2.isDirectory()) {
					if (entry !== "node_modules" && !entry.startsWith(".")) walkDir(fullPath);
				} else if (stat$2.isFile()) {
					const ext = path.extname(fullPath);
					if (extensions.includes(ext)) files.push(fullPath);
				}
			}
		} catch (e) {
			debug(`[lspRenameSymbol] Error walking directory ${dir}:`, e);
		}
	}
	walkDir(rootPath);
	return files;
}
/**
* Create rename symbol tool with injected LSP client
*/
function createRenameSymbolTool(client) {
	return {
		name: "lsp_rename_symbol",
		description: "Rename a symbol across the codebase using LSP. Requires exact position or text target in the specified line.",
		schema: schema$10,
		execute: async (args) => {
			const result = await handleRenameSymbol(args, client);
			if (result.isErr()) throw new Error(result.error);
			const { message, changedFiles } = result.value;
			const output = [
				message,
				"",
				"Changes:"
			];
			for (const file of changedFiles) {
				const relativePath = path.relative(args.root, file.filePath);
				output.push(`  ${relativePath}:`);
				for (const change of file.changes) output.push(`    Line ${change.line}: "${change.oldText}" → "${change.newText}"`);
			}
			return output.join("\n");
		}
	};
}

//#endregion
//#region src/tools/lsp/documentSymbols.ts
function formatRange(range) {
	return `${range.start.line + 1}:${range.start.character + 1}-${range.end.line + 1}:${range.end.character + 1}`;
}
function formatLocation(location) {
	return `${location.uri} ${formatRange(location.range)}`;
}
const schema$9 = fileLocationSchema;
function getSymbolKindName$2(kind) {
	const symbolKindNames = {
		[SymbolKind.File]: "File",
		[SymbolKind.Module]: "Module",
		[SymbolKind.Namespace]: "Namespace",
		[SymbolKind.Package]: "Package",
		[SymbolKind.Class]: "Class",
		[SymbolKind.Method]: "Method",
		[SymbolKind.Property]: "Property",
		[SymbolKind.Field]: "Field",
		[SymbolKind.Constructor]: "Constructor",
		[SymbolKind.Enum]: "Enum",
		[SymbolKind.Interface]: "Interface",
		[SymbolKind.Function]: "Function",
		[SymbolKind.Variable]: "Variable",
		[SymbolKind.Constant]: "Constant",
		[SymbolKind.String]: "String",
		[SymbolKind.Number]: "Number",
		[SymbolKind.Boolean]: "Boolean",
		[SymbolKind.Array]: "Array",
		[SymbolKind.Object]: "Object",
		[SymbolKind.Key]: "Key",
		[SymbolKind.Null]: "Null",
		[SymbolKind.EnumMember]: "EnumMember",
		[SymbolKind.Struct]: "Struct",
		[SymbolKind.Event]: "Event",
		[SymbolKind.Operator]: "Operator",
		[SymbolKind.TypeParameter]: "TypeParameter"
	};
	return symbolKindNames[kind] || "Unknown";
}
function formatDocumentSymbol(symbol, indent = "") {
	try {
		const kind = symbol.kind !== void 0 ? getSymbolKindName$2(symbol.kind) : "Unknown";
		const deprecated = symbol.deprecated ? " (deprecated)" : "";
		const name = symbol.name || "Unnamed";
		let result = `${indent}${name} [${kind}]${deprecated}`;
		if (symbol.detail) result += ` - ${symbol.detail}`;
		if (symbol.range) result += `\n${indent}  Range: ${formatRange(symbol.range)}`;
		if (symbol.children && symbol.children.length > 0) {
			result += "\n";
			for (const child of symbol.children) result += "\n" + formatDocumentSymbol(child, indent + "  ");
		}
		return result;
	} catch (err$7) {
		return `${indent}Error formatting symbol: ${err$7}`;
	}
}
function formatSymbolInformation$1(symbol) {
	try {
		const kind = symbol.kind !== void 0 ? getSymbolKindName$2(symbol.kind) : "Unknown";
		const deprecated = symbol.deprecated ? " (deprecated)" : "";
		const container = symbol.containerName ? ` in ${symbol.containerName}` : "";
		const name = symbol.name || "Unnamed";
		let result = `${name} [${kind}]${deprecated}${container}`;
		if (symbol.location && symbol.location.range) result += `\n  ${formatLocation(symbol.location)}`;
		return result;
	} catch (err$7) {
		return `Error formatting symbol: ${err$7}`;
	}
}
async function handleGetDocumentSymbols({ root, relativePath }, client) {
	if (!client) throw new Error("LSP client not initialized");
	const { fileUri, content } = await loadFileContext(root, relativePath, client.fileSystemApi);
	return withTemporaryDocument(client, fileUri, content, async () => {
		let symbols;
		try {
			symbols = await client.getDocumentSymbols(fileUri);
			console.log(`[DEBUG] Document symbols for ${relativePath}:`, JSON.stringify(symbols, null, 2));
		} catch (error) {
			debugLogWithPrefix("DEBUG", `Error getting document symbols for ${relativePath}:`, error);
			if (error && typeof error === "object" && "message" in error) {
				const errorMessage = String(error.message);
				if (errorMessage.includes("InvalidRequest") || errorMessage.includes("method not found")) return `Document symbols not supported by this language server for ${relativePath}`;
			}
			return `Error getting document symbols: ${error}`;
		}
		if (!symbols || symbols.length === 0) return `No symbols found in ${relativePath}`;
		let result = `Document symbols in ${relativePath}:\n\n`;
		try {
			for (const symbol of symbols) if ("location" in symbol && symbol.location) result += formatSymbolInformation$1(symbol) + "\n\n";
			else if ("range" in symbol || "children" in symbol || "selectionRange" in symbol) result += formatDocumentSymbol(symbol) + "\n\n";
			else {
				const kind = symbol.kind ? getSymbolKindName$2(symbol.kind) : "Unknown";
				const name = symbol.name || "Unnamed";
				result += `${name} [${kind}]\n\n`;
			}
		} catch (err$7) {
			result += "Error formatting symbols. Raw symbol names:\n";
			for (const symbol of symbols) if (symbol && typeof symbol === "object" && "name" in symbol) result += `- ${symbol.name}\n`;
		}
		return result.trim();
	});
}
/**
* Create document symbols tool with injected LSP client
*/
function createDocumentSymbolsTool(client) {
	return {
		name: "lsp_get_document_symbols",
		description: "Get all symbols in a document using LSP. Returns structured symbol hierarchy for the entire file.",
		schema: schema$9,
		execute: async (args) => {
			return handleGetDocumentSymbols(args, client);
		}
	};
}

//#endregion
//#region src/tools/lsp/completion.ts
const schema$8 = z.object({
	root: commonSchemas.root,
	relativePath: commonSchemas.relativePath,
	line: commonSchemas.line,
	column: commonSchemas.column.optional(),
	textTarget: z.string().describe("Text at the position to get completions for").optional(),
	resolve: z.boolean().describe("Whether to resolve completion items for additional details like auto-imports").optional().default(false),
	includeAutoImport: z.boolean().describe("Whether to include auto-import suggestions").optional().default(false)
});
function getCompletionItemKindName(kind) {
	if (!kind) return "Unknown";
	const kindNames = {
		[CompletionItemKind.Text]: "Text",
		[CompletionItemKind.Method]: "Method",
		[CompletionItemKind.Function]: "Function",
		[CompletionItemKind.Constructor]: "Constructor",
		[CompletionItemKind.Field]: "Field",
		[CompletionItemKind.Variable]: "Variable",
		[CompletionItemKind.Class]: "Class",
		[CompletionItemKind.Interface]: "Interface",
		[CompletionItemKind.Module]: "Module",
		[CompletionItemKind.Property]: "Property",
		[CompletionItemKind.Unit]: "Unit",
		[CompletionItemKind.Value]: "Value",
		[CompletionItemKind.Enum]: "Enum",
		[CompletionItemKind.Keyword]: "Keyword",
		[CompletionItemKind.Snippet]: "Snippet",
		[CompletionItemKind.Color]: "Color",
		[CompletionItemKind.File]: "File",
		[CompletionItemKind.Reference]: "Reference",
		[CompletionItemKind.Folder]: "Folder",
		[CompletionItemKind.EnumMember]: "EnumMember",
		[CompletionItemKind.Constant]: "Constant",
		[CompletionItemKind.Struct]: "Struct",
		[CompletionItemKind.Event]: "Event",
		[CompletionItemKind.Operator]: "Operator",
		[CompletionItemKind.TypeParameter]: "TypeParameter"
	};
	return kindNames[kind] || "Unknown";
}
function formatCompletionItem(item, showImportInfo = false) {
	const kind = getCompletionItemKindName(item.kind);
	let result = `${item.label} [${kind}]`;
	if (item.detail) result += `\n${item.detail}`;
	if (item.documentation) {
		const doc = typeof item.documentation === "string" ? item.documentation : item.documentation.value;
		if (doc) {
			const maxDocLength = 200;
			const truncatedDoc = doc.length > maxDocLength ? doc.substring(0, maxDocLength) + "..." : doc;
			result += `\n\n${truncatedDoc}`;
		}
	}
	if (showImportInfo && item.additionalTextEdits && item.additionalTextEdits.length > 0) {
		const importEdits = item.additionalTextEdits.filter((edit) => {
			const editText = edit.newText;
			return editText.includes("import") || editText.includes("from");
		});
		if (importEdits.length > 0) {
			result += "\n[Auto-import available]";
			for (const edit of importEdits) result += `\n  ${edit.newText.trim()}`;
		}
	}
	return result;
}
async function handleGetCompletion({ root, relativePath, line, column, textTarget, resolve: resolve$2, includeAutoImport }, client) {
	if (!client) throw new Error("LSP client not initialized");
	const { fileUri, content } = await loadFileContext(root, relativePath, client.fileSystemApi);
	const lineIndex = resolveLineIndexOrThrow(content, line, relativePath);
	const lines = content.split("\n");
	const lineText = lines[lineIndex];
	let character = lineText.length;
	if (column !== void 0) character = column;
	else if (textTarget) {
		const targetIndex = lineText.indexOf(textTarget);
		if (targetIndex !== -1) character = targetIndex + textTarget.length;
	}
	return withTemporaryDocument(client, fileUri, content, async () => {
		const handler = createAdvancedCompletionHandler({
			includeAutoImport,
			resolve: resolve$2
		});
		const completions = await client.getCompletion(fileUri, {
			line: lineIndex,
			character
		});
		const processedCompletions = handler.processCompletionItems(completions || []);
		const finalCompletions = processedCompletions.slice(0, 20);
		if (completions.length === 0) {
			const message = includeAutoImport ? `No auto-import completions available at ${relativePath}:${lineIndex + 1}:${character + 1}` : `No completions available at ${relativePath}:${lineIndex + 1}:${character + 1}`;
			return message;
		}
		let result = `Completions at ${relativePath}:${lineIndex + 1}:${character + 1}:\n\n`;
		for (const item of finalCompletions) result += formatCompletionItem(item, resolve$2) + "\n\n";
		return result.trim();
	});
}
/**
* Create completion tool with injected LSP client
*/
function createCompletionTool(client) {
	return {
		name: "lsp_get_completion",
		description: "Get code completion suggestions at a specific position using LSP. Requires exact line:column coordinates.",
		schema: schema$8,
		execute: async (args) => {
			return handleGetCompletion(args, client);
		}
	};
}

//#endregion
//#region src/tools/lsp/signatureHelp.ts
const schemaShape$5 = {
	root: z.string().describe("Root directory for resolving relative paths"),
	relativePath: z.string().describe("File path to get signature help for (relative to root)"),
	line: z.union([z.number(), z.string()]).describe("Line number (1-based) or string to match in the line"),
	textTarget: z.string().describe("Function call or text at the position to get signature help for").optional(),
	column: z.number().describe("Column position in the line (0-based)").optional()
};
const schema$7 = z.object(schemaShape$5);
function formatSignatureHelp(help) {
	if (help.signatures.length === 0) return "No signature help available";
	const activeSignature = help.activeSignature ?? 0;
	const signature = help.signatures[activeSignature];
	if (!signature) return "No active signature found";
	let result = "";
	result += `Signature: ${signature.label}\n`;
	if (signature.documentation) {
		const doc = typeof signature.documentation === "string" ? signature.documentation : signature.documentation.value;
		if (doc) result += `\nDocumentation:\n${doc}\n`;
	}
	if (signature.parameters && signature.parameters.length > 0) {
		result += "\nParameters:\n";
		const activeParameter = help.activeParameter ?? 0;
		for (let i = 0; i < signature.parameters.length; i++) {
			const param = signature.parameters[i];
			const isActive = i === activeParameter;
			const prefix = isActive ? "→ " : "  ";
			let paramName = "";
			if (typeof param.label === "string") paramName = param.label;
			else paramName = signature.label.substring(param.label[0], param.label[1]);
			result += `${prefix}${paramName}`;
			if (param.documentation) {
				const paramDoc = typeof param.documentation === "string" ? param.documentation : param.documentation.value;
				if (paramDoc) result += ` - ${paramDoc}`;
			}
			result += "\n";
		}
	}
	if (help.signatures.length > 1) result += `\nSignature ${activeSignature + 1} of ${help.signatures.length}`;
	return result;
}
async function handleGetSignatureHelp({ root, relativePath, line, column, textTarget }, client) {
	if (!client) throw new Error("LSP client not initialized");
	const absolutePath = path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath);
	await fs.access(absolutePath);
	const fileUri = pathToFileURL(absolutePath).toString();
	const content = await fs.readFile(absolutePath, "utf-8");
	const lines = content.split("\n");
	const lineIndex = resolveLineParameter(lines, line);
	const lineText = lines[lineIndex];
	let character = 0;
	if (column !== void 0) character = column;
	else if (textTarget) {
		const targetIndex = lineText.indexOf(textTarget);
		if (targetIndex !== -1) {
			character = targetIndex + textTarget.length;
			const afterTarget = lineText.substring(character);
			const parenIndex = afterTarget.indexOf("(");
			if (parenIndex !== -1) character += parenIndex + 1;
		}
	} else {
		const match = lineText.match(/\S/);
		if (match) character = match.index || 0;
	}
	return await withLSPDocument(client, fileUri, content, async () => {
		const help = await client.getSignatureHelp(fileUri, {
			line: lineIndex,
			character
		});
		if (!help) return `No signature help available at ${relativePath}:${lineIndex + 1}:${character + 1}`;
		const formatted = formatSignatureHelp(help);
		return `Signature help at ${relativePath}:${lineIndex + 1}:${character + 1}:\n\n${formatted}`;
	});
}
/**
* Create signature help tool with injected LSP client
*/
function createSignatureHelpTool(client) {
	return {
		name: "lsp_get_signature_help",
		description: "Get signature help (parameter hints) for function calls using LSP. Requires exact line:column position within a function call.",
		schema: schema$7,
		execute: async (args) => {
			return handleGetSignatureHelp(args, client);
		}
	};
}

//#endregion
//#region src/tools/lsp/formatting.ts
const schemaShape$4 = {
	root: z.string().describe("Root directory for resolving relative paths"),
	relativePath: z.string().describe("File path to format (relative to root)"),
	tabSize: z.number().default(2).describe("Number of spaces for indentation"),
	insertSpaces: z.boolean().default(true).describe("Use spaces instead of tabs"),
	trimTrailingWhitespace: z.boolean().default(true).describe("Trim trailing whitespace"),
	insertFinalNewline: z.boolean().default(true).describe("Insert final newline"),
	trimFinalNewlines: z.boolean().default(true).describe("Trim final newlines"),
	applyChanges: z.boolean().default(false).describe("Apply formatting changes to the file")
};
const schema$6 = z.object(schemaShape$4);
function formatTextEdit(edit, content) {
	const lines = content.split("\n");
	const startLine = edit.range.start.line;
	const endLine = edit.range.end.line;
	let originalText = "";
	if (startLine === endLine) {
		const line = lines[startLine] || "";
		originalText = line.substring(edit.range.start.character, edit.range.end.character);
	} else for (let i = startLine; i <= endLine && i < lines.length; i++) if (i === startLine) originalText += (lines[i] || "").substring(edit.range.start.character);
	else if (i === endLine) originalText += "\n" + (lines[i] || "").substring(0, edit.range.end.character);
	else originalText += "\n" + (lines[i] || "");
	const arrow = " → ";
	const newText = edit.newText;
	const maxLength = 50;
	const truncate = (text) => {
		if (text.length > maxLength) return text.substring(0, maxLength) + "...";
		return text;
	};
	const displayOld = truncate(originalText.replace(/\n/g, "\\n"));
	const displayNew = truncate(newText.replace(/\n/g, "\\n"));
	return `Line ${startLine + 1}:${edit.range.start.character + 1}: "${displayOld}"${arrow}"${displayNew}"`;
}
async function handleFormatDocument({ root, relativePath, tabSize, insertSpaces, trimTrailingWhitespace, insertFinalNewline, trimFinalNewlines, applyChanges }, client) {
	if (!client) throw new Error("LSP client not initialized");
	const absolutePath = path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath);
	await fs.access(absolutePath);
	const fileUri = pathToFileURL(absolutePath).toString();
	const content = await fs.readFile(absolutePath, "utf-8");
	client.openDocument(fileUri, content);
	try {
		await new Promise((resolve$2) => setTimeout(resolve$2, 500));
		const options = {
			tabSize,
			insertSpaces,
			trimTrailingWhitespace,
			insertFinalNewline,
			trimFinalNewlines
		};
		const edits = await client.formatDocument(fileUri, options);
		if (edits.length === 0) return `No formatting changes needed for ${relativePath}`;
		const sortedEdits = edits.sort((a, b) => {
			const lineDiff = b.range.start.line - a.range.start.line;
			if (lineDiff !== 0) return lineDiff;
			return b.range.start.character - a.range.start.character;
		});
		let result = `Formatting changes for ${relativePath}:\n\n`;
		for (const edit of sortedEdits) result += formatTextEdit(edit, content) + "\n";
		result += `\nTotal changes: ${edits.length}`;
		if (applyChanges) {
			const formattedContent = applyTextEdits(content, edits);
			await fs.writeFile(absolutePath, formattedContent, "utf-8");
			result += "\n\n✓ Changes applied to file";
		} else result += "\n\n(Use applyChanges: true to apply these changes)";
		return result;
	} finally {
		client.closeDocument(fileUri);
	}
}
/**
* Create format document tool with injected LSP client
*/
function createFormatDocumentTool(client) {
	return {
		name: "lsp_format_document",
		description: "Format an entire document using LSP's formatting provider. Applies language-specific formatting rules.",
		schema: schema$6,
		execute: async (args) => {
			return handleFormatDocument(args, client);
		}
	};
}

//#endregion
//#region src/tools/lsp/workspaceSymbols.ts
const schemaShape$3 = {
	query: z.string().describe("Search query for symbols (e.g., class name, function name)"),
	root: z.string().describe("Root directory for resolving relative paths").optional()
};
const schema$5 = z.object(schemaShape$3);
function getSymbolKindName$1(kind) {
	const symbolKindNames = {
		[SymbolKind.File]: "File",
		[SymbolKind.Module]: "Module",
		[SymbolKind.Namespace]: "Namespace",
		[SymbolKind.Package]: "Package",
		[SymbolKind.Class]: "Class",
		[SymbolKind.Method]: "Method",
		[SymbolKind.Property]: "Property",
		[SymbolKind.Field]: "Field",
		[SymbolKind.Constructor]: "Constructor",
		[SymbolKind.Enum]: "Enum",
		[SymbolKind.Interface]: "Interface",
		[SymbolKind.Function]: "Function",
		[SymbolKind.Variable]: "Variable",
		[SymbolKind.Constant]: "Constant",
		[SymbolKind.String]: "String",
		[SymbolKind.Number]: "Number",
		[SymbolKind.Boolean]: "Boolean",
		[SymbolKind.Array]: "Array",
		[SymbolKind.Object]: "Object",
		[SymbolKind.Key]: "Key",
		[SymbolKind.Null]: "Null",
		[SymbolKind.EnumMember]: "EnumMember",
		[SymbolKind.Struct]: "Struct",
		[SymbolKind.Event]: "Event",
		[SymbolKind.Operator]: "Operator",
		[SymbolKind.TypeParameter]: "TypeParameter"
	};
	return symbolKindNames[kind] || "Unknown";
}
function formatSymbolInformation(symbol, root) {
	const kind = getSymbolKindName$1(symbol.kind);
	const deprecated = symbol.deprecated ? " (deprecated)" : "";
	const container = symbol.containerName ? ` in ${symbol.containerName}` : "";
	let filePath = symbol.location.uri;
	try {
		const absolutePath = fileURLToPath(symbol.location.uri);
		if (root) filePath = absolutePath.startsWith(root + "/") ? absolutePath.substring(root.length + 1) : absolutePath;
		else filePath = absolutePath;
	} catch {}
	return `${symbol.name} [${kind}]${deprecated}${container}
  File: ${filePath}
  Range: ${symbol.location.range.start.line + 1}:${symbol.location.range.start.character + 1} - ${symbol.location.range.end.line + 1}:${symbol.location.range.end.character + 1}`;
}
async function handleGetWorkspaceSymbols({ query, root }, client) {
	if (!client) throw new Error("LSP client not initialized");
	const capabilities = client.getServerCapabilities();
	if (!capabilities?.workspaceSymbolProvider) {
		if (client.languageId === "typescript" || client.languageId === "javascript") throw new Error("Workspace symbols search is temporarily disabled for TypeScript/JavaScript. This feature requires proper project initialization which is not yet implemented for tsserver. Consider using document symbols or file search instead.");
		throw new Error("Workspace symbols search is not supported by this language server. This feature requires a language server with workspace symbol support.");
	}
	const symbols = await client.getWorkspaceSymbols(query);
	if (symbols.length === 0) return `No symbols found matching "${query}"`;
	const sortedSymbols = symbols.sort((a, b) => {
		const fileCompare = a.location.uri.localeCompare(b.location.uri);
		if (fileCompare !== 0) return fileCompare;
		const lineCompare = a.location.range.start.line - b.location.range.start.line;
		if (lineCompare !== 0) return lineCompare;
		return a.location.range.start.character - b.location.range.start.character;
	});
	let result = `Found ${symbols.length} symbol(s) matching "${query}":\n\n`;
	let currentFile = "";
	for (const symbol of sortedSymbols) {
		if (symbol.location.uri !== currentFile) {
			currentFile = symbol.location.uri;
			let displayPath = currentFile;
			try {
				const absolutePath = fileURLToPath(currentFile);
				displayPath = root && absolutePath.startsWith(root + "/") ? absolutePath.substring(root.length + 1) : absolutePath;
			} catch {}
			result += `\n=== ${displayPath} ===\n\n`;
		}
		result += formatSymbolInformation(symbol, root) + "\n\n";
	}
	return result.trim();
}
/**
* Create workspace symbols tool with injected LSP client
*/
function createWorkspaceSymbolsTool(client) {
	return {
		name: "lsp_get_workspace_symbols",
		description: "Search for symbols across the entire workspace using LSP. Note: Feature availability depends on language server support.",
		schema: schema$5,
		execute: async (args) => {
			return handleGetWorkspaceSymbols(args, client);
		}
	};
}

//#endregion
//#region src/tools/lsp/codeActions.ts
const schemaShape$2 = {
	root: z.string().describe("Root directory for resolving relative paths"),
	relativePath: z.string().describe("File path to get code actions for (relative to root)"),
	startLine: z.union([z.number(), z.string()]).describe("Start line number (1-based) or string to match"),
	endLine: z.union([z.number(), z.string()]).describe("End line number (1-based) or string to match").optional(),
	includeKinds: z.array(z.string()).describe("Filter for specific code action kinds (e.g., 'quickfix', 'refactor')").optional()
};
const schema$4 = z.object(schemaShape$2);
function getCodeActionKindName(kind) {
	if (!kind) return "General";
	if (kind === CodeActionKind.QuickFix) return "Quick Fix";
	if (kind === CodeActionKind.Refactor) return "Refactor";
	if (kind === CodeActionKind.RefactorExtract) return "Extract";
	if (kind === CodeActionKind.RefactorInline) return "Inline";
	if (kind === CodeActionKind.RefactorRewrite) return "Rewrite";
	if (kind === CodeActionKind.Source) return "Source";
	if (kind === CodeActionKind.SourceOrganizeImports) return "Organize Imports";
	if (kind === CodeActionKind.SourceFixAll) return "Fix All";
	return kind;
}
function isCommand(action) {
	return "command" in action && typeof action.command === "string";
}
function formatCodeAction(action) {
	if (isCommand(action)) {
		let result = `Command: ${action.title}`;
		if (action.command) result += ` (${action.command})`;
		return result;
	} else {
		const kind = getCodeActionKindName(action.kind);
		let result = `${action.title} [${kind}]`;
		if (action.isPreferred) result += " ★";
		if (action.disabled) result += ` (disabled: ${action.disabled.reason})`;
		if (action.diagnostics && action.diagnostics.length > 0) result += `\n  Fixes ${action.diagnostics.length} diagnostic(s)`;
		if (action.command) result += `\n  Command: ${action.command.command}`;
		if (action.edit) {
			const changes = action.edit.changes;
			if (changes) {
				const fileCount = Object.keys(changes).length;
				result += `\n  Edits ${fileCount} file(s)`;
			}
		}
		return result;
	}
}
async function handleGetCodeActions({ root, relativePath, startLine, endLine, includeKinds }, client) {
	if (!client) throw new Error("LSP client not initialized");
	const absolutePath = path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath);
	await fs.access(absolutePath);
	const fileUri = pathToFileURL(absolutePath).toString();
	const content = await fs.readFile(absolutePath, "utf-8");
	const lines = content.split("\n");
	const startLineIndex = resolveLineParameter(lines, startLine);
	let endLineIndex = startLineIndex;
	if (endLine !== void 0) endLineIndex = resolveLineParameter(lines, endLine);
	return await withLSPDocument(client, fileUri, content, async () => {
		const diagnostics = client.getDiagnostics(fileUri);
		const rangeDiagnostics = diagnostics.filter((d) => {
			const line = d.range.start.line;
			return line >= startLineIndex && line <= endLineIndex;
		});
		const range = {
			start: {
				line: startLineIndex,
				character: 0
			},
			end: {
				line: endLineIndex,
				character: content.split("\n")[endLineIndex]?.length ?? 0
			}
		};
		const actions = await client.getCodeActions(fileUri, range, { diagnostics: rangeDiagnostics });
		if (actions.length === 0) return `No code actions available for ${relativePath}:${startLineIndex + 1}-${endLineIndex + 1}`;
		let filteredActions = actions;
		if (includeKinds && includeKinds.length > 0) filteredActions = actions.filter((action) => {
			if (isCommand(action)) return false;
			return action.kind && includeKinds.some((k) => action.kind?.startsWith(k));
		});
		if (filteredActions.length === 0) return `No code actions matching the specified kinds found for ${relativePath}:${startLineIndex + 1}-${endLineIndex + 1}`;
		const grouped = /* @__PURE__ */ new Map();
		for (const action of filteredActions) {
			const kind = isCommand(action) ? "command" : action.kind || "general";
			if (!grouped.has(kind)) grouped.set(kind, []);
			grouped.get(kind).push(action);
		}
		let result = `Code actions for ${relativePath}:${startLineIndex + 1}-${endLineIndex + 1}:\n\n`;
		for (const [kind, kindActions] of grouped) {
			const kindName = getCodeActionKindName(kind);
			result += `=== ${kindName} ===\n`;
			for (const action of kindActions) result += formatCodeAction(action) + "\n\n";
		}
		return result.trim();
	});
}
/**
* Create code actions tool with injected LSP client
*/
function createCodeActionsTool(client) {
	return {
		name: "lsp_get_code_actions",
		description: "Get available code actions (quick fixes, refactorings) for a specific range using LSP. Requires line range specification.",
		schema: schema$4,
		execute: async (args) => {
			return handleGetCodeActions(args, client);
		}
	};
}

//#endregion
//#region src/tools/lsp/checkCapabilities.ts
const schemaShape$1 = {};
const schema$3 = z.object(schemaShape$1);
async function handleCheckCapabilities(client) {
	if (!client) throw new Error("LSP client not initialized");
	const capabilities = client.getServerCapabilities();
	if (!capabilities) return "No server capabilities available. The language server may not be fully initialized.";
	let result = "# Language Server Capabilities\n\n";
	result += `**Language ID**: ${client.languageId}\n\n`;
	result += "## Core Capabilities\n\n";
	const coreCapabilities = [
		{
			key: "hoverProvider",
			name: "Hover"
		},
		{
			key: "definitionProvider",
			name: "Go to Definition"
		},
		{
			key: "referencesProvider",
			name: "Find References"
		},
		{
			key: "documentSymbolProvider",
			name: "Document Symbols"
		},
		{
			key: "workspaceSymbolProvider",
			name: "Workspace Symbols"
		},
		{
			key: "completionProvider",
			name: "Code Completion"
		},
		{
			key: "signatureHelpProvider",
			name: "Signature Help"
		},
		{
			key: "documentFormattingProvider",
			name: "Document Formatting"
		},
		{
			key: "documentRangeFormattingProvider",
			name: "Range Formatting"
		},
		{
			key: "renameProvider",
			name: "Rename"
		},
		{
			key: "codeActionProvider",
			name: "Code Actions"
		}
	];
	for (const { key, name } of coreCapabilities) {
		const value = capabilities[key];
		const status = value ? "✅" : "❌";
		result += `- ${status} **${name}**: ${formatCapabilityValue(value)}\n`;
	}
	result += "\n## Text Document Synchronization\n\n";
	if (capabilities.textDocumentSync) {
		if (typeof capabilities.textDocumentSync === "number") result += `- Sync Kind: ${getSyncKindName(capabilities.textDocumentSync)}\n`;
		else if (typeof capabilities.textDocumentSync === "object") {
			const sync = capabilities.textDocumentSync;
			result += `- Open/Close: ${sync.openClose ? "✅" : "❌"}\n`;
			result += `- Change: ${sync.change !== void 0 ? getSyncKindName(sync.change) : "Not specified"}\n`;
			result += `- Save: ${formatSaveCapability(sync.save)}\n`;
		}
	} else result += "Text document synchronization not configured\n";
	if (capabilities.diagnosticProvider) {
		result += "\n## Diagnostic Provider\n\n";
		const diag = capabilities.diagnosticProvider;
		result += `- Identifier: ${diag.identifier || "Not specified"}\n`;
		result += `- Inter-file Dependencies: ${diag.interFileDependencies ? "✅" : "❌"}\n`;
		result += `- Workspace Diagnostics: ${diag.workspaceDiagnostics ? "✅" : "❌"}\n`;
	}
	if (capabilities.workspace && typeof capabilities.workspace === "object") {
		result += "\n## Workspace Capabilities\n\n";
		const workspace = capabilities.workspace;
		if (workspace.workspaceFolders) result += `- Workspace Folders: ✅\n`;
		if (workspace.fileOperations) {
			result += `- File Operations:\n`;
			if (workspace.fileOperations.willRename) result += `  - Will Rename: ✅\n`;
			if (workspace.fileOperations.didCreate) result += `  - Did Create: ✅\n`;
			if (workspace.fileOperations.didRename) result += `  - Did Rename: ✅\n`;
			if (workspace.fileOperations.didDelete) result += `  - Did Delete: ✅\n`;
		}
	}
	result += "\n## Raw Capabilities (Debug)\n\n";
	result += "```json\n";
	result += JSON.stringify(capabilities, null, 2);
	result += "\n```\n";
	return result.trim();
}
function formatCapabilityValue(value) {
	if (value === true) return "Supported";
	if (value === false || value === void 0 || value === null) return "Not supported";
	if (typeof value === "object") return "Supported (with options)";
	return String(value);
}
function getSyncKindName(kind) {
	switch (kind) {
		case 0: return "None";
		case 1: return "Full";
		case 2: return "Incremental";
		default: return `Unknown (${kind})`;
	}
}
function formatSaveCapability(save) {
	if (save === true) return "✅ Supported";
	if (save === false || save === void 0) return "❌ Not supported";
	if (typeof save === "object" && save.includeText) return "✅ Supported (with text)";
	return "✅ Supported";
}
/**
* Create check capabilities tool with injected LSP client
*/
function createCheckCapabilitiesTool(client) {
	return {
		name: "lsp_check_capabilities",
		description: "Check the capabilities of the current LSP server. Shows which features are supported.",
		schema: schema$3,
		execute: async () => {
			return handleCheckCapabilities(client);
		}
	};
}

//#endregion
//#region src/tools/lsp/deleteSymbol.ts
const schemaShape = {
	root: z.string().describe("Root directory for resolving relative paths"),
	relativePath: z.string().describe("File path containing the symbol (relative to root)"),
	line: z.union([z.number(), z.string()]).describe("Line number (1-based) or string to match in the line"),
	textTarget: z.string().describe("Name of the symbol to delete"),
	removeReferences: z.boolean().optional().default(true).describe("Also delete all references to the symbol")
};
const schema$2 = z.object(schemaShape);
async function handleDeleteSymbol({ root, relativePath, line, textTarget, removeReferences = true }, client) {
	if (!client) throw new Error("LSP client not initialized");
	const absolutePath = path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath);
	const fileUri = pathToFileURL(absolutePath).toString();
	const content = await fs.readFile(absolutePath, "utf-8");
	client.openDocument(fileUri, content);
	let locations = [];
	try {
		const lines = content.split("\n");
		const lineIndex = resolveLineParameter(lines, line);
		const resolvedLine = lineIndex + 1;
		const lineContent = lines[lineIndex];
		const symbolIndex = lineContent.indexOf(textTarget);
		if (symbolIndex === -1) throw new Error(`Symbol "${textTarget}" not found on line ${resolvedLine}: "${lineContent.trim()}"`);
		const position = {
			line: lineIndex,
			character: symbolIndex
		};
		locations = removeReferences ? await client.findReferences(fileUri, position) : [{
			uri: fileUri,
			range: {
				start: position,
				end: position
			}
		}];
		if (locations.length === 0) return {
			applied: false,
			deletedFromFiles: /* @__PURE__ */ new Set(),
			totalDeleted: 0,
			failureReason: "No references found for the symbol"
		};
		const workspaceEdit = { changes: {} };
		const fileChanges = /* @__PURE__ */ new Map();
		for (const location of locations) {
			const ranges = fileChanges.get(location.uri) || [];
			ranges.push(location.range);
			fileChanges.set(location.uri, ranges);
		}
		for (const [uri, ranges] of fileChanges) {
			const sortedRanges = ranges.sort((a, b) => {
				if (a.start.line !== b.start.line) return b.start.line - a.start.line;
				return b.start.character - a.start.character;
			});
			let fileContent;
			let fileLines;
			if (uri === fileUri) {
				fileContent = content;
				fileLines = lines;
			} else {
				const absoluteFilePath = fileURLToPath(uri);
				fileContent = await fs.readFile(absoluteFilePath, "utf-8");
				fileLines = fileContent.split("\n");
				client.openDocument(uri, fileContent);
			}
			const edits = [];
			for (const range of sortedRanges) {
				const lineText = fileLines[range.start.line];
				const beforeSymbol = lineText.substring(0, range.start.character).trim();
				const afterSymbol = lineText.substring(range.end.character).trim();
				if (!beforeSymbol && !afterSymbol) edits.push({
					range: {
						start: {
							line: range.start.line,
							character: 0
						},
						end: {
							line: range.start.line + 1,
							character: 0
						}
					},
					newText: ""
				});
				else edits.push({
					range,
					newText: ""
				});
			}
			workspaceEdit.changes[uri] = edits;
		}
		const result = await client.applyEdit(workspaceEdit, `Delete symbol "${textTarget}"`);
		if (!result.applied) return {
			applied: false,
			deletedFromFiles: /* @__PURE__ */ new Set(),
			totalDeleted: 0,
			failureReason: result.failureReason || "Failed to apply workspace edit"
		};
		return {
			applied: true,
			deletedFromFiles: new Set(fileChanges.keys()),
			totalDeleted: locations.length
		};
	} finally {
		for (const uri of new Set([fileUri, ...locations.map((l) => l.uri)])) client.closeDocument(uri);
	}
}
function formatDeleteSymbolResult(result) {
	if (!result.applied) return `Failed to delete symbol: ${result.failureReason}`;
	const fileCount = result.deletedFromFiles.size;
	const fileList = Array.from(result.deletedFromFiles).map((uri) => {
		try {
			return fileURLToPath(uri);
		} catch {
			return uri;
		}
	}).join("\n  ");
	return `Successfully deleted symbol from ${fileCount} file(s) with ${result.totalDeleted} occurrence(s)\n\nModified files:\n  ${fileList}`;
}
function createDeleteSymbolTool(client) {
	return {
		name: "lsp_delete_symbol",
		description: "Delete a symbol and optionally all its references using LSP. Requires exact line:column position of the symbol.",
		schema: schema$2,
		execute: async (args) => {
			const result = await handleDeleteSymbol(args, client);
			return formatDeleteSymbolResult(result);
		}
	};
}

//#endregion
//#region src/tools/lsp/createLspTools.ts
/**
* Create all LSP tools with an injected client
*/
function createLSPTools(client) {
	return [
		createHoverTool(client),
		createReferencesTool(client),
		createDefinitionsTool(client),
		createDiagnosticsTool(client),
		createRenameSymbolTool(client),
		createDocumentSymbolsTool(client),
		createCompletionTool(client),
		createSignatureHelpTool(client),
		createFormatDocumentTool(client),
		createWorkspaceSymbolsTool(client),
		createCodeActionsTool(client),
		createCheckCapabilitiesTool(client),
		createDeleteSymbolTool(client)
	];
}

//#endregion
//#region packages/code-indexer/src/utils/gitUtils.ts
var import_index_cjs = __toESM(require_index_cjs(), 1);
/**
* Execute git command asynchronously with streaming output
*/
async function executeGitCommand(command, args, cwd, options) {
	const timeout = options?.timeout ?? 3e4;
	const maxOutputSize = options?.maxOutputSize ?? 200 * 1024 * 1024;
	return new Promise((resolve$2, reject) => {
		const proc = spawn(command, args, {
			cwd,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		});
		let stdout = "";
		let stderr = "";
		let outputSize = 0;
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			proc.kill("SIGTERM");
			reject(new Error(`Command timed out after ${timeout}ms`));
		}, timeout);
		proc.stdout.on("data", (chunk) => {
			const chunkStr = chunk.toString();
			outputSize += chunkStr.length;
			if (outputSize > maxOutputSize) {
				proc.kill("SIGTERM");
				clearTimeout(timer);
				reject(new Error(`Output exceeded max size of ${maxOutputSize} bytes`));
				return;
			}
			stdout += chunkStr;
		});
		proc.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		proc.on("close", (code) => {
			clearTimeout(timer);
			if (timedOut) return;
			if (code === 0) resolve$2(stdout);
			else {
				const errorMsg = stderr || `Command failed with code ${code}`;
				reject(new Error(errorMsg));
			}
		});
		proc.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
	});
}
/**
* Get current git commit hash (async)
*/
async function getGitHashAsync(rootPath) {
	if (!existsSync$1(join$1(rootPath, ".git"))) return (0, import_index_cjs.err)({
		type: "NOT_GIT_REPO",
		message: `Not a git repository: ${rootPath}`
	});
	try {
		const output = await executeGitCommand("git", ["rev-parse", "HEAD"], rootPath);
		return (0, import_index_cjs.ok)(output.trim());
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		debugLogWithPrefix("gitUtils", `getGitHash error: ${message}`);
		if (message.includes("timed out")) return (0, import_index_cjs.err)({
			type: "TIMEOUT",
			message: `Git command timed out`,
			timeout: 3e4
		});
		return (0, import_index_cjs.err)({
			type: "COMMAND_FAILED",
			message,
			command: "git rev-parse HEAD"
		});
	}
}
/**
* Check if a hash exists in the repository
*/
async function checkHashExists(rootPath, hash) {
	try {
		await executeGitCommand("git", [
			"cat-file",
			"-e",
			`${hash}^{commit}`
		], rootPath, { timeout: 5e3 });
		return true;
	} catch {
		return false;
	}
}
/**
* Get list of modified files since a commit (async)
*/
async function getModifiedFilesAsync(rootPath, sinceHash) {
	debugLogWithPrefix("gitUtils", `getModifiedFiles called with sinceHash: ${sinceHash}`);
	if (!sinceHash || sinceHash.length < 7) return (0, import_index_cjs.err)({
		type: "INVALID_HASH",
		message: `Invalid hash format: ${sinceHash}`
	});
	const hashExists = await checkHashExists(rootPath, sinceHash);
	if (!hashExists) {
		debugLogWithPrefix("gitUtils", `Hash ${sinceHash} not found in repository`);
		return (0, import_index_cjs.err)({
			type: "HASH_NOT_FOUND",
			message: `Hash not found in repository`,
			hash: sinceHash
		});
	}
	try {
		const [committedChanges, stagedChanges, unstagedChanges] = await Promise.all([
			executeGitCommand("git", [
				"diff",
				"--name-only",
				sinceHash,
				"HEAD"
			], rootPath),
			executeGitCommand("git", [
				"diff",
				"--name-only",
				"--cached"
			], rootPath),
			executeGitCommand("git", ["diff", "--name-only"], rootPath)
		]);
		const allChanges = /* @__PURE__ */ new Set();
		const addChanges = (output) => {
			output.split("\n").filter((file) => file.length > 0).map((file) => file.trim()).forEach((file) => allChanges.add(file));
		};
		addChanges(committedChanges);
		addChanges(stagedChanges);
		addChanges(unstagedChanges);
		const result = Array.from(allChanges);
		debugLogWithPrefix("gitUtils", `Found ${result.length} modified files`);
		if (result.length > 1e4) debugLogWithPrefix("gitUtils", `WARNING: Large number of modified files (${result.length}). This may impact performance.`);
		return (0, import_index_cjs.ok)(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		debugLogWithPrefix("gitUtils", `getModifiedFiles error: ${message}`);
		if (message.includes("timed out")) return (0, import_index_cjs.err)({
			type: "TIMEOUT",
			message: `Git command timed out`,
			timeout: 3e4
		});
		if (message.includes("exceeded max size")) return (0, import_index_cjs.err)({
			type: "COMMAND_FAILED",
			message: `Buffer overflow: Too many files changed`,
			command: "git diff"
		});
		return (0, import_index_cjs.err)({
			type: "COMMAND_FAILED",
			message,
			command: "git diff"
		});
	}
}
/**
* Get list of untracked files (async)
*/
async function getUntrackedFilesAsync(rootPath) {
	try {
		const output = await executeGitCommand("git", [
			"ls-files",
			"--others",
			"--exclude-standard"
		], rootPath);
		const files = output.split("\n").filter((file) => file.length > 0).map((file) => file.trim());
		debugLogWithPrefix("gitUtils", `Found ${files.length} untracked files`);
		return (0, import_index_cjs.ok)(files);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		debugLogWithPrefix("gitUtils", `getUntrackedFiles error: ${message}`);
		if (message.includes("timed out")) return (0, import_index_cjs.err)({
			type: "TIMEOUT",
			message: `Git command timed out`,
			timeout: 3e4
		});
		return (0, import_index_cjs.err)({
			type: "COMMAND_FAILED",
			message,
			command: "git ls-files --others"
		});
	}
}
/**
* Get file's last commit hash (async)
*/
async function getFileGitHash(rootPath, filePath) {
	try {
		const relPath = relative(rootPath, filePath);
		const output = await executeGitCommand("git", [
			"log",
			"-1",
			"--format=%H",
			"--",
			relPath
		], rootPath);
		return (0, import_index_cjs.ok)(output.trim() || null);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes("fatal: your current branch") || message.includes("does not have any commits yet")) return (0, import_index_cjs.ok)(null);
		debugLogWithPrefix("gitUtils", `getFileGitHash error: ${message}`);
		if (message.includes("timed out")) return (0, import_index_cjs.err)({
			type: "TIMEOUT",
			message: `Git command timed out`,
			timeout: 3e4
		});
		return (0, import_index_cjs.err)({
			type: "COMMAND_FAILED",
			message,
			command: "git log"
		});
	}
}

//#endregion
//#region packages/code-indexer/src/engine/contentHash.ts
/**
* Calculate SHA1 hash of string content
* SHA1 is faster than SHA256 and sufficient for content comparison
*/
function getContentHash(content) {
	return createHash("sha1").update(content).digest("hex");
}

//#endregion
//#region packages/code-indexer/src/engine/fileDiffDetector.ts
/**
* Optimized content-based diff checker with early exit strategies
*/
var ContentHashDiffChecker = class {
	recentHashes = /* @__PURE__ */ new Map();
	MAX_CACHE_SIZE = 100;
	CACHE_TTL = 5e3;
	checkFile(content, existingFile) {
		if (!existingFile) {
			const contentHash$1 = this.computeHashWithCache(content);
			return {
				hasChanged: true,
				contentHash: contentHash$1,
				reason: "new"
			};
		}
		const contentHash = this.computeHashWithCache(content);
		if (existingFile.contentHash === contentHash) return {
			hasChanged: false,
			contentHash,
			reason: "unchanged"
		};
		return {
			hasChanged: true,
			contentHash,
			reason: "content-changed"
		};
	}
	computeHashWithCache(content) {
		if (content.length < 100) return getContentHash(content);
		const cacheKey = this.createCacheKey(content);
		const cached = this.recentHashes.get(cacheKey);
		if (cached) {
			const now = Date.now();
			if (now - cached.timestamp < this.CACHE_TTL) return cached.hash;
			this.recentHashes.delete(cacheKey);
		}
		const hash = getContentHash(content);
		this.addToCache(cacheKey, hash);
		return hash;
	}
	createCacheKey(content) {
		const len = content.length;
		if (len < 100) return content;
		return `${content.slice(0, 50)}...${content.slice(-50)}:${len}`;
	}
	addToCache(key, hash) {
		if (this.recentHashes.size >= this.MAX_CACHE_SIZE) {
			const firstKey = this.recentHashes.keys().next().value;
			if (firstKey) this.recentHashes.delete(firstKey);
		}
		this.recentHashes.set(key, {
			hash,
			timestamp: Date.now()
		});
	}
	/**
	* Clear the cache (useful for tests or memory management)
	*/
	clearCache() {
		this.recentHashes.clear();
	}
};

//#endregion
//#region packages/code-indexer/src/config/config.ts
/**
* Convert string symbol kind names to SymbolKind enum values
*/
function parseSymbolKinds(kinds) {
	const kindMap = {
		File: SymbolKind.File,
		Module: SymbolKind.Module,
		Namespace: SymbolKind.Namespace,
		Package: SymbolKind.Package,
		Class: SymbolKind.Class,
		Method: SymbolKind.Method,
		Property: SymbolKind.Property,
		Field: SymbolKind.Field,
		Constructor: SymbolKind.Constructor,
		Enum: SymbolKind.Enum,
		Interface: SymbolKind.Interface,
		Function: SymbolKind.Function,
		Variable: SymbolKind.Variable,
		Constant: SymbolKind.Constant,
		String: SymbolKind.String,
		Number: SymbolKind.Number,
		Boolean: SymbolKind.Boolean,
		Array: SymbolKind.Array,
		Object: SymbolKind.Object,
		Key: SymbolKind.Key,
		Null: SymbolKind.Null,
		EnumMember: SymbolKind.EnumMember,
		Struct: SymbolKind.Struct,
		Event: SymbolKind.Event,
		Operator: SymbolKind.Operator,
		TypeParameter: SymbolKind.TypeParameter
	};
	return kinds.map((kind) => kindMap[kind]).filter((kind) => kind !== void 0);
}
/**
* Check if a symbol should be excluded based on configuration
*/
function shouldExcludeSymbol(symbol, config) {
	if (config.excludeKinds) {
		const excludedKinds = parseSymbolKinds(config.excludeKinds);
		if (excludedKinds.includes(symbol.kind)) return true;
	}
	if (config.excludePatterns) for (const pattern of config.excludePatterns) try {
		const regex = new RegExp(pattern);
		if (regex.test(symbol.name)) return true;
	} catch {
		if (symbol.name.includes(pattern)) return true;
	}
	return false;
}

//#endregion
//#region packages/code-indexer/src/engine/SymbolIndex.ts
var SymbolIndex = class extends EventEmitter {
	fileIndex = /* @__PURE__ */ new Map();
	symbolIndex = /* @__PURE__ */ new Map();
	kindIndex = /* @__PURE__ */ new Map();
	containerIndex = /* @__PURE__ */ new Map();
	stats = {
		totalFiles: 0,
		totalSymbols: 0,
		indexingTime: 0,
		lastUpdated: /* @__PURE__ */ new Date()
	};
	config;
	diffChecker;
	constructor(rootPath, symbolProvider, fileSystem, cache, diffChecker) {
		super();
		this.rootPath = rootPath;
		this.symbolProvider = symbolProvider;
		this.fileSystem = fileSystem;
		this.cache = cache;
		this.diffChecker = diffChecker || new ContentHashDiffChecker();
	}
	/**
	* Index a single file
	*/
	async indexFile(filePath) {
		const absolutePath = resolve$1(this.rootPath, filePath);
		const uri = pathToFileURL(absolutePath).toString();
		const startTime = Date.now();
		try {
			const content = await this.fileSystem.readFile(absolutePath);
			const existingFile = this.fileIndex.get(uri);
			const diffResult = this.diffChecker.checkFile(content, existingFile);
			if (!diffResult.hasChanged) {
				this.emit("fileIndexed", {
					type: "fileIndexed",
					uri,
					symbolCount: existingFile.symbols.length,
					fromCache: true
				});
				return;
			}
			const contentHash = diffResult.contentHash;
			if (this.cache) {
				const cachedSymbols = await this.cache.get(absolutePath);
				if (cachedSymbols) {
					this.storeSymbols(uri, cachedSymbols, void 0, contentHash);
					this.emit("fileIndexed", {
						type: "fileIndexed",
						uri,
						symbolCount: cachedSymbols.length,
						fromCache: true
					});
					return;
				}
			}
			const rawSymbols = await this.symbolProvider.getDocumentSymbols(uri);
			if (!rawSymbols || rawSymbols.length === 0) return;
			const symbols = this.convertSymbols(rawSymbols, uri);
			const gitHashResult = await getFileGitHash(this.rootPath, absolutePath);
			const gitHash = gitHashResult.isOk() ? gitHashResult.value ?? void 0 : void 0;
			this.storeSymbols(uri, symbols, gitHash, contentHash);
			if (this.cache) await this.cache.set(absolutePath, symbols);
			this.stats.indexingTime += Date.now() - startTime;
			this.stats.lastUpdated = /* @__PURE__ */ new Date();
			this.updateStats();
			this.emit("fileIndexed", {
				type: "fileIndexed",
				uri,
				symbolCount: symbols.length,
				fromCache: false
			});
		} catch (error) {
			this.emit("indexError", {
				type: "indexError",
				uri,
				error: error instanceof Error ? error : new Error(String(error))
			});
		}
	}
	/**
	* Initialize index with configuration
	*/
	async initialize() {
		const { loadIndexConfig: loadConfig } = await import("./configLoader-DZ8oGdHO.js");
		this.config = loadConfig(this.rootPath);
		debugLogWithPrefix("SymbolIndex", "Loaded config:", this.config?.symbolFilter);
		await this.loadIndexFromCache();
	}
	/**
	* Load existing index from cache
	*/
	async loadIndexFromCache() {
		if (!this.cache) return;
		try {
			const cachedFiles = await this.cache.getAllFiles?.();
			if (!cachedFiles || cachedFiles.length === 0) {
				debugLogWithPrefix("SymbolIndex", "No cached files found");
				return;
			}
			debugLogWithPrefix("SymbolIndex", `Loading ${cachedFiles.length} files from cache`);
			for (const filePath of cachedFiles) {
				const cachedSymbols = await this.cache.get(filePath);
				if (cachedSymbols && cachedSymbols.length > 0) {
					const uri = pathToFileURL(filePath).toString();
					this.storeSymbols(uri, cachedSymbols, void 0, void 0);
				}
			}
			this.updateStats();
			debugLogWithPrefix("SymbolIndex", `Loaded ${this.stats.totalFiles} files, ${this.stats.totalSymbols} symbols from cache`);
		} catch (error) {
			debugLogWithPrefix("SymbolIndex", `Failed to load from cache: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	/**
	* Index multiple files
	*/
	async indexFiles(filePaths, concurrency = 5, options) {
		if (!this.config) await this.initialize();
		this.emit("indexingStarted", {
			type: "indexingStarted",
			fileCount: filePaths.length
		});
		const startTime = Date.now();
		const totalFiles = filePaths.length;
		let processedFiles = 0;
		let failedFiles = 0;
		for (let i = 0; i < filePaths.length; i += concurrency) {
			const chunk = filePaths.slice(i, i + concurrency);
			const promises = chunk.map(async (file) => {
				try {
					await this.indexFile(file);
					processedFiles++;
				} catch (error) {
					failedFiles++;
					debugLogWithPrefix("SymbolIndex", `Failed to index ${file}: ${error instanceof Error ? error.message : String(error)}`);
					if (!options?.skipFailures) throw error;
				}
			});
			await Promise.all(promises);
			if (options?.onProgress) options.onProgress({
				current: processedFiles,
				total: totalFiles
			});
			if (i + concurrency < filePaths.length) await new Promise((resolve$2) => setTimeout(resolve$2, 20));
		}
		const duration = Date.now() - startTime;
		const gitHashResult = await getGitHashAsync(this.rootPath);
		if (gitHashResult.isOk()) this.stats.lastGitHash = gitHashResult.value;
		debugLogWithPrefix("SymbolIndex", `Indexed ${processedFiles}/${totalFiles} files in ${duration}ms (${failedFiles} failures)`);
		this.emit("indexingCompleted", {
			type: "indexingCompleted",
			duration
		});
	}
	/**
	* Remove file from index
	*/
	removeFile(filePath) {
		const absolutePath = resolve$1(this.rootPath, filePath);
		const uri = pathToFileURL(absolutePath).toString();
		const fileSymbols = this.fileIndex.get(uri);
		if (!fileSymbols) return;
		this.removeFromIndices(fileSymbols.symbols, uri);
		this.fileIndex.delete(uri);
		this.updateStats();
		this.emit("fileRemoved", {
			type: "fileRemoved",
			uri
		});
	}
	/**
	* Query symbols
	*/
	querySymbols(query) {
		let fileUris = /* @__PURE__ */ new Set();
		if (!query.name && !query.kind && !query.file) fileUris = new Set(this.fileIndex.keys());
		if (query.name) {
			const nameUris = /* @__PURE__ */ new Set();
			for (const [symbolName, uris] of this.symbolIndex) if (symbolName.includes(query.name)) uris.forEach((uri) => nameUris.add(uri));
			if (fileUris.size === 0) fileUris = nameUris;
			else fileUris = new Set([...fileUris].filter((uri) => nameUris.has(uri)));
		}
		if (query.kind) {
			const kinds = Array.isArray(query.kind) ? query.kind : [query.kind];
			const kindUris = /* @__PURE__ */ new Set();
			for (const kind of kinds) {
				const uris = this.kindIndex.get(kind) || /* @__PURE__ */ new Set();
				uris.forEach((uri) => kindUris.add(uri));
			}
			if (fileUris.size === 0) fileUris = kindUris;
			else fileUris = new Set([...fileUris].filter((uri) => kindUris.has(uri)));
		}
		if (query.containerName) {
			const containerUris = this.containerIndex.get(query.containerName) || /* @__PURE__ */ new Set();
			if (fileUris.size === 0) fileUris = containerUris;
			else fileUris = new Set([...fileUris].filter((uri) => containerUris.has(uri)));
		}
		if (query.file) {
			const targetUri = pathToFileURL(resolve$1(this.rootPath, query.file)).toString();
			if (this.fileIndex.has(targetUri)) if (fileUris.size === 0 && !query.name && !query.kind && !query.containerName) fileUris = new Set([targetUri]);
			else if (fileUris.has(targetUri)) fileUris = new Set([targetUri]);
			else fileUris = /* @__PURE__ */ new Set();
			else for (const [uri] of this.fileIndex) if (uri.endsWith(query.file) || uri.includes(query.file)) {
				fileUris = new Set([uri]);
				break;
			}
		}
		const results = [];
		for (const uri of fileUris) {
			const fileSymbols = this.fileIndex.get(uri);
			if (!fileSymbols) continue;
			const matchingSymbols = this.filterSymbols(fileSymbols.symbols, query);
			results.push(...matchingSymbols);
		}
		return results;
	}
	/**
	* Get index statistics
	*/
	getStats() {
		return { ...this.stats };
	}
	/**
	* Clear the index
	*/
	clear() {
		this.fileIndex.clear();
		this.symbolIndex.clear();
		this.kindIndex.clear();
		this.containerIndex.clear();
		this.stats = {
			totalFiles: 0,
			totalSymbols: 0,
			indexingTime: 0,
			lastUpdated: /* @__PURE__ */ new Date()
		};
		this.emit("cleared");
	}
	/**
	* Force clear all data including cache
	*/
	async forceClear() {
		this.clear();
		if (this.cache) await this.cache.clear();
		this.stats = {
			totalFiles: 0,
			totalSymbols: 0,
			indexingTime: 0,
			lastUpdated: /* @__PURE__ */ new Date(),
			lastGitHash: void 0
		};
	}
	/**
	* Update index incrementally based on git changes
	*/
	async updateIncremental(options) {
		const batchSize = options?.batchSize || 5;
		debugLogWithPrefix("SymbolIndex", `updateIncremental started for ${this.rootPath}`);
		const currentHashResult = await getGitHashAsync(this.rootPath);
		if (currentHashResult.isErr()) {
			debugLogWithPrefix("SymbolIndex", `Git hash error: ${currentHashResult.error.message}`);
			return {
				updated: [],
				removed: [],
				errors: [currentHashResult.error.message]
			};
		}
		const currentHash = currentHashResult.value;
		debugLogWithPrefix("SymbolIndex", `Current git hash: ${currentHash}`);
		if (!currentHash) return {
			updated: [],
			removed: [],
			errors: ["Not a git repository"]
		};
		const lastHash = this.stats.lastGitHash;
		debugLogWithPrefix("SymbolIndex", `Last git hash: ${lastHash}`);
		if (!lastHash) return {
			updated: [],
			removed: [],
			errors: ["No previous git hash found"]
		};
		debugLogWithPrefix("SymbolIndex", `Getting modified files since ${lastHash}`);
		const modifiedFilesResult = await getModifiedFilesAsync(this.rootPath, lastHash);
		if (modifiedFilesResult.isErr()) {
			debugLogWithPrefix("SymbolIndex", `Error getting modified files: ${modifiedFilesResult.error.message}`);
			return {
				updated: [],
				removed: [],
				errors: [modifiedFilesResult.error.message]
			};
		}
		const modifiedFiles$1 = modifiedFilesResult.value;
		debugLogWithPrefix("SymbolIndex", `Found ${modifiedFiles$1.length} modified files`);
		debugLogWithPrefix("SymbolIndex", "Getting untracked files");
		const untrackedFilesResult = await getUntrackedFilesAsync(this.rootPath);
		if (untrackedFilesResult.isErr()) debugLogWithPrefix("SymbolIndex", `Error getting untracked files: ${untrackedFilesResult.error.message}`);
		const untrackedFiles = untrackedFilesResult.isOk() ? untrackedFilesResult.value : [];
		debugLogWithPrefix("SymbolIndex", `Found ${untrackedFiles.length} untracked files`);
		const supportedExtensions = [
			".ts",
			".tsx",
			".js",
			".jsx",
			".mjs",
			".mts"
		];
		const isSupported = (file) => {
			return supportedExtensions.some((ext) => file.endsWith(ext));
		};
		const tsModifiedFiles = modifiedFiles$1.filter(isSupported);
		const tsUntrackedFiles = untrackedFiles.filter(isSupported);
		debugLogWithPrefix("SymbolIndex", `Filtered to ${tsModifiedFiles.length} modified TS/JS files`);
		debugLogWithPrefix("SymbolIndex", `Filtered to ${tsUntrackedFiles.length} untracked TS/JS files`);
		const allFiles = [...new Set([...tsModifiedFiles, ...tsUntrackedFiles])];
		const totalFiles = allFiles.length;
		const updated = [];
		const removed = [];
		const errors = [];
		let processedCount = 0;
		for (let i = 0; i < allFiles.length; i += batchSize) {
			const batch = allFiles.slice(i, Math.min(i + batchSize, allFiles.length));
			if (options?.onProgress) options.onProgress({
				current: processedCount,
				total: totalFiles
			});
			const batchPromises = batch.map(async (file) => {
				const absolutePath = resolve$1(this.rootPath, file);
				try {
					if (await this.fileSystem.exists(absolutePath)) {
						await this.indexFile(file);
						return {
							type: "updated",
							file
						};
					} else {
						this.removeFile(file);
						return {
							type: "removed",
							file
						};
					}
				} catch (error) {
					return {
						type: "error",
						file,
						error: `${file}: ${error instanceof Error ? error.message : String(error)}`
					};
				}
			});
			const batchResults = await Promise.all(batchPromises);
			for (const result of batchResults) switch (result.type) {
				case "updated":
					updated.push(result.file);
					break;
				case "removed":
					removed.push(result.file);
					break;
				case "error":
					errors.push(result.error);
					break;
			}
			processedCount += batch.length;
			if (allFiles.length > 1e3 && i + batchSize < allFiles.length) await new Promise((resolve$2) => setTimeout(resolve$2, 10));
			if (processedCount % 500 === 0 && global.gc) global.gc();
		}
		if (options?.onProgress) options.onProgress({
			current: totalFiles,
			total: totalFiles
		});
		this.stats.lastGitHash = currentHash;
		this.stats.lastUpdated = /* @__PURE__ */ new Date();
		debugLogWithPrefix("SymbolIndex", `Incremental update completed: ${updated.length} updated, ${removed.length} removed, ${errors.length} errors`);
		return {
			updated,
			removed,
			errors
		};
	}
	/**
	* Check if a file needs re-indexing
	*/
	async needsReindex(filePath) {
		const absolutePath = resolve$1(this.rootPath, filePath);
		const uri = pathToFileURL(absolutePath).toString();
		const fileSymbols = this.fileIndex.get(uri);
		if (!fileSymbols) return true;
		const hashResult = await getFileGitHash(this.rootPath, absolutePath);
		if (hashResult.isOk() && fileSymbols.gitHash) return hashResult.value !== fileSymbols.gitHash;
		try {
			const stats = await this.fileSystem.stat(absolutePath);
			const mtime = stats.mtime.getTime();
			if (mtime > fileSymbols.lastIndexed) return true;
		} catch {
			return true;
		}
		return false;
	}
	storeSymbols(uri, symbols, gitHash, contentHash) {
		this.fileIndex.set(uri, {
			uri,
			lastModified: Date.now(),
			lastIndexed: Date.now(),
			gitHash,
			contentHash,
			symbols
		});
		this.updateIndices(symbols, uri);
	}
	updateIndices(symbols, uri) {
		const processSymbol = (symbol, containerName) => {
			if (!this.symbolIndex.has(symbol.name)) this.symbolIndex.set(symbol.name, /* @__PURE__ */ new Set());
			this.symbolIndex.get(symbol.name).add(uri);
			if (!this.kindIndex.has(symbol.kind)) this.kindIndex.set(symbol.kind, /* @__PURE__ */ new Set());
			this.kindIndex.get(symbol.kind).add(uri);
			if (containerName) {
				if (!this.containerIndex.has(containerName)) this.containerIndex.set(containerName, /* @__PURE__ */ new Set());
				this.containerIndex.get(containerName).add(uri);
			}
			if (symbol.children) for (const child of symbol.children) processSymbol(child, symbol.name);
		};
		for (const symbol of symbols) processSymbol(symbol);
	}
	removeFromIndices(symbols, uri) {
		const processSymbol = (symbol) => {
			const nameUris = this.symbolIndex.get(symbol.name);
			if (nameUris) {
				nameUris.delete(uri);
				if (nameUris.size === 0) this.symbolIndex.delete(symbol.name);
			}
			const kindUris = this.kindIndex.get(symbol.kind);
			if (kindUris) {
				kindUris.delete(uri);
				if (kindUris.size === 0) this.kindIndex.delete(symbol.kind);
			}
			if (symbol.children) for (const child of symbol.children) processSymbol(child);
		};
		for (const symbol of symbols) processSymbol(symbol);
	}
	filterSymbols(symbols, query) {
		const results = [];
		const processSymbol = (symbol, containerName) => {
			let matches = true;
			if (query.name && !symbol.name.toLowerCase().includes(query.name.toLowerCase())) matches = false;
			if (query.kind) {
				const kinds = Array.isArray(query.kind) ? query.kind : [query.kind];
				if (!kinds.includes(symbol.kind)) matches = false;
			}
			if (query.containerName && containerName !== query.containerName) matches = false;
			if (matches) results.push(symbol);
			if (query.includeChildren !== false && symbol.children) for (const child of symbol.children) processSymbol(child, symbol.name);
		};
		for (const symbol of symbols) processSymbol(symbol);
		return results;
	}
	convertSymbols(rawSymbols, uri) {
		const symbols = rawSymbols.map((symbol) => this.convertSymbol(symbol, uri));
		if (this.config?.symbolFilter) return this.filterSymbolsByConfig(symbols);
		return symbols;
	}
	filterSymbolsByConfig(symbols) {
		const filter = this.config?.symbolFilter;
		if (!filter) return symbols;
		const filtered = [];
		for (const symbol of symbols) {
			if (shouldExcludeSymbol(symbol, filter)) continue;
			let filteredSymbol = symbol;
			if (symbol.children) {
				const filteredChildren = this.filterSymbolsByConfig(symbol.children);
				if (filteredChildren.length > 0 || !filter.includeOnlyTopLevel) filteredSymbol = {
					...symbol,
					children: filteredChildren
				};
				else continue;
			}
			filtered.push(filteredSymbol);
		}
		return filtered;
	}
	convertSymbol(symbol, uri, containerName) {
		if ("selectionRange" in symbol) {
			const converted = {
				name: symbol.name,
				kind: symbol.kind,
				location: {
					uri,
					range: symbol.range
				},
				containerName,
				deprecated: symbol.deprecated,
				detail: symbol.detail,
				children: symbol.children?.map((child) => this.convertSymbol(child, uri, symbol.name))
			};
			return converted;
		}
		return {
			name: symbol.name,
			kind: symbol.kind,
			location: symbol.location,
			containerName: symbol.containerName,
			deprecated: symbol.deprecated
		};
	}
	updateStats() {
		let totalSymbols = 0;
		const countSymbols = (symbols) => {
			let count = symbols.length;
			for (const symbol of symbols) if (symbol.children) count += countSymbols(symbol.children);
			return count;
		};
		for (const fileSymbols of this.fileIndex.values()) totalSymbols += countSymbols(fileSymbols.symbols);
		this.stats.totalFiles = this.fileIndex.size;
		this.stats.totalSymbols = totalSymbols;
	}
};

//#endregion
//#region packages/code-indexer/src/engine/NodeFileSystem.ts
var NodeFileSystem = class {
	async readFile(path$3) {
		return await fs$2.readFile(path$3, "utf-8");
	}
	async writeFile(path$3, data, encoding) {
		await fs$2.writeFile(path$3, data, encoding || "utf-8");
	}
	async readdir(path$3, options) {
		if (options?.withFileTypes) return fs$2.readdir(path$3, options);
		return fs$2.readdir(path$3);
	}
	async exists(path$3) {
		return existsSync$1(path$3);
	}
	async stat(path$3) {
		return await fs$2.stat(path$3);
	}
	async lstat(path$3) {
		return await fs$2.lstat(path$3);
	}
	async mkdir(dirPath, options) {
		return await fs$2.mkdir(dirPath, options);
	}
	async rm(dirPath, options) {
		await fs$2.rm(dirPath, options);
	}
	async realpath(dirPath) {
		return await fs$2.realpath(dirPath);
	}
	async cwd() {
		return process.cwd();
	}
	async resolve(...paths) {
		return path$2.resolve(...paths);
	}
	async isDirectory(dirPath) {
		try {
			const stats = await fs$2.stat(dirPath);
			return stats.isDirectory();
		} catch {
			return false;
		}
	}
	async listDirectory(dirPath) {
		return await fs$2.readdir(dirPath);
	}
};

//#endregion
//#region packages/code-indexer/src/cache/MemoryCache.ts
var MemoryCache = class {
	cache = /* @__PURE__ */ new Map();
	async get(filePath) {
		return this.cache.get(filePath) || null;
	}
	async set(filePath, symbols) {
		this.cache.set(filePath, symbols);
	}
	async clear() {
		this.cache.clear();
	}
};

//#endregion
//#region packages/code-indexer/src/cache/SymbolCacheManager.ts
var SymbolCacheManager = class {
	db;
	insertStmt;
	selectByFileStmt;
	selectByNameStmt;
	deleteByFileStmt;
	searchStmt;
	schemaUpdated = false;
	constructor(rootPath) {
		this.rootPath = rootPath;
		const cacheDir = join(rootPath, ".lsmcp", "cache");
		const dbPath = join(cacheDir, "symbols.db");
		if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
		this.db = new DatabaseSync(dbPath);
		this.initializeDatabase();
		this.insertStmt = this.db.prepare(`
      INSERT INTO symbols (
        filePath, namePath, kind, containerName, 
        startLine, startCharacter, endLine, endCharacter, 
        lastModified, projectRoot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
		this.selectByFileStmt = this.db.prepare(`
      SELECT * FROM symbols 
      WHERE filePath = ? AND projectRoot = ?
      ORDER BY startLine, startCharacter
    `);
		this.selectByNameStmt = this.db.prepare(`
      SELECT * FROM symbols 
      WHERE namePath = ? AND projectRoot = ?
    `);
		this.deleteByFileStmt = this.db.prepare(`
      DELETE FROM symbols 
      WHERE filePath = ? AND projectRoot = ?
    `);
		this.searchStmt = this.db.prepare(`
      SELECT * FROM symbols 
      WHERE projectRoot = ? AND namePath GLOB ?
      ORDER BY filePath, startLine
    `);
	}
	initializeDatabase() {
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        updated_at INTEGER NOT NULL
      );
    `);
		const versionResult = this.db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get();
		const currentVersion = versionResult?.version || 0;
		if (currentVersion < SYMBOL_CACHE_SCHEMA_VERSION) {
			debugLogWithPrefix("SymbolCache", `Updating schema from version ${currentVersion} to ${SYMBOL_CACHE_SCHEMA_VERSION}`);
			this.schemaUpdated = true;
			if (currentVersion > 0) this.db.exec(`DROP TABLE IF EXISTS symbols;`);
			this.db.exec(`
        CREATE TABLE IF NOT EXISTS symbols (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filePath TEXT NOT NULL,
          namePath TEXT NOT NULL,
          kind INTEGER NOT NULL,
          containerName TEXT,
          startLine INTEGER NOT NULL,
          startCharacter INTEGER NOT NULL,
          endLine INTEGER NOT NULL,
          endCharacter INTEGER NOT NULL,
          lastModified INTEGER NOT NULL,
          projectRoot TEXT NOT NULL,
          UNIQUE(filePath, namePath, startLine, startCharacter, projectRoot)
        );
        
        CREATE INDEX IF NOT EXISTS idx_symbols_file 
        ON symbols(filePath, projectRoot);
        
        CREATE INDEX IF NOT EXISTS idx_symbols_name 
        ON symbols(namePath, projectRoot);
        
        CREATE INDEX IF NOT EXISTS idx_symbols_project 
        ON symbols(projectRoot);
      `);
			this.db.exec(`
        INSERT INTO schema_version (version, updated_at) 
        VALUES (${SYMBOL_CACHE_SCHEMA_VERSION}, ${Date.now()})
      `);
		} else this.db.exec(`
        CREATE TABLE IF NOT EXISTS symbols (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filePath TEXT NOT NULL,
          namePath TEXT NOT NULL,
          kind INTEGER NOT NULL,
          containerName TEXT,
          startLine INTEGER NOT NULL,
          startCharacter INTEGER NOT NULL,
          endLine INTEGER NOT NULL,
          endCharacter INTEGER NOT NULL,
          lastModified INTEGER NOT NULL,
          projectRoot TEXT NOT NULL,
          UNIQUE(filePath, namePath, startLine, startCharacter, projectRoot)
        );
        
        CREATE INDEX IF NOT EXISTS idx_symbols_file 
        ON symbols(filePath, projectRoot);
        
        CREATE INDEX IF NOT EXISTS idx_symbols_name 
        ON symbols(namePath, projectRoot);
        
        CREATE INDEX IF NOT EXISTS idx_symbols_project 
        ON symbols(projectRoot);
      `);
	}
	cacheSymbols(filePath, symbols, lastModified) {
		this.db.exec("BEGIN TRANSACTION");
		try {
			this.deleteByFileStmt.run(filePath, this.rootPath);
			const stack = symbols.map((s) => ({
				symbol: s,
				path: s.name
			}));
			while (stack.length > 0) {
				const item = stack.pop();
				const { symbol, path: path$3 } = item;
				const { start, end } = symbol.location.range;
				this.insertStmt.run(filePath, path$3, symbol.kind, symbol.containerName || null, start.line, start.character, end.line, end.character, lastModified, this.rootPath);
				if (symbol.children) for (const child of symbol.children) stack.push({
					symbol: child,
					path: `${path$3}/${child.name}`
				});
			}
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}
	getSymbolsByFile(filePath) {
		const rows = this.selectByFileStmt.all(filePath, this.rootPath);
		return rows;
	}
	getSymbolsByName(namePath) {
		const rows = this.selectByNameStmt.all(namePath, this.rootPath);
		return rows;
	}
	searchSymbols(pattern) {
		const globPattern = pattern.replace(/\*/g, "*").replace(/\?/g, "?");
		const rows = this.searchStmt.all(this.rootPath, globPattern);
		return rows;
	}
	invalidateFile(filePath) {
		this.deleteByFileStmt.run(filePath, this.rootPath);
	}
	clearCache() {
		this.db.exec("DELETE FROM symbols WHERE projectRoot = ?");
		this.db.prepare("DELETE FROM symbols WHERE projectRoot = ?").run(this.rootPath);
	}
	getStats() {
		const symbolCount = this.db.prepare("SELECT COUNT(*) as count FROM symbols WHERE projectRoot = ?").get(this.rootPath);
		const fileCount = this.db.prepare("SELECT COUNT(DISTINCT filePath) as count FROM symbols WHERE projectRoot = ?").get(this.rootPath);
		return {
			totalSymbols: symbolCount.count,
			totalFiles: fileCount.count
		};
	}
	getAllFiles() {
		const rows = this.db.prepare("SELECT DISTINCT filePath FROM symbols WHERE projectRoot = ?").all(this.rootPath);
		return rows.map((row) => row.filePath);
	}
	close() {
		this.db.close();
	}
	wasSchemaUpdated() {
		return this.schemaUpdated;
	}
	getSchemaVersion() {
		return SYMBOL_CACHE_SCHEMA_VERSION;
	}
};

//#endregion
//#region packages/code-indexer/src/cache/SQLiteCache.ts
var SQLiteCache = class {
	manager;
	needsReindexing;
	constructor(rootPath) {
		this.rootPath = rootPath;
		this.manager = new SymbolCacheManager(rootPath);
		this.needsReindexing = this.manager.wasSchemaUpdated();
		if (this.needsReindexing) debugLogWithPrefix("SQLiteCache", `Schema updated to version ${this.manager.getSchemaVersion()}, full reindexing required`);
	}
	async get(filePath) {
		if (this.needsReindexing) return null;
		try {
			const relativePath = relative(this.rootPath, filePath);
			const stats = statSync(filePath);
			const cachedSymbols = this.manager.getSymbolsByFile(relativePath);
			if (cachedSymbols.length === 0) return null;
			const cacheTime = cachedSymbols[0].lastModified;
			if (stats.mtimeMs > cacheTime) {
				this.manager.invalidateFile(relativePath);
				return null;
			}
			return this.convertCachedToIndexedSymbols(cachedSymbols, filePath);
		} catch {
			return null;
		}
	}
	async set(filePath, symbols) {
		const relativePath = relative(this.rootPath, filePath);
		const stats = statSync(filePath);
		const lastModified = stats.mtimeMs;
		const symbolEntries = this.convertIndexedToSymbolEntries(symbols);
		await this.manager.cacheSymbols(relativePath, symbolEntries, lastModified);
	}
	async clear() {
		this.manager.clearCache();
	}
	convertIndexedToSymbolEntries(symbols) {
		return symbols.map((symbol) => ({
			name: symbol.name,
			kind: symbol.kind,
			location: symbol.location,
			containerName: symbol.containerName,
			deprecated: symbol.deprecated,
			detail: symbol.detail,
			children: symbol.children ? this.convertIndexedToSymbolEntries(symbol.children) : void 0
		}));
	}
	convertCachedToIndexedSymbols(cachedSymbols, absolutePath) {
		const uri = pathToFileURL(absolutePath).toString();
		const symbolMap = /* @__PURE__ */ new Map();
		const rootSymbols = [];
		for (const cached of cachedSymbols) {
			const symbol = {
				name: cached.namePath.split("/").pop() || cached.namePath,
				kind: cached.kind,
				location: {
					uri,
					range: {
						start: {
							line: cached.startLine,
							character: cached.startCharacter
						},
						end: {
							line: cached.endLine,
							character: cached.endCharacter
						}
					}
				},
				containerName: cached.containerName
			};
			symbolMap.set(cached.namePath, symbol);
		}
		for (const cached of cachedSymbols) {
			const symbol = symbolMap.get(cached.namePath);
			if (cached.containerName) {
				const parentPath = cached.namePath.substring(0, cached.namePath.lastIndexOf("/"));
				const parent = symbolMap.get(parentPath);
				if (parent) {
					if (!parent.children) parent.children = [];
					parent.children.push(symbol);
				} else rootSymbols.push(symbol);
			} else rootSymbols.push(symbol);
		}
		return rootSymbols;
	}
	/**
	* Get cache statistics
	*/
	getStats() {
		return this.manager.getStats();
	}
	/**
	* Close the database connection
	*/
	close() {
		this.manager.close();
	}
	/**
	* Check if full reindexing is required due to schema update
	*/
	requiresReindexing() {
		return this.needsReindexing;
	}
	/**
	* Mark reindexing as completed
	*/
	markReindexingComplete() {
		this.needsReindexing = false;
	}
	/**
	* Get all cached file paths
	*/
	async getAllFiles() {
		try {
			const relativeFiles = this.manager.getAllFiles();
			const absoluteFiles = relativeFiles.map((relativePath) => {
				if (relativePath.startsWith("/")) return relativePath;
				return join$1(this.rootPath, relativePath);
			});
			return absoluteFiles;
		} catch (error) {
			debugLogWithPrefix("SQLiteCache", `Failed to get all files: ${error instanceof Error ? error.message : String(error)}`);
			return [];
		}
	}
	/**
	* Get cached file info with last modified time
	*/
	async getFileInfo(filePath) {
		try {
			const relativePath = relative(this.rootPath, filePath);
			const cachedSymbols = this.manager.getSymbolsByFile(relativePath);
			if (cachedSymbols.length === 0) return null;
			return { lastModified: cachedSymbols[0].lastModified };
		} catch {
			return null;
		}
	}
};

//#endregion
//#region packages/code-indexer/src/mcp/IndexerAdapter.ts
const indexInstances = /* @__PURE__ */ new Map();
/**
* Get or create a symbol index for a root path
*/
function getOrCreateIndex(rootPath, context) {
	let index = indexInstances.get(rootPath);
	if (index) return index;
	let fileSystem;
	if (context && typeof context === "object") if ("fs" in context && context.fs) fileSystem = context.fs;
	else if ("fileSystem" in context && context.fileSystem) fileSystem = context.fileSystem;
	else fileSystem = new NodeFileSystem();
	else fileSystem = new NodeFileSystem();
	if (typeof fileSystem.readFile !== "function") {
		debugLogWithPrefix("IndexerAdapter", "Warning: fileSystem.readFile is not a function. Using NodeFileSystem.");
		fileSystem = new NodeFileSystem();
	}
	const cache = process.env.VITEST === "true" || process.env.VITEST ? new MemoryCache() : new SQLiteCache(rootPath);
	const hasSymbolProvider = !!(context && typeof context === "object" && "symbolProvider" in context && context.symbolProvider);
	let symbolProvider;
	if (hasSymbolProvider) symbolProvider = context.symbolProvider;
	else {
		let lspClient = void 0;
		if (context && typeof context === "object" && "lspClient" in context) lspClient = context.lspClient;
		else if (context) lspClient = context;
		if (!lspClient) {
			errorLog(`[IndexerAdapter] No LSP client or symbolProvider available for ${rootPath}. Provide via { lspClient } or { symbolProvider }.`);
			return null;
		}
		const fileContentProvider = async (uri) => {
			const path$3 = fileURLToPath(uri);
			return await readFile(path$3, "utf-8");
		};
		const languageId = context?.languageId || context?.presetId;
		symbolProvider = createLSPSymbolProvider(lspClient, fileContentProvider, languageId);
	}
	index = new SymbolIndex(rootPath, symbolProvider, fileSystem, cache);
	indexInstances.set(rootPath, index);
	return index;
}
/**
* Index files using the new implementation
*/
async function indexFiles(rootPath, filePaths, options) {
	const index = getOrCreateIndex(rootPath, options?.context);
	if (!index) return {
		success: false,
		totalFiles: 0,
		totalSymbols: 0,
		duration: 0,
		errors: [{
			file: "",
			error: "LSP client not initialized"
		}]
	};
	const startTime = Date.now();
	const errors = [];
	const errorHandler = (event) => {
		if (event.type === "indexError") {
			const path$3 = fileURLToPath(event.uri);
			errors.push({
				file: path$3,
				error: event.error.message
			});
		}
	};
	index.on("indexError", errorHandler);
	try {
		await index.indexFiles(filePaths, options?.concurrency);
		const stats = index.getStats();
		return {
			success: true,
			totalFiles: stats.totalFiles,
			totalSymbols: stats.totalSymbols,
			duration: Date.now() - startTime,
			errors
		};
	} finally {
		index.off("indexError", errorHandler);
	}
}
/**
* Query symbols using the new implementation
*/
function querySymbols(rootPath, query) {
	const index = indexInstances.get(rootPath);
	if (!index) return [];
	return index.querySymbols(query);
}
/**
* Get index statistics
*/
function getIndexStats(rootPath) {
	const index = indexInstances.get(rootPath);
	if (!index) return {
		totalFiles: 0,
		totalSymbols: 0,
		indexingTime: 0,
		lastUpdated: /* @__PURE__ */ new Date()
	};
	return index.getStats();
}
/**
* Update index incrementally
*/
async function updateIndexIncremental(rootPath, context) {
	const index = getOrCreateIndex(rootPath, context);
	if (!index) return {
		success: false,
		updated: [],
		removed: [],
		errors: [],
		message: "Failed to create index"
	};
	try {
		const result = await index.updateIncremental();
		return {
			success: true,
			...result
		};
	} catch (error) {
		return {
			success: false,
			updated: [],
			removed: [],
			errors: [error instanceof Error ? error.message : String(error)]
		};
	}
}

//#endregion
//#region packages/code-indexer/src/engine/adapterDefaults.ts
registerBuiltinAdapters(globalPresetRegistry);
/**
* Get default patterns for an adapter
*/
function getAdapterDefaultPattern(adapterId) {
	const preset = globalPresetRegistry.get(adapterId);
	if (!preset || !preset.files) return "";
	return preset.files.join(",");
}

//#endregion
//#region packages/code-indexer/src/utils/autoIndex.ts
const modifiedFiles = /* @__PURE__ */ new Set();
let updateTimer = null;
/**
* Mark a file as modified and schedule an index update
*/
function markFileModified(rootPath, filePath) {
	const relativePath = relative(rootPath, filePath);
	modifiedFiles.add(relativePath);
	if (updateTimer) clearTimeout(updateTimer);
	updateTimer = setTimeout(() => {
		performAutoIndex(rootPath);
	}, 500);
}
/**
* Perform automatic incremental index update
*/
async function performAutoIndex(rootPath) {
	if (modifiedFiles.size === 0) return;
	try {
		modifiedFiles.clear();
		const result = await updateIndexIncremental(rootPath);
		if (!result.success) errorLog("Auto-index failed:", result.errors);
	} catch (error) {
		errorLog("Auto-index error:", error);
	}
}

//#endregion
//#region packages/code-indexer/src/providers/externalLibraryProvider.ts
/**
* Get TypeScript declaration files from node_modules
*/
async function getNodeModulesDeclarations(rootPath, config) {
	const nodeModulesPath = join$1(rootPath, "node_modules");
	if (!existsSync$1(nodeModulesPath)) return [];
	const defaultPatterns = ["node_modules/**/*.d.ts", "node_modules/@types/**/*.d.ts"];
	const patterns = config?.includePatterns || defaultPatterns;
	const excludePatterns = config?.excludePatterns || [
		"**/node_modules/**/node_modules/**",
		"**/test/**",
		"**/tests/**",
		"**/*.test.d.ts",
		"**/*.spec.d.ts"
	];
	const allFiles = [];
	const maxFiles = config?.maxFiles || 5e3;
	for (const pattern of patterns) {
		const files = await glob(pattern, {
			cwd: rootPath,
			absolute: true,
			ignore: excludePatterns,
			nodir: true,
			follow: false
		});
		allFiles.push(...files);
		if (allFiles.length > maxFiles) {
			console.warn(`Reached maximum file limit (${maxFiles}), stopping scan`);
			return allFiles.slice(0, maxFiles);
		}
	}
	return allFiles;
}
/**
* Parse package.json to extract library info
*/
async function getLibraryInfo(packagePath) {
	const packageJsonPath = join$1(packagePath, "package.json");
	if (!existsSync$1(packageJsonPath)) return null;
	try {
		const content = await readFile(packageJsonPath, "utf-8");
		const packageJson = JSON.parse(content);
		return {
			name: packageJson.name || relative("node_modules", packagePath),
			version: packageJson.version,
			mainTypings: packageJson.types || packageJson.typings,
			typingsFiles: []
		};
	} catch (error) {
		errorLog(`Failed to parse package.json at ${packageJsonPath}:`, error);
		return null;
	}
}
/**
* Group declaration files by their library
*/
async function groupFilesByLibrary(files, rootPath) {
	const libraries = /* @__PURE__ */ new Map();
	const nodeModulesPath = join$1(rootPath, "node_modules");
	for (const file of files) {
		const relativePath = relative(nodeModulesPath, file);
		const parts = relativePath.split(/[\/\\]/);
		let libraryName;
		let libraryPath;
		if (parts[0] === "@types") {
			libraryName = parts.slice(0, 2).join("/");
			libraryPath = join$1(nodeModulesPath, libraryName);
		} else if (parts[0].startsWith("@")) {
			libraryName = parts.slice(0, 2).join("/");
			libraryPath = join$1(nodeModulesPath, libraryName);
		} else {
			libraryName = parts[0];
			libraryPath = join$1(nodeModulesPath, libraryName);
		}
		if (!libraries.has(libraryName)) {
			const info = await getLibraryInfo(libraryPath);
			if (info) libraries.set(libraryName, info);
			else libraries.set(libraryName, {
				name: libraryName,
				typingsFiles: []
			});
		}
		const library = libraries.get(libraryName);
		library.typingsFiles.push(file);
	}
	return libraries;
}
/**
* Convert DocumentSymbol to SymbolEntry recursively
*/
function documentSymbolToEntry(symbol, fileUri, containerName) {
	const entry = {
		name: symbol.name,
		kind: symbol.kind,
		location: {
			uri: fileUri,
			range: symbol.range
		},
		containerName,
		deprecated: symbol.deprecated,
		detail: symbol.detail
	};
	if (symbol.children && symbol.children.length > 0) entry.children = symbol.children.map((child) => documentSymbolToEntry(child, fileUri, symbol.name));
	return entry;
}
/**
* Index symbols from a declaration file using LSP
*/
async function indexDeclarationFile(filePath, client) {
	try {
		const content = await readFile(filePath, "utf-8");
		const fileUri = pathToFileURL(filePath).toString();
		const symbols = await withTemporaryDocument(client, fileUri, content, async () => {
			return await client.getDocumentSymbols(fileUri);
		});
		if (!symbols || !Array.isArray(symbols)) return null;
		const entries = symbols.map((symbol) => documentSymbolToEntry(symbol, fileUri));
		const stats = await stat(filePath);
		return {
			uri: fileUri,
			lastModified: stats.mtimeMs,
			symbols: entries
		};
	} catch (error) {
		errorLog(`Failed to index ${filePath}:`, error);
		return null;
	}
}
/**
* Index external libraries from node_modules
*/
async function indexExternalLibraries(rootPath, client, config) {
	const startTime = Date.now();
	console.log("Scanning for TypeScript declaration files in node_modules...");
	const declarationFiles = await getNodeModulesDeclarations(rootPath, config);
	console.log(`Found ${declarationFiles.length} declaration files`);
	console.log("Grouping files by library...");
	const libraries = await groupFilesByLibrary(declarationFiles, rootPath);
	console.log(`Found ${libraries.size} libraries with TypeScript declarations`);
	const files = [];
	let totalSymbols = 0;
	let processedFiles = 0;
	for (const [libraryName, libraryInfo] of libraries) {
		console.log(`Indexing ${libraryName} (${libraryInfo.typingsFiles.length} files)...`);
		for (const filePath of libraryInfo.typingsFiles) {
			const fileSymbols = await indexDeclarationFile(filePath, client);
			if (fileSymbols) {
				files.push(fileSymbols);
				totalSymbols += fileSymbols.symbols.length;
				processedFiles++;
				if (processedFiles % 100 === 0) console.log(`Progress: ${processedFiles}/${declarationFiles.length} files indexed`);
			}
		}
	}
	const indexingTime = Date.now() - startTime;
	console.log(`Indexing complete: ${totalSymbols} symbols from ${files.length} files in ${indexingTime}ms`);
	return {
		libraries,
		files,
		totalSymbols,
		indexingTime
	};
}
/**
* Get available TypeScript dependencies from package.json
*/
async function getAvailableTypescriptDependencies(rootPath) {
	const packageJsonPath = join$1(rootPath, "package.json");
	if (!existsSync$1(packageJsonPath)) return [];
	try {
		const content = await readFile(packageJsonPath, "utf-8");
		const packageJson = JSON.parse(content);
		const dependencies = [];
		const depFields = [
			"dependencies",
			"devDependencies",
			"peerDependencies",
			"optionalDependencies"
		];
		for (const field of depFields) if (packageJson[field]) dependencies.push(...Object.keys(packageJson[field]));
		const existingDeps = [];
		for (const dep of dependencies) {
			const depPath = join$1(rootPath, "node_modules", dep);
			if (existsSync$1(depPath)) {
				const patterns = [join$1(depPath, "**/*.d.ts"), join$1(rootPath, "node_modules", "@types", dep, "**/*.d.ts")];
				for (const pattern of patterns) {
					const files = await glob(pattern, { nodir: true });
					if (files.length > 0) {
						existingDeps.push(dep);
						break;
					}
				}
			}
		}
		return existingDeps;
	} catch (error) {
		errorLog(`Failed to read package.json:`, error);
		return [];
	}
}

//#endregion
//#region packages/code-indexer/src/symbolIndex.ts
/**
* Create a new symbol index state
*/
function createSymbolIndexState(rootPath) {
	return {
		fileIndex: /* @__PURE__ */ new Map(),
		symbolIndex: /* @__PURE__ */ new Map(),
		kindIndex: /* @__PURE__ */ new Map(),
		containerIndex: /* @__PURE__ */ new Map(),
		fileWatchers: /* @__PURE__ */ new Map(),
		indexingQueue: /* @__PURE__ */ new Set(),
		isIndexing: false,
		rootPath: resolve$1(rootPath),
		client: null,
		stats: {
			totalFiles: 0,
			totalSymbols: 0,
			indexingTime: 0,
			lastUpdated: /* @__PURE__ */ new Date()
		},
		eventEmitter: new EventEmitter()
	};
}
/**
* Add a symbol to the indices (exported for testing)
*/
function addSymbolToIndices(state, symbol, fileUri) {
	if (!state.symbolIndex.has(symbol.name)) state.symbolIndex.set(symbol.name, []);
	state.symbolIndex.get(symbol.name).push(symbol);
	if (!state.kindIndex.has(symbol.kind)) state.kindIndex.set(symbol.kind, []);
	state.kindIndex.get(symbol.kind).push(symbol);
	if (symbol.containerName) {
		if (!state.containerIndex.has(symbol.containerName)) state.containerIndex.set(symbol.containerName, []);
		state.containerIndex.get(symbol.containerName).push(symbol);
	}
	if (symbol.children) for (const child of symbol.children) addSymbolToIndices(state, child, fileUri);
}
/**
* Update statistics
*/
function updateStats(state) {
	let totalSymbols = 0;
	for (const fileSymbols of state.fileIndex.values()) {
		const countSymbols = (symbols) => {
			let count = symbols.length;
			for (const symbol of symbols) if (symbol.children) count += countSymbols(symbol.children);
			return count;
		};
		totalSymbols += countSymbols(fileSymbols.symbols);
	}
	state.stats.totalFiles = state.fileIndex.size;
	state.stats.totalSymbols = totalSymbols;
}
/**
* Global symbol index instance
*/
let globalIndexState = null;
/**
* Get or create the global symbol index
*/
function getSymbolIndex(rootPath) {
	if (!globalIndexState && rootPath) globalIndexState = createSymbolIndexState(rootPath);
	if (!globalIndexState) throw new Error("Symbol index not initialized. Please provide a root path.");
	return globalIndexState;
}
/**
* Index external libraries (node_modules)
*/
async function indexExternalLibrariesForState(state, config) {
	if (!state.client) throw new Error("LSP client not initialized");
	console.log("Starting external library indexing...");
	const result = await indexExternalLibraries(state.rootPath, state.client, config);
	state.externalLibraries = result;
	for (const fileSymbols of result.files) {
		const libraryName = extractLibraryName(fileSymbols.uri);
		const externalSymbols = markSymbolsAsExternal(fileSymbols.symbols, libraryName);
		const modifiedFileSymbols = {
			...fileSymbols,
			symbols: externalSymbols
		};
		state.fileIndex.set(fileSymbols.uri, modifiedFileSymbols);
		for (const symbol of externalSymbols) addSymbolToIndices(state, symbol, fileSymbols.uri);
	}
	updateStats(state);
	state.eventEmitter.emit("externalLibrariesIndexed", result);
	return result;
}
/**
* Extract library name from file URI
*/
function extractLibraryName(uri) {
	const match = uri.match(/node_modules[\/\\](@[^\/\\]+[\/\\][^\/\\]+|[^\/\\]+)/);
	if (match) return match[1].replace(/\\/g, "/");
	return "unknown";
}
/**
* Mark symbols as external recursively
*/
function markSymbolsAsExternal(symbols, libraryName) {
	return symbols.map((symbol) => ({
		...symbol,
		isExternal: true,
		sourceLibrary: libraryName,
		children: symbol.children ? markSymbolsAsExternal(symbol.children, libraryName) : void 0
	}));
}
/**
* Get available TypeScript dependencies
*/
async function getTypescriptDependencies(state) {
	return await getAvailableTypescriptDependencies(state.rootPath);
}
/**
* Query external library symbols
*/
function queryExternalLibrarySymbols(state, libraryName) {
	if (!state.externalLibraries) return [];
	const results = [];
	for (const fileSymbols of state.externalLibraries.files) {
		if (libraryName) {
			const isTargetLibrary = fileSymbols.uri.includes(`node_modules/${libraryName}/`) || fileSymbols.uri.includes(`node_modules/@types/${libraryName}/`);
			if (!isTargetLibrary) continue;
		}
		results.push(...fileSymbols.symbols);
	}
	return results;
}

//#endregion
//#region packages/code-indexer/src/providers/symbolResolver.ts
/**
* Parse import statements from TypeScript source code
*/
function parseImports(sourceCode) {
	const imports = [];
	const namedImportRegex = /import\s+(type\s+)?{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g;
	let match;
	while ((match = namedImportRegex.exec(sourceCode)) !== null) {
		const isTypeOnly = !!match[1];
		const specifiersStr = match[2];
		const source = match[3];
		const specifiers = parseSpecifiers(specifiersStr);
		imports.push({
			source,
			specifiers,
			isTypeOnly
		});
	}
	const namespaceImportRegex = /import\s+(type\s+)?\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
	sourceCode.replace(namespaceImportRegex, (fullMatch, typeKeyword, name, source) => {
		imports.push({
			source,
			specifiers: [{
				imported: "*",
				local: name,
				isNamespace: true
			}],
			isTypeOnly: !!typeKeyword
		});
		return fullMatch;
	});
	const defaultImportRegex = /import\s+(type\s+)?(\w+)\s+from\s+['"]([^'"]+)['"]/g;
	sourceCode.replace(defaultImportRegex, (fullMatch, typeKeyword, name, source) => {
		if (fullMatch.includes(",")) return fullMatch;
		imports.push({
			source,
			specifiers: [{
				imported: "default",
				local: name,
				isDefault: true
			}],
			isTypeOnly: !!typeKeyword
		});
		return fullMatch;
	});
	const combinedImportRegex = /import\s+(type\s+)?(\w+)\s*,\s*{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g;
	sourceCode.replace(combinedImportRegex, (fullMatch, typeKeyword, defaultName, namedSpecifiers, source) => {
		const specifiers = [{
			imported: "default",
			local: defaultName,
			isDefault: true
		}, ...parseSpecifiers(namedSpecifiers)];
		imports.push({
			source,
			specifiers,
			isTypeOnly: !!typeKeyword
		});
		return fullMatch;
	});
	return imports;
}
/**
* Parse import specifiers from a string like "ok, Ok as OkType, Err"
*/
function parseSpecifiers(specifiersStr) {
	const specifiers = [];
	const parts = specifiersStr.split(",");
	for (const part of parts) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const asMatch = trimmed.match(/^(\w+)\s+as\s+(\w+)$/);
		if (asMatch) specifiers.push({
			imported: asMatch[1],
			local: asMatch[2]
		});
		else {
			const name = trimmed.match(/^(\w+)$/)?.[1];
			if (name) specifiers.push({
				imported: name,
				local: name
			});
		}
	}
	return specifiers;
}
/**
* Resolve module path from import source
*/
function resolveModulePath(importSource, fromFile, projectRoot) {
	if (importSource.startsWith(".")) {
		const fromDir = dirname(fromFile);
		const resolved = resolve$1(fromDir, importSource);
		const extensions = [
			".ts",
			".tsx",
			".d.ts",
			".js",
			".jsx",
			".mjs"
		];
		for (const ext of extensions) {
			const withExt = resolved + ext;
			if (existsSync$1(withExt)) return withExt;
		}
		for (const indexName of ["index", "main"]) for (const ext of extensions) {
			const indexPath = join$1(resolved, `${indexName}${ext}`);
			if (existsSync$1(indexPath)) return indexPath;
		}
		return null;
	}
	const nodeModulesPath = join$1(projectRoot, "node_modules", importSource);
	const packageJsonPath = join$1(nodeModulesPath, "package.json");
	if (existsSync$1(packageJsonPath)) try {
		const packageJson = JSON.parse(__require("fs").readFileSync(packageJsonPath, "utf-8"));
		const typesEntry = packageJson.types || packageJson.typings;
		if (typesEntry) {
			const typesPath = join$1(nodeModulesPath, typesEntry);
			if (existsSync$1(typesPath)) return typesPath;
		}
		const mainEntry = packageJson.main || "index.js";
		const mainPath = join$1(nodeModulesPath, mainEntry);
		const dtsPath = mainPath.replace(/\.(js|mjs|cjs)$/, ".d.ts");
		if (existsSync$1(dtsPath)) return dtsPath;
	} catch (error) {
		errorLog(`Failed to parse package.json for ${importSource}:`, error);
	}
	const typesPackagePath = join$1(projectRoot, "node_modules", "@types", importSource);
	const typesIndexPath = join$1(typesPackagePath, "index.d.ts");
	if (existsSync$1(typesIndexPath)) return typesIndexPath;
	return null;
}
/**
* Get all available symbols from external libraries for a file
*/
async function getAvailableExternalSymbols(filePath, projectRoot) {
	const availableSymbols = /* @__PURE__ */ new Map();
	try {
		const sourceCode = await readFile(filePath, "utf-8");
		const imports = parseImports(sourceCode);
		for (const importInfo of imports) {
			const modulePath = resolveModulePath(importInfo.source, filePath, projectRoot);
			if (modulePath) for (const specifier of importInfo.specifiers) availableSymbols.set(specifier.local, {
				symbol: {
					name: specifier.imported,
					kind: 13,
					location: {
						uri: pathToFileURL(modulePath).toString(),
						range: {
							start: {
								line: 0,
								character: 0
							},
							end: {
								line: 0,
								character: 0
							}
						}
					}
				},
				sourceModule: importInfo.source,
				resolvedPath: modulePath
			});
		}
		return availableSymbols;
	} catch (error) {
		errorLog(`Failed to get available external symbols from ${filePath}:`, error);
		return availableSymbols;
	}
}

//#endregion
//#region src/constants/diagnostics.ts
const DIAGNOSTICS_BATCH_SIZE = 10;

//#endregion
//#region src/tools/lsp/allDiagnostics.ts
const schema$1 = z.object({
	root: z.string().describe("Root directory for the project"),
	pattern: z.string().describe("Glob pattern for files to include (e.g., '**/*.ts' for TypeScript, '**/*.fs' for F#, '**/*.py' for Python)"),
	exclude: z.string().optional().describe("Glob pattern for files to exclude (e.g., 'node_modules/**')"),
	severityFilter: z.enum([
		"error",
		"warning",
		"all"
	]).optional().default("all").describe("Filter diagnostics by severity"),
	useGitignore: z.boolean().optional().default(true).describe("Whether to respect .gitignore files (default: true)")
});
const SEVERITY_MAP = {
	1: "error",
	2: "warning",
	3: "information",
	4: "hint"
};
/**
* Get all project files using gitaware-glob
* This automatically respects .gitignore
*/
async function getProjectFiles(root, pattern, exclude, useGitignore = true) {
	debug(`[lspGetAllDiagnostics] getProjectFiles called with root=${root}, pattern=${pattern}, exclude=${exclude}, useGitignore=${useGitignore}`);
	try {
		let files;
		if (useGitignore) {
			const filesGen = await glob$1(pattern, { cwd: root });
			files = [];
			for await (const file of filesGen) files.push(file);
		} else files = await glob(pattern, {
			cwd: root,
			nodir: true,
			ignore: ["**/node_modules/**", "**/.git/**"]
		});
		debug(`[lspGetAllDiagnostics] Found ${files.length} files from glob`);
		let filteredFiles = files;
		if (exclude) filteredFiles = filteredFiles.filter((f) => !minimatch(f, exclude));
		filteredFiles = filteredFiles.filter((f) => !f.includes("/obj/") && !f.includes("/bin/"));
		debug(`[lspGetAllDiagnostics] Total files to check: ${filteredFiles.length}`);
		if (filteredFiles.length > 0) debug(`[lspGetAllDiagnostics] File extensions found: ${[...new Set(filteredFiles.map((f) => {
			const ext = f.lastIndexOf(".");
			return ext > 0 ? f.substring(ext) : "no-ext";
		}))].join(", ")}`);
		return filteredFiles;
	} catch (error) {
		debug("Failed to use glob:", error);
		throw new Error(`Failed to list project files: ${error instanceof Error ? error.message : String(error)}`);
	}
}
/**
* Gets diagnostics for all files in the project
*/
async function getAllDiagnostics(request, client) {
	if (!client) throw new Error("LSP client not initialized");
	let files;
	try {
		files = await getProjectFiles(request.root, request.pattern, request.exclude, request.useGitignore ?? true);
		debug(`[lspGetAllDiagnostics] getProjectFiles returned ${files.length} files`);
	} catch (error) {
		debug(`[lspGetAllDiagnostics] Error in getProjectFiles:`, error);
		throw error;
	}
	debug(`[lspGetAllDiagnostics] Found ${files.length} files to check`);
	const fileDiagnostics = [];
	let totalErrors = 0;
	let totalWarnings = 0;
	for (let i = 0; i < files.length; i += DIAGNOSTICS_BATCH_SIZE) {
		const batch = files.slice(i, i + DIAGNOSTICS_BATCH_SIZE);
		await Promise.all(batch.map(async (filePath) => {
			try {
				const absolutePath = join$1(request.root, filePath);
				const fileUri = pathToFileURL(absolutePath).toString();
				let fileContent;
				try {
					fileContent = await readFile(absolutePath, "utf-8");
				} catch (readError) {
					debug(`[lspGetAllDiagnostics] Failed to read file ${filePath}:`, readError);
					return;
				}
				client.openDocument(fileUri, fileContent);
				await new Promise((resolve$2) => setTimeout(resolve$2, 50));
				let diagnostics;
				if (client.pullDiagnostics) try {
					diagnostics = await client.pullDiagnostics(fileUri);
				} catch {
					diagnostics = client.getDiagnostics(fileUri);
				}
				else diagnostics = client.getDiagnostics(fileUri);
				if (diagnostics && diagnostics.length > 0) {
					const mappedDiagnostics = diagnostics.filter((d) => d && d.range).map((d) => ({
						severity: SEVERITY_MAP[d.severity || 2] || "warning",
						line: d.range.start.line + 1,
						column: d.range.start.character + 1,
						endLine: d.range.end.line + 1,
						endColumn: d.range.end.character + 1,
						message: d.message,
						source: d.source,
						code: d.code
					})).filter((d) => {
						if (request.severityFilter === "error" && d.severity !== "error") return false;
						if (request.severityFilter === "warning" && d.severity !== "warning") return false;
						return true;
					});
					if (mappedDiagnostics.length > 0) {
						mappedDiagnostics.forEach((d) => {
							if (d.severity === "error") totalErrors++;
							else if (d.severity === "warning") totalWarnings++;
						});
						fileDiagnostics.push({
							filePath,
							diagnostics: mappedDiagnostics
						});
					}
				}
				client.closeDocument(fileUri);
			} catch (error) {
				debug(`[lspGetAllDiagnostics] Error processing file ${filePath}:`, error);
			}
		}));
		if (i + DIAGNOSTICS_BATCH_SIZE < files.length) await new Promise((resolve$2) => setTimeout(resolve$2, 50));
	}
	fileDiagnostics.sort((a, b) => a.filePath.localeCompare(b.filePath));
	return {
		message: `Found ${totalErrors} error${totalErrors !== 1 ? "s" : ""} and ${totalWarnings} warning${totalWarnings !== 1 ? "s" : ""} in ${fileDiagnostics.length} file${fileDiagnostics.length !== 1 ? "s" : ""}`,
		totalErrors,
		totalWarnings,
		files: fileDiagnostics
	};
}

//#endregion
//#region src/tools/highlevel/getDiagnostics.ts
/**
* Internal function to get diagnostics - not exposed as MCP tool
* Used by project overview and other internal tools
*/
async function getProjectDiagnostics(args, client, context) {
	const rootPath = args.root || process.cwd();
	const severityFilter = args.severityFilter || "all";
	const pattern = args.pattern || determineDefaultPattern(context) || "**/*.{ts,tsx,js,jsx}";
	try {
		const result = await getAllDiagnostics({
			root: rootPath,
			pattern,
			severityFilter,
			useGitignore: true
		}, client);
		return {
			errorCount: result.totalErrors || 0,
			warningCount: result.totalWarnings || 0,
			details: result.message
		};
	} catch (error) {
		return {
			errorCount: 0,
			warningCount: 0,
			details: `Failed to get diagnostics: ${error instanceof Error ? error.message : String(error)}`
		};
	}
}
/**
* Determine default pattern based on context
*/
function determineDefaultPattern(context) {
	if (context?.config?.files && Array.isArray(context.config.files)) return context.config.files.join(",");
	if (context?.config?.preset) {
		const presetPatterns = {
			typescript: "**/*.{ts,tsx}",
			tsgo: "**/*.{ts,tsx}",
			javascript: "**/*.{js,jsx}",
			python: "**/*.py",
			pyright: "**/*.py",
			rust: "**/*.rs",
			go: "**/*.go"
		};
		const preset = context.config.preset;
		return presetPatterns[preset.toLowerCase()] || null;
	}
	return null;
}

//#endregion
//#region src/tools/highlevel/projectOverview.ts
const getProjectOverviewSchema = z.object({ root: z.string().describe("Root directory for the project").optional() });
/**
* Detect project type from dependencies
*/
function detectProjectType(packageJson) {
	const deps = {
		...packageJson.dependencies,
		...packageJson.devDependencies
	};
	if (deps.react || deps["react-dom"]) return "React Application";
	if (deps.vue) return "Vue Application";
	if (deps.angular || deps["@angular/core"]) return "Angular Application";
	if (deps.next) return "Next.js Application";
	if (deps.express || deps.fastify || deps.koa) return "Node.js Server";
	if (deps.electron) return "Electron Application";
	if (packageJson.name?.startsWith("@") && packageJson.name?.includes("/")) return "NPM Package";
	return "JavaScript/TypeScript Project";
}
/**
* Get project info from package.json
*/
async function getProjectInfo(rootPath) {
	try {
		const packageJsonPath = path$1.join(rootPath, "package.json");
		const content = await fs$1.readFile(packageJsonPath, "utf-8");
		const packageJson = JSON.parse(content);
		const dependencies = Object.keys({
			...packageJson.dependencies,
			...packageJson.devDependencies
		}).slice(0, 10);
		return {
			name: packageJson.name,
			version: packageJson.version,
			description: packageJson.description,
			type: detectProjectType(packageJson),
			dependencies
		};
	} catch {
		return {};
	}
}
/**
* Get directory structure from indexed files with file counts
*/
function getDirectoryStructure(rootPath, symbols) {
	const dirFiles = /* @__PURE__ */ new Map();
	for (const symbol of symbols) if (symbol.location?.uri) {
		const filePath = fileURLToPath(symbol.location.uri);
		const relativePath = path$1.relative(rootPath, filePath);
		const dir = path$1.dirname(relativePath);
		const parts = dir.split(path$1.sep).filter((p) => p && p !== ".");
		for (let i = 0; i < Math.min(parts.length, 3); i++) {
			const dirPath = parts.slice(0, i + 1).join("/");
			if (!dirFiles.has(dirPath)) dirFiles.set(dirPath, /* @__PURE__ */ new Set());
			dirFiles.get(dirPath).add(filePath);
		}
	}
	const dirCounts = /* @__PURE__ */ new Map();
	for (const [dir, files] of dirFiles) dirCounts.set(dir, files.size);
	return new Map([...dirCounts.entries()].sort((a, b) => {
		const depthA = a[0].split("/").length;
		const depthB = b[0].split("/").length;
		if (depthA !== depthB) return depthA - depthB;
		return a[0].localeCompare(b[0]);
	}));
}
/**
* Ensure index exists but don't create it if missing (lightweight check)
* Returns true if index exists, false otherwise
*/
function checkIndexExists(rootPath) {
	const stats = getIndexStats(rootPath);
	return stats.totalFiles > 0;
}
const getProjectOverviewTool = {
	name: "get_project_overview",
	description: "Get a quick overview of the project structure, key components, and statistics. This tool automatically creates an index if needed and provides a concise summary.",
	schema: getProjectOverviewSchema,
	execute: async ({ root }, context) => {
		const rootPath = root || process.cwd();
		const indexExists = checkIndexExists(rootPath);
		if (!indexExists) {
			debugLogWithPrefix("get_project_overview", "No index found, creating and performing initial full index");
			const index = getOrCreateIndex(rootPath, context);
			if (index) try {
				const startTime = Date.now();
				const patterns = [
					"**/*.ts",
					"**/*.tsx",
					"**/*.js",
					"**/*.jsx",
					"**/*.mjs",
					"**/*.mts"
				];
				const files = [];
				for (const pattern of patterns) for await (const file of glob$1(pattern, { cwd: rootPath })) if (typeof file === "string") files.push(file);
				else if (file && typeof file === "object" && "name" in file) files.push(file.name);
				debugLogWithPrefix("get_project_overview", `Found ${files.length} files to index`);
				if (files.length > 0) await indexFiles(rootPath, files, {
					concurrency: 5,
					context
				});
				const elapsed = Date.now() - startTime;
				debugLogWithPrefix("get_project_overview", `Initial indexing completed in ${elapsed}ms`);
			} catch (error) {
				debugLogWithPrefix("get_project_overview", `Initial indexing failed: ${error}`);
			}
		} else try {
			debugLogWithPrefix("get_project_overview", "Index exists, running fast incremental update");
			const startTime = Date.now();
			const updateResult = await updateIndexIncremental(rootPath, context);
			const elapsed = Date.now() - startTime;
			if (updateResult.success) debugLogWithPrefix("get_project_overview", `Incremental update completed in ${elapsed}ms: ${updateResult.updated.length} files updated, ${updateResult.removed.length} files removed`);
			else if (updateResult.errors.length > 0) debugLogWithPrefix("get_project_overview", `Incremental update errors: ${updateResult.errors.join(", ")}`);
		} catch (error) {
			debugLogWithPrefix("get_project_overview", `Incremental update failed: ${error}`);
		}
		const projectInfo = await getProjectInfo(rootPath);
		const stats = getIndexStats(rootPath);
		let errorCount = 0;
		let warningCount = 0;
		if (context?.lspClient) try {
			const diagnostics = await getProjectDiagnostics({ root: rootPath }, context.lspClient, context);
			errorCount = diagnostics.errorCount;
			warningCount = diagnostics.warningCount;
		} catch (error) {
			debugLogWithPrefix("get_project_overview", `Failed to get diagnostics: ${error}`);
		}
		const allSymbols = querySymbols(rootPath, {});
		const config = loadIndexConfig(rootPath);
		const isVariableFiltered = config?.symbolFilter?.excludeKinds?.includes("Variable");
		const isConstantFiltered = config?.symbolFilter?.excludeKinds?.includes("Constant");
		const functions = allSymbols.filter((s) => s.kind === SymbolKind.Function);
		const methods = allSymbols.filter((s) => s.kind === SymbolKind.Method);
		const classes = allSymbols.filter((s) => s.kind === SymbolKind.Class);
		const interfaces = allSymbols.filter((s) => s.kind === SymbolKind.Interface);
		const enums = allSymbols.filter((s) => s.kind === SymbolKind.Enum);
		const constants = allSymbols.filter((s) => s.kind === SymbolKind.Constant);
		const variables = allSymbols.filter((s) => s.kind === SymbolKind.Variable);
		const properties = allSymbols.filter((s) => s.kind === SymbolKind.Property);
		const directories = getDirectoryStructure(rootPath, allSymbols);
		let output = "## Project Overview\n\n";
		if (projectInfo.name) {
			output += `**Project:** ${projectInfo.name}`;
			if (projectInfo.version) output += ` v${projectInfo.version}`;
			output += "\n";
			if (projectInfo.description) output += `${projectInfo.description}\n`;
			if (projectInfo.type) output += `**Type:** ${projectInfo.type}\n`;
			output += "\n";
		}
		output += "### Statistics:\n";
		output += `- **Files:** ${stats.totalFiles}\n`;
		output += `- **Symbols:** ${stats.totalSymbols}\n`;
		output += `- **Indexing time:** ${stats.totalFiles > 0 ? Math.round(stats.indexingTime / 1e3) : 0}s\n`;
		output += `- **Last updated:** ${stats.lastUpdated.toISOString()}\n`;
		if (stats.totalSymbols > 0) {
			output += "\n**Symbol breakdown:**\n";
			output += `  - Classes: ${classes.length}\n`;
			output += `  - Interfaces: ${interfaces.length}\n`;
			output += `  - Functions: ${functions.length}\n`;
			output += `  - Methods: ${methods.length}\n`;
			if (properties.length > 0) output += `  - Properties: ${properties.length}\n`;
			if (variables.length > 0 || constants.length > 0) {
				output += `  - Variables: ${variables.length}\n`;
				output += `  - Constants: ${constants.length}\n`;
			} else if (isVariableFiltered || isConstantFiltered) {
				const filtered = [];
				if (isVariableFiltered) filtered.push("Variables");
				if (isConstantFiltered) filtered.push("Constants");
				output += `  - *${filtered.join("/")} excluded by config*\n`;
			}
			if (enums.length > 0) output += `  - Enums: ${enums.length}\n`;
		}
		if (errorCount > 0 || warningCount > 0) {
			output += "\n**Diagnostics:**\n";
			output += `  - Errors: ${errorCount}\n`;
			output += `  - Warnings: ${warningCount}\n`;
		}
		if (stats.totalFiles === 0) {
			output += "\n⚠️ **No symbol index found**\n";
			output += "The project has not been indexed yet. To enable fast symbol search:\n";
			output += "1. Run `index_symbols` tool to create the initial index\n";
			output += "2. The index will be automatically updated when files change\n";
			output += "\nAlternatively, `search_symbols` will auto-create the index on first use.\n";
		} else if (stats.totalSymbols === 0) {
			output += "\n⚠️ **Index exists but no symbols found**\n";
			output += "This might mean:\n";
			output += "- The file patterns don't match any source files\n";
			output += "- The LSP server doesn't support symbol indexing\n";
			output += "- Try running `index_symbols` with different file patterns\n";
		}
		output += "\n";
		if (directories.size > 0) {
			output += "### Structure (top 3 levels):\n```\n";
			for (const [dir, fileCount] of directories) {
				const depth = dir.split("/").length - 1;
				const indent = "  ".repeat(depth);
				const name = dir.split("/").pop();
				output += `${indent}${name}/ (${fileCount} files)\n`;
			}
			output += "```\n\n";
		}
		output += "### Key Components:\n\n";
		if (functions.length > 0 || methods.length > 0) {
			const allFunctions = [...functions, ...methods];
			const exportedFunctions = allFunctions.filter((f) => !f.containerName);
			const classMethods = allFunctions.filter((f) => f.containerName);
			output += `**Functions & Methods** (${allFunctions.length} total):\n`;
			if (exportedFunctions.length > 0) {
				output += `\nExported Functions (showing first 10 of ${exportedFunctions.length}):\n`;
				exportedFunctions.slice(0, 10).forEach((f) => {
					const filePath = f.location ? path$1.basename(fileURLToPath(f.location.uri)) : "";
					output += `  • ${f.name} - ${filePath}\n`;
				});
				if (exportedFunctions.length > 10) output += `  ... and ${exportedFunctions.length - 10} more\n`;
			}
			if (classMethods.length > 0) {
				const methodsByClass = /* @__PURE__ */ new Map();
				classMethods.forEach((m) => {
					const container = m.containerName || "Unknown";
					if (!methodsByClass.has(container)) methodsByClass.set(container, []);
					methodsByClass.get(container).push(m);
				});
				output += `\nClass Methods (showing first 5 classes):\n`;
				let shown = 0;
				for (const [className, methods$1] of methodsByClass) {
					if (shown >= 5) break;
					output += `  ${className}:\n`;
					methods$1.slice(0, 3).forEach((m) => {
						output += `    • ${m.name}\n`;
					});
					if (methods$1.length > 3) output += `    ... and ${methods$1.length - 3} more\n`;
					shown++;
				}
				if (methodsByClass.size > 5) output += `  ... and ${methodsByClass.size - 5} more classes\n`;
			}
			output += "\n";
		}
		if (classes.length > 0) {
			const limit = 10;
			output += `**Classes** (showing first 10 of ${classes.length}):\n`;
			classes.slice(0, limit).forEach((c) => {
				const classMethods = methods.filter((m) => m.containerName === c.name);
				const filePath = c.location ? path$1.basename(fileURLToPath(c.location.uri)) : "";
				output += `  • ${c.name} (${classMethods.length} methods) - ${filePath}\n`;
			});
			if (classes.length > limit) output += `  ... and ${classes.length - limit} more\n`;
			output += "\n";
		}
		if (interfaces.length > 0) {
			const limit = 8;
			output += `**Interfaces** (showing first 8 of ${interfaces.length}):\n`;
			interfaces.slice(0, limit).forEach((i) => {
				const filePath = i.location ? path$1.basename(fileURLToPath(i.location.uri)) : "";
				output += `  • ${i.name} - ${filePath}\n`;
			});
			if (interfaces.length > limit) output += `  ... and ${interfaces.length - limit} more\n`;
			output += "\n";
		}
		if (enums.length > 0) {
			output += `**Enums** (showing all ${enums.length}):\n`;
			enums.slice(0, 5).forEach((e) => {
				output += `  • ${e.name}\n`;
			});
			if (enums.length > 5) output += `  ... and ${enums.length - 5} more\n`;
			output += "\n";
		}
		if (constants.length > 0 || variables.length > 0) {
			output += `**Data**:\n`;
			if (constants.length > 0) output += `  • Constants: ${constants.length}\n`;
			if (variables.length > 0) output += `  • Variables: ${variables.length}\n`;
			output += "\n";
		}
		if (projectInfo.dependencies && projectInfo.dependencies.length > 0) {
			output += "### Dependencies:\n";
			projectInfo.dependencies.forEach((dep) => {
				output += `• ${dep}\n`;
			});
			output += "\n";
		}
		output += "### Next Steps:\n";
		if (stats.totalFiles === 0) {
			output += "1. Run `index_symbols` to build the symbol index\n";
			output += "2. Use `search_symbols` to find specific symbols (will auto-index)\n";
			output += "3. Use `lsp_get_document_symbols` to explore specific files\n";
		} else {
			output += "1. Use `search_symbols` to find specific symbols\n";
			output += "2. Use `lsp_get_document_symbols` to explore specific files\n";
			output += "3. Use `lsp_find_references` to trace symbol usage\n";
			output += "4. Use `lsp_get_definitions` to navigate to definitions\n";
		}
		return output;
	}
};

//#endregion
//#region src/features/ts/utils/findSymbolOccurrences.ts
/**
* Finds all occurrences of a symbol within a line
* @param lineText The text of the line
* @param symbolName The symbol to find
* @returns Array of character indices where the symbol appears
*/
function findSymbolOccurrences(lineText, symbolName) {
	const occurrences = [];
	let searchIndex = 0;
	let foundIndex = lineText.indexOf(symbolName, searchIndex);
	while (foundIndex !== -1) {
		occurrences.push(foundIndex);
		searchIndex = foundIndex + 1;
		foundIndex = lineText.indexOf(symbolName, searchIndex);
	}
	return occurrences;
}

//#endregion
//#region src/features/ts/utils/findSymbolInLine.ts
/**
* Finds the position of a symbol within a line
* @param lineText The text of the line
* @param symbolName The symbol to find
* @param symbolIndex Optional index if symbol appears multiple times (0-based)
* @returns Character index or error message
*/
function findSymbolInLine(lineText, symbolName, symbolIndex = 0) {
	const occurrences = findSymbolOccurrences(lineText, symbolName);
	if (occurrences.length === 0) return { error: `Symbol "${symbolName}" not found` };
	if (symbolIndex < 0 || symbolIndex >= occurrences.length) return { error: `Symbol "${symbolName}" occurrence ${symbolIndex} not found (only ${occurrences.length} occurrences)` };
	return { characterIndex: occurrences[symbolIndex] };
}

//#endregion
//#region src/tools/highlevel/getSymbolDetails.ts
const schema = z.object({
	root: z.string().describe("Root directory for the project").optional(),
	relativePath: z.string().describe("File path containing the symbol (relative to root)"),
	line: z.union([z.number(), z.string()]).describe("Line number (1-based) or string to match in the line"),
	symbol: z.string().describe("Symbol name to get details for")
});
/**
* Format hover contents from LSP response
*/
function formatHoverContents(contents) {
	const result = {};
	if (!contents) return result;
	let text = "";
	if (typeof contents === "string") text = contents;
	else if (Array.isArray(contents)) text = contents.map((c) => typeof c === "string" ? c : c.value).join("\n");
	else if (contents.value) text = contents.value;
	const lines = text.split("\n");
	const codeBlockRegex = /^```(\w+)?/;
	let inCodeBlock = false;
	let codeBlockContent = [];
	let documentation = [];
	for (const line of lines) if (codeBlockRegex.test(line)) {
		if (inCodeBlock && codeBlockContent.length > 0) {
			const code = codeBlockContent.join("\n").trim();
			if (!result.type && !result.signature) if (code.includes("(") && code.includes(")")) result.signature = code;
			else result.type = code;
			codeBlockContent = [];
		}
		inCodeBlock = !inCodeBlock;
	} else if (inCodeBlock) codeBlockContent.push(line);
	else if (line.trim()) documentation.push(line);
	if (codeBlockContent.length > 0) {
		const code = codeBlockContent.join("\n").trim();
		if (!result.type && !result.signature) if (code.includes("(") && code.includes(")")) result.signature = code;
		else result.type = code;
	}
	if (documentation.length > 0) result.documentation = documentation.join("\n").trim();
	return result;
}
/**
* Get comprehensive details about a symbol
*/
async function getSymbolDetailsImpl(args, client, _context) {
	const rootPath = args.root || process.cwd();
	const absolutePath = join$1(rootPath, args.relativePath);
	if (!existsSync$1(absolutePath)) return {
		symbol: args.symbol,
		file: args.relativePath,
		position: {
			line: 0,
			character: 0
		},
		error: `File not found: ${args.relativePath}`
	};
	try {
		const fileContent = await readFile(absolutePath, "utf-8");
		const lines = fileContent.split("\n");
		const fileUri = pathToFileURL(absolutePath).toString();
		const lineIndex = resolveLineParameter(lines, args.line);
		if (lineIndex === -1) return {
			symbol: args.symbol,
			file: args.relativePath,
			position: {
				line: 0,
				character: 0
			},
			error: `Line not found: ${args.line}`
		};
		const symbolResult = findSymbolInLine(lines[lineIndex], args.symbol);
		if ("error" in symbolResult) return {
			symbol: args.symbol,
			file: args.relativePath,
			position: {
				line: lineIndex + 1,
				character: 0
			},
			error: `Symbol "${args.symbol}" not found on line ${lineIndex + 1}`
		};
		const position = {
			line: lineIndex,
			character: symbolResult.characterIndex
		};
		const result = {
			symbol: args.symbol,
			file: args.relativePath,
			position: {
				line: lineIndex + 1,
				character: symbolResult.characterIndex + 1
			}
		};
		client.openDocument(fileUri, fileContent);
		try {
			const hoverResult = await withLSPOperation({
				client,
				fileUri,
				fileContent,
				timeout: 5e3,
				operation: async (client$1) => {
					return await client$1.getHover(fileUri, position);
				},
				errorContext: {
					operation: "get_hover",
					relativePath: args.relativePath,
					symbolName: args.symbol
				}
			});
			if (hoverResult) result.hover = formatHoverContents(hoverResult.contents);
			const definitionResult = await withLSPOperation({
				client,
				fileUri,
				fileContent,
				timeout: 5e3,
				operation: async (client$1) => {
					return await client$1.getDefinition(fileUri, position);
				},
				errorContext: {
					operation: "get_definition",
					relativePath: args.relativePath,
					symbolName: args.symbol
				}
			});
			if (definitionResult) {
				const definitions = Array.isArray(definitionResult) ? definitionResult : [definitionResult];
				if (definitions.length > 0) {
					const def = definitions[0];
					const uri = "targetUri" in def ? def.targetUri : def.uri;
					const range = "targetRange" in def ? def.targetRange : def.range;
					const defPath = uri.replace("file://", "");
					const defRelativePath = defPath.replace(rootPath + "/", "");
					result.definition = {
						file: defRelativePath,
						line: range.start.line + 1,
						character: range.start.character + 1
					};
					if (existsSync$1(defPath)) {
						const defContent = await readFile(defPath, "utf-8");
						const defLines = defContent.split("\n");
						const startLine = Math.max(0, range.start.line - 1);
						const endLine = Math.min(defLines.length, range.end.line + 2);
						result.definition.preview = defLines.slice(startLine, endLine).join("\n");
					}
				}
			}
			const referencesResult = await withLSPOperation({
				client,
				fileUri,
				fileContent,
				timeout: 1e4,
				operation: async (client$1) => {
					return await client$1.findReferences(fileUri, position);
				},
				errorContext: {
					operation: "get_references",
					relativePath: args.relativePath,
					symbolName: args.symbol
				}
			});
			if (referencesResult && referencesResult.length > 0) {
				result.references = [];
				const refsToShow = referencesResult.slice(0, 20);
				for (const ref of refsToShow) {
					const refPath = ref.uri.replace("file://", "");
					const refRelativePath = refPath.replace(rootPath + "/", "");
					const refEntry = {
						file: refRelativePath,
						line: ref.range.start.line + 1,
						character: ref.range.start.character + 1,
						preview: ""
					};
					if (existsSync$1(refPath)) {
						const refContent = await readFile(refPath, "utf-8");
						const refLines = refContent.split("\n");
						if (ref.range.start.line < refLines.length) refEntry.preview = refLines[ref.range.start.line].trim();
					}
					result.references.push(refEntry);
				}
				if (referencesResult.length > 20) result.references.push({
					file: "...",
					line: 0,
					character: 0,
					preview: `... and ${referencesResult.length - 20} more references`
				});
			}
		} finally {
			client.closeDocument(fileUri);
		}
		return result;
	} catch (error) {
		return {
			symbol: args.symbol,
			file: args.relativePath,
			position: {
				line: 0,
				character: 0
			},
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
/**
* Format symbol details for display
*/
function formatSymbolDetails(details) {
	let output = `## Symbol Details: ${details.symbol}\n\n`;
	output += `**Location:** ${details.file}:${details.position.line}:${details.position.character}\n\n`;
	if (details.error) {
		output += `**Error:** ${details.error}\n`;
		return output;
	}
	if (details.hover) {
		output += "### Type Information\n";
		if (details.hover.type) output += "```typescript\n" + details.hover.type + "\n```\n";
		if (details.hover.signature) output += "**Signature:**\n```typescript\n" + details.hover.signature + "\n```\n";
		if (details.hover.documentation) output += "**Documentation:**\n" + details.hover.documentation + "\n";
		output += "\n";
	}
	if (details.definition) {
		output += "### Definition\n";
		output += `**File:** ${details.definition.file}:${details.definition.line}:${details.definition.character}\n`;
		if (details.definition.preview) output += "```typescript\n" + details.definition.preview + "\n```\n";
		output += "\n";
	}
	if (details.references && details.references.length > 0) {
		output += `### References (${details.references.length})\n`;
		for (const ref of details.references) if (ref.file === "...") output += `\n${ref.preview}\n`;
		else output += `- **${ref.file}:${ref.line}** - \`${ref.preview}\`\n`;
		output += "\n";
	}
	output += "### Next Steps\n";
	output += "- Use `lsp_get_definitions` with `includeBody: true` to see full implementation\n";
	output += "- Use `lsp_find_references` to see all usages in detail\n";
	output += "- Use `lsp_rename_symbol` to rename this symbol across the codebase\n";
	return output;
}
/**
* Create the get_symbol_details tool
*/
function createGetSymbolDetailsTool(client) {
	return {
		name: "get_symbol_details",
		description: "Get comprehensive details about a symbol including type information, definition, and references. This is a high-level tool that combines hover, definition, and references information. Use after search_symbols to get detailed information about a specific symbol.",
		schema,
		execute: async (args, context) => {
			const details = await getSymbolDetailsImpl(args, client, context);
			return formatSymbolDetails(details);
		}
	};
}

//#endregion
//#region src/tools/highlevel/indexTools.ts
const searchSymbolSchema = z.object({
	query: z.string().describe("Symbol name or pattern to search for (supports partial matching)").optional(),
	name: z.string().describe("Symbol name to search for (alias for query, supports partial matching)").optional(),
	kind: z.any().describe(`OPTIONAL - Symbol kind(s) to filter by. If not specified, searches ALL symbol types. Accepts: string (e.g., 'Class'), array (e.g., ['Class', 'Interface']), or JSON string (e.g., '["Class", "Interface"]'). Case-insensitive. Valid kinds: ${SYMBOL_KIND_NAMES.join(", ")}`).optional(),
	file: z.string().describe("File path to search within (relative to root)").optional(),
	containerName: z.string().describe("Container name (e.g., class name for methods)").optional(),
	includeChildren: z.boolean().default(true).describe("Include child symbols in results"),
	includeExternal: z.boolean().default(false).describe("Include external library symbols (from node_modules) in results"),
	onlyExternal: z.boolean().default(false).describe("Only return external library symbols"),
	sourceLibrary: z.string().describe("Filter by specific library name (e.g., 'neverthrow', '@types/node')").optional(),
	root: z.string().describe("Root directory for the project").optional()
});
const searchSymbolsTool = {
	name: "search_symbols",
	description: "Search for symbols (functions, classes, variables, etc.) in the codebase using an indexed search. Automatically creates and updates the symbol index as needed for fast searching across many files. Provides fuzzy name matching and guides you to use specific LSP tools for detailed operations. The 'kind' parameter is OPTIONAL - if not specified, searches ALL symbol types. When provided, use case-insensitive values like: File, Module, Namespace, Package, Class, Method, Property, Field, Constructor, Enum, Interface, Function, Variable, Constant, String, Number, Boolean, Array, Object, Key, Null, EnumMember, Struct, Event, Operator, TypeParameter.",
	schema: searchSymbolSchema,
	execute: async ({ query, name, kind, file, containerName, includeChildren, includeExternal, onlyExternal, sourceLibrary, root }, context) => {
		const rootPath = root || process.cwd();
		const stats = getIndexStats(rootPath);
		if (stats.totalFiles === 0) {
			debugLogWithPrefix("search_symbol_from_index", "No index found. Creating initial index...");
			const index = getOrCreateIndex(rootPath, context);
			if (!index) return `Error: Failed to create symbol index. LSP client may not be properly initialized.`;
			let pattern;
			const config = loadIndexConfig(rootPath);
			if (config?.files && config.files.length > 0) {
				pattern = config.files.join(",");
				debugLogWithPrefix("search_symbol_from_index", `Using patterns from config.files: ${pattern}`);
			} else if (context?.config?.files && Array.isArray(context.config.files)) {
				pattern = context.config.files.join(",");
				debugLogWithPrefix("search_symbol_from_index", `Using patterns from context.config.files: ${pattern}`);
			} else if (context?.config?.preset) {
				const presetId = context.config.preset;
				pattern = getAdapterDefaultPattern(presetId);
				if (!pattern) {
					debugLogWithPrefix("search_symbol_from_index", `Unknown preset '${presetId}' or preset has no default patterns`);
					return `Unknown preset '${presetId}' or preset has no default patterns. Please specify 'files' in your .lsmcp/config.json`;
				}
				debugLogWithPrefix("search_symbol_from_index", `Using patterns from preset '${presetId}': ${pattern}`);
			} else {
				debugLogWithPrefix("search_symbol_from_index", "No file patterns configured. Please specify 'files' or 'preset' in config.");
				return "No file patterns configured. Please specify 'files' or 'preset' in your .lsmcp/config.json";
			}
			const concurrency = config?.settings?.indexConcurrency || 5;
			const files = [];
			const patterns = pattern.includes("{") && pattern.includes("}") ? [pattern] : pattern.split(",").map((p) => p.trim());
			for (const p of patterns) for await (const file$1 of glob$1(p, { cwd: rootPath })) if (typeof file$1 === "string") files.push(file$1);
			else if (file$1 && typeof file$1 === "object" && "name" in file$1) files.push(file$1.name);
			if (files.length === 0) return `No files found matching pattern: ${pattern}`;
			debugLogWithPrefix("search_symbol_from_index", `Indexing ${files.length} files...`);
			const startTime = Date.now();
			await index.indexFiles(files, concurrency, { onProgress: (progress) => {
				if (progress.completed % 10 === 0 || progress.completed === progress.total) debugLogWithPrefix("search_symbol_from_index", `Progress: ${progress.completed}/${progress.total} files`);
			} });
			const stats$1 = index.getStats();
			const duration = Date.now() - startTime;
			debugLogWithPrefix("search_symbol_from_index", `Initial indexing completed: ${stats$1.totalFiles} files, ${stats$1.totalSymbols} symbols in ${duration}ms`);
		} else try {
			const updateResult = await updateIndexIncremental(rootPath, context);
			if (updateResult.success) {
				const updatedCount = updateResult.updated.length;
				const removedCount = updateResult.removed.length;
				if (updatedCount > 0 || removedCount > 0) debugLogWithPrefix("search_symbol_from_index", `Auto-updated index: ${updatedCount} files updated, ${removedCount} files removed`);
			}
		} catch (error) {
			debugLogWithPrefix("search_symbol_from_index", `Failed to auto-update index: ${error}`);
		}
		const searchQuery = {
			name: name || query,
			containerName,
			includeChildren,
			file,
			includeExternal,
			onlyExternal,
			sourceLibrary
		};
		if (kind !== void 0 && kind !== null && kind !== "") try {
			const parsedKinds = parseSymbolKind(kind);
			searchQuery.kind = parsedKinds && parsedKinds.length === 1 ? parsedKinds[0] : parsedKinds;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return `Error: ${errorMessage}

Valid symbol kinds (case-insensitive):
${SYMBOL_KIND_NAMES.join(", ")}

Examples:
  • Single kind: "Class" or "class" or "CLASS"
  • Multiple kinds: ["Class", "Interface", "Function"]
  • JSON string: "[\"Class\", \"Interface\"]"
  • Empty/undefined: Search all symbol kinds`;
		}
		const results = querySymbols(rootPath, searchQuery);
		if (results.length === 0) return "No symbols found matching the query.";
		let output = `Found ${results.length} symbol(s) matching your search:\n\n`;
		const displayCount = Math.min(results.length, 10);
		for (let i = 0; i < displayCount; i++) {
			const symbol = results[i];
			const filePath = fileURLToPath(symbol.location.uri);
			const relativePath = relative(rootPath, filePath);
			const range = symbol.location.range;
			const kindName = getSymbolKindName(symbol.kind) || `Unknown(${symbol.kind})`;
			const line = range.start.line + 1;
			const column = range.start.character + 1;
			output += `${i + 1}. ${symbol.name} [${kindName}]`;
			if (symbol.containerName) output += ` in ${symbol.containerName}`;
			if (symbol.deprecated) output += " (deprecated)";
			output += `\n`;
			output += `   Location: ${relativePath}:${line}:${column}\n`;
			if (symbol.detail) output += `   Details: ${symbol.detail}\n`;
			output += `\n   Use get_symbol_details for comprehensive information:\n`;
			output += `   • mcp__lsmcp__get_symbol_details --root "${rootPath}" --relativePath "${relativePath}" --line ${line} --symbol "${symbol.name}"\n`;
			output += `\n   Or use specific LSP tools for targeted operations:\n`;
			output += `   • View definition: lsp_get_definitions --root "${rootPath}" --relativePath "${relativePath}" --line ${line} --symbolName "${symbol.name}" --includeBody true\n`;
			output += `   • Rename symbol: lsp_rename_symbol --root "${rootPath}" --relativePath "${relativePath}" --line ${line} --textTarget "${symbol.name}" --newName "NEW_NAME"\n`;
			output += `\n`;
		}
		if (results.length > displayCount) {
			output += `\n... and ${results.length - displayCount} more results.\n`;
			output += `Refine your search with more specific criteria (name, kind, or file pattern) to see more relevant results.`;
		}
		return output;
	}
};
const indexTools = [getProjectOverviewTool, searchSymbolsTool];

//#endregion
//#region src/tools/editor/regexEditTools.ts
const replaceRegexSchema = z.object({
	root: z.string().describe("Root directory for resolving relative paths"),
	relativePath: z.string().describe("The relative path to the file"),
	regex: z.string().describe("Python-style regular expression to match"),
	repl: z.string().describe("Replacement string with backreferences like $1, $2"),
	allowMultipleOccurrences: z.boolean().default(false).describe("Replace all occurrences if true")
});
const replaceRegexTool = {
	name: "replace_regex",
	description: "Replace content using regular expressions with dotall and multiline flags",
	schema: replaceRegexSchema,
	execute: async ({ root, relativePath, regex, repl, allowMultipleOccurrences = false }) => {
		try {
			const absolutePath = resolve(root, relativePath);
			const fileContent = await readFile$1(absolutePath, "utf-8");
			const regexObj = new RegExp(regex, "sm");
			const matches = Array.from(fileContent.matchAll(new RegExp(regex, "gms")));
			if (matches.length === 0) return JSON.stringify({
				success: false,
				error: `No matches found for regex: ${regex}`
			});
			if (!allowMultipleOccurrences && matches.length > 1) return JSON.stringify({
				success: false,
				error: `Multiple occurrences found (${matches.length}). Set allowMultipleOccurrences to true or use a more specific regex.`
			});
			let newContent;
			if (allowMultipleOccurrences) newContent = fileContent.replace(new RegExp(regex, "gms"), repl);
			else newContent = fileContent.replace(regexObj, repl);
			if (newContent === fileContent) return JSON.stringify({
				success: false,
				error: "No changes made - replacement resulted in identical content"
			});
			await writeFile$1(absolutePath, newContent, "utf-8");
			markFileModified(root, absolutePath);
			return JSON.stringify({
				success: true,
				filesChanged: [relativePath]
			});
		} catch (error) {
			return JSON.stringify({
				success: false,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}
};

//#endregion
//#region src/tools/editor/rangeEditTools.ts
const replaceRangeSchema = z.object({
	root: z.string().describe("Root directory for resolving relative paths"),
	relativePath: z.string().describe("File path to edit (relative to root)"),
	startLine: z.number().describe("Start line number (1-based, inclusive)"),
	startCharacter: z.number().describe("Start character position in the line (0-based)"),
	endLine: z.number().describe("End line number (1-based, inclusive)"),
	endCharacter: z.number().describe("End character position in the line (0-based)"),
	newContent: z.string().describe("New content to replace the range with (empty string for deletion)"),
	preserveIndentation: z.boolean().default(true).describe("Whether to preserve the indentation of the first line")
});
/**
* Replace a range of text in a file with new content
* This is a more flexible alternative to symbol-based editing
*/
const replaceRangeTool = {
	name: "replace_range",
	description: "Replace a specific range of text in a file. Use this after getting position information from lsp_get_definitions or other LSP tools. Can be used to: replace symbol bodies, insert before/after symbols, delete ranges, or make precise edits. Line numbers are 1-based, character positions are 0-based.",
	schema: replaceRangeSchema,
	execute: async ({ root, relativePath, startLine, startCharacter, endLine, endCharacter, newContent, preserveIndentation }) => {
		try {
			const absolutePath = resolve(root, relativePath);
			const fileContent = await readFile$1(absolutePath, "utf-8");
			const lines = fileContent.split("\n");
			if (startLine < 1 || startLine > lines.length) return JSON.stringify({
				success: false,
				error: `Invalid start line ${startLine}. File has ${lines.length} lines.`
			});
			if (endLine < startLine || endLine > lines.length) return JSON.stringify({
				success: false,
				error: `Invalid end line ${endLine}. Must be >= ${startLine} and <= ${lines.length}.`
			});
			const startLineIdx = startLine - 1;
			const endLineIdx = endLine - 1;
			if (startCharacter < 0 || startCharacter > lines[startLineIdx].length) return JSON.stringify({
				success: false,
				error: `Invalid start character ${startCharacter} on line ${startLine}. Line has ${lines[startLineIdx].length} characters.`
			});
			if (endCharacter < 0 || endCharacter > lines[endLineIdx].length) return JSON.stringify({
				success: false,
				error: `Invalid end character ${endCharacter} on line ${endLine}. Line has ${lines[endLineIdx].length} characters.`
			});
			let baseIndent = "";
			if (preserveIndentation && newContent) {
				const indentMatch = lines[startLineIdx].match(/^(\s*)/);
				baseIndent = indentMatch ? indentMatch[1] : "";
			}
			let processedContent = newContent;
			if (preserveIndentation && baseIndent && newContent) {
				const contentLines = newContent.split("\n");
				processedContent = contentLines.map((line, index) => {
					if (!line.trim()) return line;
					if (index === 0 && startCharacter > 0) return line;
					return baseIndent + line;
				}).join("\n");
			}
			if (startLineIdx === endLineIdx) {
				const line = lines[startLineIdx];
				const before = line.substring(0, startCharacter);
				const after = line.substring(endCharacter);
				lines[startLineIdx] = before + processedContent + after;
			} else {
				const firstLine = lines[startLineIdx].substring(0, startCharacter);
				const lastLine = lines[endLineIdx].substring(endCharacter);
				const replacement = firstLine + processedContent + lastLine;
				const replacementLines = replacement.split("\n");
				lines.splice(startLineIdx, endLineIdx - startLineIdx + 1, ...replacementLines);
			}
			await writeFile$1(absolutePath, lines.join("\n"), "utf-8");
			markFileModified(root, absolutePath);
			return JSON.stringify({
				success: true,
				filesChanged: [relativePath]
			});
		} catch (error) {
			return JSON.stringify({
				success: false,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}
};

//#endregion
//#region src/features/memory/memoryManager.ts
var MemoryManager = class {
	memoriesPath;
	constructor(rootPath) {
		this.memoriesPath = join(rootPath, ".lsmcp", "memories");
	}
	async ensureMemoriesDir() {
		if (!existsSync(this.memoriesPath)) await mkdir$1(this.memoriesPath, { recursive: true });
	}
	async listMemories() {
		await this.ensureMemoriesDir();
		const files = await readdir(this.memoriesPath);
		return files.filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
	}
	async readMemory(name) {
		await this.ensureMemoriesDir();
		const filePath = join(this.memoriesPath, `${name}.md`);
		try {
			const content = await readFile$1(filePath, "utf-8");
			const metadataMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
			let createdAt = /* @__PURE__ */ new Date();
			let updatedAt = /* @__PURE__ */ new Date();
			if (metadataMatch) {
				const metadata = metadataMatch[1];
				const createdMatch = metadata.match(/created: (.+)/);
				const updatedMatch = metadata.match(/updated: (.+)/);
				if (createdMatch) createdAt = new Date(createdMatch[1]);
				if (updatedMatch) updatedAt = new Date(updatedMatch[1]);
			}
			return {
				name,
				content: content.replace(/^---\n[\s\S]*?\n---\n/, "").trim(),
				createdAt,
				updatedAt
			};
		} catch (error) {
			if (error.code === "ENOENT") return null;
			throw error;
		}
	}
	async writeMemory(name, content) {
		await this.ensureMemoriesDir();
		const filePath = join(this.memoriesPath, `${name}.md`);
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const existingMemory = await this.readMemory(name);
		const metadata = `---
created: ${existingMemory?.createdAt.toISOString() || now}
updated: ${now}
---

`;
		await writeFile$1(filePath, metadata + content, "utf-8");
	}
	async deleteMemory(name) {
		const filePath = join(this.memoriesPath, `${name}.md`);
		try {
			await unlink(filePath);
			return true;
		} catch (error) {
			if (error.code === "ENOENT") return false;
			throw error;
		}
	}
};

//#endregion
//#region src/tools/memory/memoryTools.ts
const listMemoriesSchema = z.object({ root: z.string().describe("Root directory of the project") });
const listMemoriesTool = {
	name: "list_memories",
	description: "List available memories for the current project",
	schema: listMemoriesSchema,
	execute: async ({ root }) => {
		const manager = new MemoryManager(root);
		const memories = await manager.listMemories();
		return JSON.stringify(memories);
	}
};
const readMemorySchema = z.object({
	root: z.string().describe("Root directory of the project"),
	memoryName: z.string().describe("Name of the memory to read")
});
const readMemoryTool = {
	name: "read_memory",
	description: "Read a specific memory from the project",
	schema: readMemorySchema,
	execute: async ({ root, memoryName }) => {
		const manager = new MemoryManager(root);
		const memory = await manager.readMemory(memoryName);
		if (!memory) throw new Error(`Memory '${memoryName}' not found`);
		return memory.content;
	}
};
const writeMemorySchema = z.object({
	root: z.string().describe("Root directory of the project"),
	memoryName: z.string().describe("Name of the memory to write"),
	content: z.string().describe("Content to save in the memory")
});
const writeMemoryTool = {
	name: "write_memory",
	description: "Write or update a memory for the project",
	schema: writeMemorySchema,
	execute: async ({ root, memoryName, content }) => {
		const manager = new MemoryManager(root);
		await manager.writeMemory(memoryName, content);
		return `Memory '${memoryName}' saved successfully`;
	}
};
const deleteMemorySchema = z.object({
	root: z.string().describe("Root directory of the project"),
	memoryName: z.string().describe("Name of the memory to delete")
});
const deleteMemoryTool = {
	name: "delete_memory",
	description: "Delete a memory from the project",
	schema: deleteMemorySchema,
	execute: async ({ root, memoryName }) => {
		const manager = new MemoryManager(root);
		const deleted = await manager.deleteMemory(memoryName);
		if (!deleted) throw new Error(`Memory '${memoryName}' not found`);
		return `Memory '${memoryName}' deleted successfully`;
	}
};

//#endregion
//#region src/tools/highlevel/fileSystemToolsFactory.ts
const listDirSchema = z.object({
	relativePath: z.string().describe("The relative path to the directory to list; pass \".\" to scan the project root."),
	recursive: z.boolean().describe("Whether to scan subdirectories recursively."),
	maxAnswerChars: z.number().default(2e5).describe("If the output is longer than this number of characters,\nno content will be returned. Don't adjust unless there is really no other way to get the content\nrequired for the task.")
});
function createListDirTool(fileSystemApi = nodeFileSystemApi) {
	return {
		name: "list_dir",
		description: "Lists all non-gitignored files and directories in the given directory (optionally with recursion). Returns a JSON object with the names of directories and files within the given directory.",
		schema: listDirSchema,
		execute: async ({ relativePath, recursive, maxAnswerChars = 2e5 }) => {
			try {
				const rootPath = process.cwd();
				const absolutePath = join(rootPath, relativePath);
				if (!await fileSystemApi.exists(absolutePath)) return JSON.stringify({ error: `Directory not found: ${relativePath}` });
				const globPattern = recursive ? join(relativePath, "**", "*") : join(relativePath, "*");
				const globOptions = {
					cwd: rootPath,
					gitignore: true,
					onlyFiles: false,
					markDirectories: true,
					absolute: false
				};
				if (fileSystemApi !== nodeFileSystemApi) globOptions.fs = fileSystemApi;
				const result = {
					directories: [],
					files: []
				};
				for await (const path$3 of glob$1(globPattern, globOptions)) {
					const isDirectory = path$3.endsWith("/");
					const cleanPath = isDirectory ? path$3.slice(0, -1) : path$3;
					if (isDirectory) result.directories.push(cleanPath);
					else result.files.push(cleanPath);
				}
				if (!recursive) {
					const entries = await fileSystemApi.readdir(absolutePath);
					for (const entry of entries) {
						const entryPath = join(absolutePath, entry);
						const stats = await fileSystemApi.stat(entryPath);
						if (stats.isDirectory()) {
							const relativeDirPath = join(relativePath, entry);
							if (!result.directories.includes(relativeDirPath)) {
								const ignoredDirs = [
									"node_modules",
									".git",
									"dist",
									"build",
									".next",
									".nuxt",
									"coverage"
								];
								if (!ignoredDirs.includes(entry) && !entry.startsWith(".")) result.directories.push(relativeDirPath);
							}
						}
					}
				}
				const output = JSON.stringify(result, null, 2);
				if (output.length > maxAnswerChars) return JSON.stringify({ error: `Output too long (${output.length} chars). Try with a more specific path or without recursion.` });
				return output;
			} catch (error) {
				return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
			}
		}
	};
}

//#endregion
//#region src/tools/highlevel/fileSystemTools.ts
const listDirTool = createListDirTool();

//#endregion
//#region src/tools/highlevel/symbolToolsFactory.ts
async function getFilesRecursively(dir, rootPath, fileSystemApi = nodeFileSystemApi) {
	const extensions = [
		"ts",
		"tsx",
		"js",
		"jsx",
		"py",
		"java",
		"cpp",
		"c",
		"h",
		"hpp",
		"cs",
		"rb",
		"go",
		"rs",
		"php",
		"swift",
		"kt",
		"scala",
		"r",
		"m",
		"mm",
		"fs",
		"fsx",
		"ml",
		"mli"
	];
	const pattern = `**/*.{${extensions.join(",")}}`;
	const globOptions = { cwd: dir };
	if (fileSystemApi !== nodeFileSystemApi) globOptions.fs = fileSystemApi;
	const files = [];
	try {
		for await (const file of glob$1(pattern, globOptions)) files.push(file);
	} catch (err$7) {
		const code = err$7?.code ?? err$7?.cause?.code;
		if (code !== "ENOENT") throw err$7;
	}
	return files.map((file) => {
		const fullPath = resolve(dir, file);
		return fullPath.startsWith(rootPath + "/") ? fullPath.substring(rootPath.length + 1) : fullPath.replace(rootPath, "").replace(/^\//, "");
	});
}
const getSymbolsOverviewSchema = z.object({
	relativePath: z.string().describe("The relative path to the file or directory to get the overview of."),
	maxAnswerChars: z.number().default(2e5).describe("If the overview is longer than this number of characters,\nno content will be returned. Don't adjust unless there is really no other way to get the content\nrequired for the task. If the overview is too long, you should use a smaller directory instead,\n(e.g. a subdirectory).")
});
function createGetSymbolsOverviewTool(fileSystemApi = nodeFileSystemApi) {
	return {
		name: "get_symbols_overview",
		description: "Gets an overview of the given file or directory.\nFor each analyzed file, we list the top-level symbols in the file (name_path, kind).\nUse this tool to get a high-level understanding of the code symbols.\nCalling this is often a good idea before more targeted reading, searching or editing operations on the code symbols.\nBefore requesting a symbol overview, it is usually a good idea to narrow down the scope of the overview\nby first understanding the basic directory structure of the repository that you can get from memories\nor by using the `list_dir` and `find_file` tools (or similar). Returns a JSON object mapping relative paths of all contained files to info about top-level symbols in the file (name_path, kind).",
		schema: getSymbolsOverviewSchema,
		execute: async ({ relativePath, maxAnswerChars = 2e5 }) => {
			try {
				const rootPath = process.cwd();
				const absolutePath = resolve(rootPath, relativePath);
				if (!await fileSystemApi.exists(absolutePath)) return JSON.stringify({ error: `Path not found: ${relativePath}` });
				const index = getOrCreateIndex(rootPath, null);
				if (!index) return JSON.stringify({ error: "Failed to create symbol index. Make sure LSP is running." });
				const stats = await fileSystemApi.stat(absolutePath);
				const isDirectory = stats.isDirectory();
				let filesToIndex = [];
				if (isDirectory) {
					filesToIndex = await getFilesRecursively(absolutePath, rootPath, fileSystemApi);
					if (filesToIndex.length === 0) return JSON.stringify({ error: `No files found in ${relativePath}` });
				} else filesToIndex = [relativePath];
				const indexResult = await indexFiles(rootPath, filesToIndex);
				if (!indexResult.success && indexResult.errors.length > 0) return JSON.stringify({ error: `Failed to index files: ${indexResult.errors.join(", ")}` });
				const result = {};
				for (const file of filesToIndex) {
					const query = {
						file,
						includeChildren: false
					};
					const symbols = querySymbols(rootPath, query);
					result[file] = symbols.map((symbol) => {
						const kindKey = Object.entries(SymbolKind).find(([_, value]) => value === symbol.kind)?.[0];
						return {
							name_path: symbol.containerName ? `${symbol.containerName}/${symbol.name}` : symbol.name,
							kind: kindKey?.toLowerCase() || "unknown"
						};
					});
				}
				const output = JSON.stringify(result, null, 2);
				if (output.length > maxAnswerChars) return JSON.stringify({ error: `Output too long (${output.length} chars). Try with a smaller directory or file.` });
				return output;
			} catch (error) {
				errorLog("Directory scan error:", error);
				return JSON.stringify({ error: `Directory scan error: ${error instanceof Error ? error.message : String(error)}` });
			}
		}
	};
}

//#endregion
//#region src/tools/highlevel/symbolTools.ts
const getSymbolsOverviewTool = createGetSymbolsOverviewTool();

//#endregion
//#region src/tools/highlevel/externalLibraryTools.ts
/**
* Handle index_external_libraries tool
*/
async function handleIndexExternalLibraries(args) {
	const schema$15 = z.object({
		root: z.string(),
		maxFiles: z.number().optional(),
		includePatterns: z.array(z.string()).optional(),
		excludePatterns: z.array(z.string()).optional()
	});
	const parsed = schema$15.parse(args);
	const rootPath = resolve$1(parsed.root);
	const state = getSymbolIndex(rootPath);
	if (!state.client) throw new Error("LSP client not initialized. Please initialize the index first.");
	const config = {
		maxFiles: parsed.maxFiles,
		includePatterns: parsed.includePatterns,
		excludePatterns: parsed.excludePatterns
	};
	const result = await indexExternalLibrariesForState(state, config);
	const librariesArray = [];
	for (const [name, info] of result.libraries) librariesArray.push({
		name,
		version: info?.version,
		filesCount: Array.isArray(info?.typingsFiles) ? info.typingsFiles.length : 0
	});
	return JSON.stringify({
		librariesIndexed: result.libraries.size,
		filesIndexed: result.files.length,
		totalSymbols: result.totalSymbols,
		indexingTime: `${result.indexingTime}ms`,
		libraries: librariesArray
	}, null, 2);
}
/**
* Handle get_typescript_dependencies tool
*/
async function handleGetTypescriptDependencies(args) {
	const schema$15 = z.object({ root: z.string() });
	const parsed = schema$15.parse(args);
	const rootPath = resolve$1(parsed.root);
	const state = getSymbolIndex(rootPath);
	const dependencies = await getTypescriptDependencies(state);
	return JSON.stringify({
		totalDependencies: dependencies.length,
		dependencies: dependencies.sort()
	}, null, 2);
}
/**
* Handle search_external_library_symbols tool
*/
async function handleSearchExternalLibrarySymbols(args) {
	const schema$15 = z.object({
		root: z.string(),
		libraryName: z.string().optional(),
		symbolName: z.string().optional(),
		kind: z.enum([
			"Class",
			"Interface",
			"Function",
			"Variable",
			"Constant",
			"Enum",
			"Module",
			"Namespace",
			"TypeParameter"
		]).optional()
	});
	const parsed = schema$15.parse(args);
	const rootPath = resolve$1(parsed.root);
	const state = getSymbolIndex(rootPath);
	if (!state.externalLibraries) throw new Error("External libraries not indexed. Please run index_external_libraries first.");
	let symbols = queryExternalLibrarySymbols(state, parsed.libraryName);
	if (parsed.symbolName) {
		const searchName = parsed.symbolName.toLowerCase();
		symbols = symbols.filter((s) => s.name.toLowerCase().includes(searchName));
	}
	if (parsed.kind) {
		const kindMap = {
			Class: 5,
			Interface: 11,
			Function: 12,
			Variable: 13,
			Constant: 14,
			Enum: 10,
			Module: 2,
			Namespace: 3,
			TypeParameter: 26
		};
		const targetKind = kindMap[parsed.kind];
		if (targetKind !== void 0) symbols = symbols.filter((s) => s.kind === targetKind);
	}
	const maxResults = 100;
	const truncated = symbols.length > maxResults;
	const displaySymbols = symbols.slice(0, maxResults);
	return JSON.stringify({
		totalResults: symbols.length,
		displayed: displaySymbols.length,
		truncated,
		symbols: displaySymbols.map((s) => ({
			name: s.name,
			kind: getSymbolKindName(s.kind),
			container: s.containerName,
			file: s.location.uri.replace("file://", ""),
			detail: s.detail
		}))
	}, null, 2);
}
/**
* Export tools as ToolDef for MCP registration
*/
const indexExternalLibrariesToolDef = {
	name: "index_external_libraries",
	description: `Index TypeScript declaration files from node_modules to enable symbol search in external dependencies.
This tool scans node_modules for .d.ts files and indexes their symbols for fast searching.`,
	schema: z.object({
		root: z.string().describe("Root directory of the project"),
		maxFiles: z.number().optional().describe("Maximum number of files to index (default: 5000)"),
		includePatterns: z.array(z.string()).optional().describe("Glob patterns for files to include"),
		excludePatterns: z.array(z.string()).optional().describe("Glob patterns for files to exclude")
	}),
	execute: handleIndexExternalLibraries
};
const getTypescriptDependenciesToolDef = {
	name: "get_typescript_dependencies",
	description: `List all TypeScript dependencies available in the project (from package.json and node_modules).
Shows which external libraries have TypeScript declarations that can be indexed.`,
	schema: z.object({ root: z.string().describe("Root directory of the project") }),
	execute: handleGetTypescriptDependencies
};
const searchExternalLibrarySymbolsToolDef = {
	name: "search_external_library_symbols",
	description: `Search for symbols in indexed external libraries (node_modules).
Requires running index_external_libraries first.`,
	schema: z.object({
		root: z.string().describe("Root directory of the project"),
		libraryName: z.string().optional().describe("Name of the library to search in"),
		symbolName: z.string().optional().describe("Name of the symbol to search for"),
		kind: z.enum([
			"Class",
			"Interface",
			"Function",
			"Variable",
			"Constant",
			"Enum",
			"Module",
			"Namespace",
			"TypeParameter"
		]).optional().describe("Type of symbol to filter by")
	}),
	execute: handleSearchExternalLibrarySymbols
};

//#endregion
//#region src/tools/highlevel/symbolResolverTools.ts
/**
* Tool: Resolve symbol from imports
*/
const resolveSymbolToolDef = {
	name: "resolve_symbol",
	description: `Resolve a symbol to its definition in external libraries by analyzing import statements.
For example, if a file imports { ok, Ok, Err } from 'neverthrow', this tool can resolve where these symbols are defined.`,
	schema: z.object({
		root: z.string().describe("Root directory of the project"),
		filePath: z.string().describe("File path containing the symbol (relative to root)"),
		symbolName: z.string().describe("Name of the symbol to resolve (e.g., 'ok', 'Ok', 'Err')")
	}),
	execute: handleResolveSymbol
};
/**
* Tool: Get available external symbols
*/
const getAvailableExternalSymbolsToolDef = {
	name: "get_available_external_symbols",
	description: `Get all symbols available from external libraries imported in a file.
Shows what symbols are imported and from which modules they come from.`,
	schema: z.object({
		root: z.string().describe("Root directory of the project"),
		filePath: z.string().describe("File path to analyze (relative to root)")
	}),
	execute: handleGetAvailableExternalSymbols
};
/**
* Tool: Parse imports from file
*/
const parseImportsToolDef = {
	name: "parse_imports",
	description: `Parse and analyze import statements in a TypeScript/JavaScript file.
Shows all imports, their sources, and any aliases used.`,
	schema: z.object({
		root: z.string().describe("Root directory of the project"),
		filePath: z.string().describe("File path to analyze (relative to root)")
	}),
	execute: handleParseImports
};
/**
* Handle resolve_symbol tool
*/
async function handleResolveSymbol(args) {
	const schema$15 = z.object({
		root: z.string(),
		filePath: z.string(),
		symbolName: z.string()
	});
	const parsed = schema$15.parse(args);
	const rootPath = resolve$1(parsed.root);
	const fullPath = resolve$1(rootPath, parsed.filePath);
	const availableSymbols = await getAvailableExternalSymbols(fullPath, rootPath);
	const resolution = availableSymbols.get(parsed.symbolName);
	if (!resolution) return JSON.stringify({ error: `Symbol '${parsed.symbolName}' not found in imports or could not be resolved` }, null, 2);
	return JSON.stringify({
		symbolName: parsed.symbolName,
		sourceModule: resolution.sourceModule,
		resolvedPath: resolution.resolvedPath,
		symbol: {
			name: resolution.symbol.name,
			kind: getSymbolKindName(resolution.symbol.kind),
			location: resolution.symbol.location.uri.replace("file://", ""),
			detail: resolution.symbol.detail
		}
	}, null, 2);
}
/**
* Handle get_available_external_symbols tool
*/
async function handleGetAvailableExternalSymbols(args) {
	const schema$15 = z.object({
		root: z.string(),
		filePath: z.string()
	});
	const parsed = schema$15.parse(args);
	const rootPath = resolve$1(parsed.root);
	const fullPath = resolve$1(rootPath, parsed.filePath);
	const availableSymbols = await getAvailableExternalSymbols(fullPath, rootPath);
	const symbols = Array.from(availableSymbols.entries()).map(([local, resolution]) => ({
		localName: local,
		importedName: resolution.symbol.name,
		sourceModule: resolution.sourceModule,
		resolvedPath: resolution.resolvedPath
	}));
	return JSON.stringify({
		file: parsed.filePath,
		totalSymbols: symbols.length,
		symbols
	}, null, 2);
}
/**
* Handle parse_imports tool
*/
async function handleParseImports(args) {
	const schema$15 = z.object({
		root: z.string(),
		filePath: z.string()
	});
	const parsed = schema$15.parse(args);
	const rootPath = resolve$1(parsed.root);
	const fullPath = resolve$1(rootPath, parsed.filePath);
	const sourceCode = await readFile(fullPath, "utf-8");
	const imports = parseImports(sourceCode);
	const enhancedImports = imports.map((imp) => {
		const resolvedPath = resolveModulePath(imp.source, fullPath, rootPath);
		return {
			source: imp.source,
			resolvedPath,
			isTypeOnly: imp.isTypeOnly,
			specifiers: imp.specifiers.map((spec) => ({
				imported: spec.imported,
				local: spec.local,
				isDefault: spec.isDefault,
				isNamespace: spec.isNamespace
			}))
		};
	});
	return JSON.stringify({
		file: parsed.filePath,
		totalImports: enhancedImports.length,
		imports: enhancedImports
	}, null, 2);
}

//#endregion
//#region src/tools/index.ts
const coreTools = {
	replaceRange: replaceRangeTool,
	replaceRegex: replaceRegexTool,
	listMemories: listMemoriesTool,
	readMemory: readMemoryTool,
	writeMemory: writeMemoryTool,
	deleteMemory: deleteMemoryTool,
	listDir: listDirTool,
	getSymbolsOverview: getSymbolsOverviewTool
};
const languageSpecificTools = { typescript: {
	indexExternalLibraries: indexExternalLibrariesToolDef,
	getTypescriptDependencies: getTypescriptDependenciesToolDef,
	searchExternalLibrarySymbols: searchExternalLibrarySymbolsToolDef,
	resolveSymbol: resolveSymbolToolDef,
	getAvailableExternalSymbols: getAvailableExternalSymbolsToolDef,
	parseImports: parseImportsToolDef
} };
/**
* Get Serenity tools based on configuration
*/
function getSerenityTools(config) {
	const tools = { ...coreTools };
	if (config?.languageFeatures?.typescript?.enabled) Object.assign(tools, languageSpecificTools.typescript);
	return tools;
}
/**
* Get Serenity tools list based on configuration
*/
function getSerenityToolsList(config) {
	const tools = getSerenityTools(config);
	return Object.values(tools);
}

//#endregion
//#region src/features/memory/onboarding/onboardingPrompts.ts
const symbolIndexOnboardingPrompt = ({ system, rootPath }) => `You are setting up lsmcp's symbol indexing for a code project.
This will enable fast symbol search and navigation without repeatedly parsing files.

Project: ${rootPath}
System: ${system}

## Quick Start Guide

### 1. Explore Project Structure (30 seconds)
- Run: list_dir { "relativePath": ".", "recursive": false }
- Look for source directories like src/, lib/, app/, or similar
- Run: find_file { "fileMask": "*.ts", "relativePath": "." } (adjust extension based on project)

### 2. Index the Codebase (1-2 minutes)
Based on what you find, index files with appropriate patterns:
- TypeScript/JavaScript: index_files { "pattern": "**/*.{ts,tsx,js,jsx}", "root": "${rootPath}" }
- Python: index_files { "pattern": "**/*.py", "root": "${rootPath}" }
- Go: index_files { "pattern": "**/*.go", "root": "${rootPath}" }
- Mixed: index_files { "pattern": "**/*.{ts,js,py,go}", "root": "${rootPath}" }

Exclude test/vendor files if needed:
- index_files { "pattern": "src/**/*.ts", "root": "${rootPath}" }

### 3. Verify Index Success
- Run: get_index_stats { "root": "${rootPath}" }
- You should see total files and symbols indexed
- If 0 symbols, check if LSP server supports the file type

### 4. Test Symbol Search
Try these commands:
- search_symbol { "name": "main", "root": "${rootPath}" }
- search_symbol { "kind": [5, 12], "root": "${rootPath}" } (Classes and Functions)
- get_file_symbols { "filePath": "path/to/main/file", "root": "${rootPath}" }

### 5. Save Configuration
Write to memory the successful configuration:
- write_memory { "memoryName": "symbol_index_info", "content": "...", "root": "${rootPath}" }

Include: language, glob pattern used, total files/symbols, and any issues encountered.`;
const symbolSearchGuidancePrompt = () => `When searching for symbols in the indexed codebase:

1. Use search_symbol for finding symbols by name:
   - Partial matching is supported
   - Filter by symbol kind (Class, Method, Function, etc.)
   - Limit search to specific files or directories

2. Symbol kinds (use these numbers for filtering):
   - 5: Class
   - 6: Method
   - 7: Property
   - 12: Function
   - 13: Variable
   - 11: Interface
   - 10: Enum

3. For better performance:
   - Use file path restrictions when possible
   - Be specific with symbol names
   - Use kind filters to narrow results

4. The index provides:
   - Fast symbol lookup without parsing files
   - Hierarchical symbol relationships
   - Location information for navigation`;
const compressionAnalysisPrompt = () => `To analyze token compression effectiveness:

1. Use measure_compression to check compression ratios:
   - Provide file paths to analyze
   - The tool shows original vs compressed token counts
   - Typical compression ratios are 90-98%

2. Compression is most effective for:
   - Large source files with many symbols
   - Files with detailed implementations
   - Complex class hierarchies

3. The compressed format includes:
   - Symbol names and kinds
   - Hierarchical structure
   - Basic location information
   - No implementation details

4. Use cases for compression:
   - Providing context to AI models
   - Quick codebase overview
   - Navigation and search
   - Understanding code structure without details`;

//#endregion
//#region src/features/memory/onboarding/onboardingTools.ts
const indexOnboardingSchema = z.object({ root: z.string().describe("Root directory of the project") });
const indexOnboardingTool = {
	name: "index_onboarding",
	description: "Get instructions for onboarding the symbol index for a project",
	schema: indexOnboardingSchema,
	execute: async ({ root }) => {
		const systemInfo = `${platform()} ${process.version}`;
		return symbolIndexOnboardingPrompt({
			system: systemInfo,
			rootPath: root
		});
	}
};
const getSymbolSearchGuidanceSchema = z.object({});
const getSymbolSearchGuidanceTool = {
	name: "get_symbol_search_guidance",
	description: "Get guidance on how to effectively search symbols in the index",
	schema: getSymbolSearchGuidanceSchema,
	execute: async () => {
		return symbolSearchGuidancePrompt();
	}
};
const getCompressionGuidanceSchema = z.object({});
const getCompressionGuidanceTool = {
	name: "get_compression_guidance",
	description: "Get guidance on token compression analysis",
	schema: getCompressionGuidanceSchema,
	execute: async () => {
		return compressionAnalysisPrompt();
	}
};
const indexOnboardingTools = [
	indexOnboardingTool,
	getSymbolSearchGuidanceTool,
	getCompressionGuidanceTool
];

//#endregion
//#region src/tools/toolLists.ts
const highLevelTools = [...indexTools];
const serenityToolsList = getSerenityToolsList();
const onboardingToolsList = indexOnboardingTools;

//#endregion
export { ConfigLoader, NodeFileSystem, SQLiteCache, SymbolIndex, createGetSymbolDetailsTool, createLSPTools, getOrCreateIndex, getSerenityToolsList, globalPresetRegistry, highLevelTools, onboardingToolsList, registerBuiltinAdapters, serenityToolsList };