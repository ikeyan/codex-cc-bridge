#!/usr/bin/env node
import { CapabilityChecker, ErrorCode, LSMCPError, createLSPClient, createLSPSymbolProvider, createToolCapabilityMap, debug, debug$1, formatError$1 as formatError } from "./src-MZR2qMTi.js";
import { ConfigLoader, NodeFileSystem, SQLiteCache, SymbolIndex, createGetSymbolDetailsTool, createLSPTools, getOrCreateIndex, getSerenityToolsList, globalPresetRegistry, highLevelTools, onboardingToolsList, registerBuiltinAdapters } from "./toolLists-DuccsujO.js";
import { debugLogWithPrefix, errorLog, mcpDebugWithPrefix } from "./debugLog-LfbHS9a2.js";
import "./configLoader-CZlYj_hr.js";
import "./NodeFileSystemApi-CcTrKwya.js";
import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { existsSync as existsSync$1, readFileSync, readdirSync } from "fs";
import { dirname, join as join$1 } from "path";
import { execSync, spawn } from "child_process";
import { platform } from "os";
import { fileURLToPath } from "url";
import { appendFile, mkdir, readFile, writeFile } from "fs/promises";
import { glob } from "gitaware-glob";
import { minimatch } from "minimatch";

//#region src/cli/help.ts
function showHelp() {
	console.log(`
🌍 LSMCP - Language Service MCP for Multi-Language Support

Usage:
  lsmcp -p <preset>                        Start MCP server with preset
  lsmcp --files <pattern>                  Start MCP server with file patterns (comma-separated)
  lsmcp --bin <command> --files <pattern>  Start with custom LSP
  lsmcp init [-p <preset>]                 Initialize project
  lsmcp index                              Build symbol index
  lsmcp doctor [-p <preset>]               Analyze environment & suggest setup

Commands:
  init      Initialize lsmcp project configuration
  index     Build symbol index from config.json
  doctor    Analyze environment and suggest MCP configurations

Options:
  -p, --preset <preset>     Language adapter to use (see list below)
  --config <path>           Load language configuration from JSON file
  --bin <command>           Custom LSP server command (requires --files)
  --files <pattern>         File patterns to handle (comma-separated, e.g., "**/*.ts,**/*.tsx")
  --initializationOptions <json>  JSON string for LSP initialization options
  --list                    List all supported languages and presets
  -h, --help               Show this help message

Note: Either --preset, --config, --bin, or --files is required

Supported Presets:
  tsgo              TypeScript (Fast native implementation) - Recommended
  typescript        TypeScript/JavaScript (typescript-language-server)
  pyright           Python (Microsoft Pyright)
  ruff              Python (Ruff LSP)
  rust-analyzer     Rust
  gopls             Go
  fsharp            F#
  moonbit           MoonBit
  deno              Deno (TypeScript/JavaScript)

Custom LSP Server:
  For languages not in the preset list, use --bin with --files:
  
  lsmcp --bin "clangd" --files "**/*.{c,cpp,h,hpp}"          # C/C++
  lsmcp --bin "jdtls" --files "**/*.java"                    # Java
  lsmcp --bin "lua-language-server" --files "**/*.lua"       # Lua
  lsmcp --bin "solargraph" --files "**/*.rb"                 # Ruby
  lsmcp --bin "haskell-language-server" --files "**/*.hs"    # Haskell

Examples:
  lsmcp init -p tsgo           Initialize with tsgo (recommended for TypeScript)
  lsmcp doctor                 Check environment and get setup commands
  lsmcp -p tsgo                Start tsgo TypeScript MCP server
  lsmcp --bin "deno lsp" --files "**/*.ts,**/*.tsx"  Use Deno LSP for TypeScript/TSX
`);
}
function showListWithConfigLoader(adapterRegistry$1) {
	console.log("Available adapters with --preset:");
	const adapterList = adapterRegistry$1.list();
	for (const adapter of adapterList) {
		const id = "presetId" in adapter ? adapter.presetId : adapter.id || "";
		const description = adapter.description || "";
		console.log(`  ${id.padEnd(25)} - ${description}`);
	}
	console.log("\nFor custom language configuration, use --config:");
	console.log("  --config \"./my-language.json\"");
	console.log("\nFor other languages or custom LSP servers, use --bin:");
	console.log("  --bin \"deno lsp\" for Deno");
	console.log("  --bin \"clangd\" for C/C++");
	console.log("  --bin \"jdtls\" for Java");
}
function showNoArgsHelp(adapterRegistry$1) {
	console.log(`
🌍 LSMCP - Language Service MCP

No configuration found. Please initialize your project first:

  lsmcp init -p <preset>

Available presets:`);
	const adapterList = adapterRegistry$1.list();
	const primaryAdapters = [
		"typescript",
		"tsgo",
		"pyright",
		"rust-analyzer",
		"gopls"
	];
	for (const id of primaryAdapters) {
		const adapter = adapterList.find((a) => {
			const adapterId = "presetId" in a ? a.presetId : a.id;
			return adapterId === id;
		});
		if (adapter) {
			const adapterId = "presetId" in adapter ? adapter.presetId : adapter.id || "";
			const description = adapter.description || "";
			console.log(`  ${adapterId.padEnd(20)} - ${description}`);
		}
	}
	console.log(`
For a complete list of presets:
  lsmcp --list

For help:
  lsmcp --help
`);
}

//#endregion
//#region src/tools/filterTools.ts
const toolCapabilityMap = createToolCapabilityMap();
/**
* Special handling for certain capabilities that require custom logic
*/
const CAPABILITY_SPECIAL_CASES = {
	get_diagnostics: (checker) => {
		return checker.hasCapability("diagnosticProvider") || checker.hasCapability("textDocumentSync");
	},
	get_all_diagnostics: (checker) => {
		return checker.hasCapability("diagnosticProvider") || checker.hasCapability("textDocumentSync");
	},
	delete_symbol: (checker) => {
		return checker.hasCapability("codeActionProvider");
	}
};
/**
* Check if a tool is supported by the server capabilities
*/
function isToolSupportedByCapabilities(toolName, capabilities) {
	const checker = new CapabilityChecker(capabilities);
	if (!capabilities) return true;
	const specialCase = CAPABILITY_SPECIAL_CASES[toolName];
	if (specialCase) return specialCase(checker);
	const requiredCapabilities = toolCapabilityMap.get(toolName);
	if (!requiredCapabilities || requiredCapabilities.length === 0) return true;
	return checker.hasCapabilities(requiredCapabilities);
}
/**
* Filter tools based on server capabilities
* This should be called after the LSP server is initialized
*/
function filterToolsByCapabilities(tools, capabilities) {
	const checker = new CapabilityChecker(capabilities);
	if (!capabilities) {
		debug("No server capabilities available, returning all tools");
		return tools;
	}
	const filtered = tools.filter((tool) => {
		const isSupported = isToolSupportedByCapabilities(tool.name, capabilities);
		if (!isSupported) debug(`Tool '${tool.name}' filtered out - not supported by server capabilities`);
		return isSupported;
	});
	debug(`Filtered tools: ${filtered.length} out of ${tools.length} tools are supported`);
	const support = checker.getCapabilitySupport();
	debug("Server capability support:", support);
	return filtered;
}
/**
* Filter tools based on unsupported list from config
*/
function filterUnsupportedTools(tools, unsupported = []) {
	if (unsupported.length === 0) return tools;
	const unsupportedSet = new Set(unsupported);
	return tools.filter((tool) => !unsupportedSet.has(tool.name));
}
/**
* Create a capability-aware tool filter that can be used after initialization
* This allows for dynamic tool filtering based on runtime capabilities
*/
function createCapabilityFilter(client) {
	let cachedCapabilities;
	let checker = new CapabilityChecker();
	return {
		updateCapabilities(capabilities) {
			cachedCapabilities = capabilities;
			checker.setCapabilities(capabilities);
			debug("Updated cached server capabilities");
		},
		filterTools(tools) {
			const currentCapabilities = client?.getServerCapabilities() || cachedCapabilities;
			if (currentCapabilities && currentCapabilities !== cachedCapabilities) {
				checker.setCapabilities(currentCapabilities);
				cachedCapabilities = currentCapabilities;
			}
			return filterToolsByCapabilities(tools, currentCapabilities);
		},
		isToolSupported(toolName) {
			const currentCapabilities = client?.getServerCapabilities() || cachedCapabilities;
			return isToolSupportedByCapabilities(toolName, currentCapabilities);
		},
		getChecker() {
			return checker;
		}
	};
}

//#endregion
//#region src/utils/nodeModulesUtils.ts
/**
* Get the path to a binary in node_modules/.bin/
* This is faster than using npx which has significant overhead
*
* @param binName - The name of the binary (e.g., "typescript-language-server")
* @param projectRoot - Optional project root to search from (defaults to cwd)
* @returns The full path to the binary, or null if not found
*/
function getNodeModulesBin(binName, projectRoot) {
	const isWindows = platform() === "win32";
	const executableName = isWindows ? `${binName}.cmd` : binName;
	let currentDir = projectRoot || process.cwd();
	while (true) {
		const binPath = join$1(currentDir, "node_modules", ".bin", executableName);
		if (existsSync$1(binPath)) return binPath;
		const parentDir = join$1(currentDir, "..");
		if (parentDir === currentDir) break;
		currentDir = parentDir;
	}
	const globalPrefixes = isWindows ? [process.env.APPDATA ? join$1(process.env.APPDATA, "npm") : null] : ["/usr/local", "/usr"];
	for (const prefix of globalPrefixes) if (prefix) {
		const globalBinPath = join$1(prefix, "lib", "node_modules", ".bin", executableName);
		if (existsSync$1(globalBinPath)) return globalBinPath;
	}
	return null;
}
/**
* Get the command and args for a node_modules binary
* Falls back to npx if the binary is not found locally
*
* @param binName - The name of the binary
* @param args - Additional arguments for the binary
* @param projectRoot - Optional project root to search from
* @returns Object with command and args
*/
function getNodeModulesCommand(binName, args = [], projectRoot) {
	const binPath = getNodeModulesBin(binName, projectRoot);
	if (binPath) return {
		command: binPath,
		args
	};
	try {
		const checkCommand = platform() === "win32" ? "where" : "which";
		execSync(`${checkCommand} ${binName}`, { stdio: "ignore" });
		return {
			command: binName,
			args
		};
	} catch {}
	return {
		command: "npx",
		args: [binName, ...args]
	};
}

//#endregion
//#region src/utils/packageVersion.ts
/**
* Major version of the package installed under `nodeModulesDir`, or undefined
* when it is not installed or its package.json cannot be read.
*/
function installedPackageMajor(nodeModulesDir, packageName) {
	try {
		const { version } = JSON.parse(readFileSync(join$1(nodeModulesDir, packageName, "package.json"), "utf-8"));
		const major = parseInt(String(version), 10);
		return Number.isNaN(major) ? void 0 : major;
	} catch {
		return void 0;
	}
}

//#endregion
//#region src/utils/binFinder.ts
/**
* Binary names and args for a node_modules item. The nearest installed copy
* of `override.package` decides once whether the override applies.
*/
function candidatesFor(nodeModulesDirs, item, defaultArgs) {
	const plain = {
		names: item.names,
		args: defaultArgs
	};
	const override = item.override;
	if (!override) return plain;
	for (const nodeModules of nodeModulesDirs) {
		const major = installedPackageMajor(nodeModules, override.package);
		if (major === void 0) continue;
		return major >= override.minMajor ? {
			names: override.names,
			args: override.args ?? defaultArgs
		} : plain;
	}
	return plain;
}
/** `dir` followed by each of its ancestors up to the filesystem root. */
function* selfAndAncestors(dir) {
	let current = dir;
	while (true) {
		yield current;
		const parent = dirname(current);
		if (parent === current) return;
		current = parent;
	}
}
/**
* Find a binary using the specified strategy
*
* Strategies are tried in the order specified in the configuration.
* Each strategy type has its own search logic.
*
* @param strategy The binary find strategy configuration
* @param projectRoot The project root directory
* @returns The resolved command and args, or null if not found
*/
function findBinary(strategy, projectRoot = process.cwd()) {
	mcpDebugWithPrefix("BinFinder", `Searching for binary with strategy:`, strategy);
	const defaultArgs = strategy.defaultArgs || [];
	for (const item of strategy.strategies) {
		mcpDebugWithPrefix("BinFinder", `Trying strategy: ${item.type}`);
		switch (item.type) {
			case "venv": {
				const venvDirs = item.venvDirs || [".venv", "venv"];
				for (const name of item.names) {
					for (const venvDir of venvDirs) {
						const venvBin = join$1(projectRoot, venvDir, "bin", name);
						if (existsSync$1(venvBin)) {
							mcpDebugWithPrefix("BinFinder", `Found in Python ${venvDir}: ${venvBin}`);
							return {
								command: venvBin,
								args: defaultArgs
							};
						}
					}
					let currentDir = projectRoot;
					let parentDir = dirname(currentDir);
					while (parentDir !== currentDir) {
						for (const venvDir of venvDirs) {
							const parentVenvBin = join$1(parentDir, venvDir, "bin", name);
							if (existsSync$1(parentVenvBin)) {
								mcpDebugWithPrefix("BinFinder", `Found in parent ${venvDir}: ${parentVenvBin}`);
								return {
									command: parentVenvBin,
									args: defaultArgs
								};
							}
						}
						currentDir = parentDir;
						parentDir = dirname(currentDir);
					}
				}
				break;
			}
			case "node_modules": {
				const nodeModulesDirs = [...selfAndAncestors(projectRoot)].map((dir) => join$1(dir, "node_modules"));
				const { names, args } = candidatesFor(nodeModulesDirs, item, defaultArgs);
				for (const nodeModules of nodeModulesDirs) for (const name of names) {
					const bin = join$1(nodeModules, ".bin", name);
					if (existsSync$1(bin)) {
						mcpDebugWithPrefix("BinFinder", `Found in node_modules: ${bin}`);
						return {
							command: bin,
							args
						};
					}
				}
				break;
			}
			case "global": {
				for (const name of item.names) try {
					const globalPath = execSync(`which ${name}`, {
						encoding: "utf-8",
						stdio: [
							"pipe",
							"pipe",
							"ignore"
						]
					}).trim();
					if (globalPath) {
						mcpDebugWithPrefix("BinFinder", `Found globally: ${globalPath}`);
						return {
							command: globalPath,
							args: defaultArgs
						};
					}
				} catch {}
				break;
			}
			case "uv": {
				try {
					execSync("which uv", {
						encoding: "utf-8",
						stdio: [
							"pipe",
							"pipe",
							"ignore"
						]
					});
					const uvLockPath = join$1(projectRoot, "uv.lock");
					const pyprojectPath = join$1(projectRoot, "pyproject.toml");
					if (existsSync$1(uvLockPath) || existsSync$1(pyprojectPath)) {
						mcpDebugWithPrefix("BinFinder", `Using uv run: ${item.command || item.tool}`);
						if (item.command) return {
							command: "uv",
							args: [
								"run",
								item.command,
								...defaultArgs
							]
						};
						else return {
							command: "uv",
							args: [
								"run",
								item.tool,
								...defaultArgs
							]
						};
					} else {
						mcpDebugWithPrefix("BinFinder", `Using uv tool run: ${item.tool}`);
						if (item.command) return {
							command: "uv",
							args: [
								"tool",
								"run",
								"--from",
								item.tool,
								item.command,
								...defaultArgs
							]
						};
						else return {
							command: "uv",
							args: [
								"tool",
								"run",
								item.tool,
								...defaultArgs
							]
						};
					}
				} catch {
					mcpDebugWithPrefix("BinFinder", `uv not found, skipping uv strategy`);
				}
				break;
			}
			case "npx": {
				mcpDebugWithPrefix("BinFinder", `Using npx: ${item.package}`);
				return {
					command: "npx",
					args: [
						"-y",
						item.package,
						...defaultArgs
					]
				};
			}
			case "path": {
				const expandedPath = item.path.replace(/^~/, process.env.HOME || process.env.USERPROFILE || "");
				if (existsSync$1(expandedPath)) {
					mcpDebugWithPrefix("BinFinder", `Found at path: ${expandedPath}`);
					return {
						command: expandedPath,
						args: defaultArgs
					};
				}
				break;
			}
		}
	}
	mcpDebugWithPrefix("BinFinder", `Binary not found with any strategy`);
	return null;
}
/**
* Resolve the command for an adapter, using binFindStrategy if available
*
* @param adapter The adapter configuration
* @param projectRoot The project root directory
* @returns The resolved command and args
*/
function resolveAdapterCommand$1(adapter, projectRoot) {
	if (adapter.bin && adapter.args && adapter.args.length > 0) {
		mcpDebugWithPrefix("BinFinder", `Using explicit bin/args: ${adapter.bin} ${adapter.args.join(" ")}`);
		return {
			command: adapter.bin,
			args: adapter.args
		};
	}
	if (adapter.binFindStrategy) {
		const found = findBinary(adapter.binFindStrategy, projectRoot);
		if (found) return found;
	}
	if (adapter.bin) {
		mcpDebugWithPrefix("BinFinder", `Using default bin: ${adapter.bin}`);
		return {
			command: adapter.bin,
			args: adapter.args || []
		};
	}
	throw new Error("No LSP server binary specified or found");
}

//#endregion
//#region src/presets/utils.ts
/**
* Resolve the LSP command for a client config, handling node_modules binaries
*/
function resolveAdapterCommand(adapter, projectRoot) {
	if (adapter.bin && !adapter.binFindStrategy) {
		debugLogWithPrefix("lsmcp", `Using explicit bin configuration: ${adapter.bin}`);
		return {
			command: adapter.bin,
			args: adapter.args || []
		};
	}
	if (adapter.binFindStrategy) return resolveAdapterCommand$1(adapter, projectRoot);
	const nodeModulesBinaries = [
		"typescript-language-server",
		"tsgo",
		"moonbit-lsp"
	];
	if (adapter.bin && nodeModulesBinaries.includes(adapter.bin)) {
		const resolved = getNodeModulesCommand(adapter.bin, adapter.args || [], projectRoot);
		if (!resolved.command.includes("npx") && process.env.DEBUG_LSP) debugLogWithPrefix("lsmcp", `Resolved ${adapter.bin} to: ${resolved.command}`);
		return resolved;
	}
	if (adapter.bin) return {
		command: adapter.bin,
		args: adapter.args || []
	};
	throw new Error("No LSP server binary specified or found");
}

//#endregion
//#region src/lspServerRunner.ts
async function runLanguageServerWithConfig(config, _positionals = [], customEnv) {
	debug$1(`[lsmcp] runLanguageServerWithConfig called with config: ${JSON.stringify(config)}`);
	if (config.binFindStrategy) debug$1(`[lsmcp] binFindStrategy found: ${JSON.stringify(config.binFindStrategy)}`);
	else debug$1(`[lsmcp] No binFindStrategy in config`);
	try {
		const projectRoot = process.cwd();
		if (!config.bin && !config.binFindStrategy) throw new Error(`Missing 'bin' field in configuration. Please specify a language server command or binFindStrategy.`);
		const resolved = resolveAdapterCommand({
			id: config.id || config.preset || "custom",
			name: config.name || config.preset || "Custom LSP",
			bin: config.bin,
			args: config.args || [],
			files: config.files || [],
			binFindStrategy: config.binFindStrategy
		}, projectRoot);
		const lspProcess = spawn(resolved.command, resolved.args, {
			cwd: projectRoot,
			env: {
				...process.env,
				...customEnv
			}
		});
		const serverChars = config.serverCharacteristics ? {
			documentOpenDelay: config.serverCharacteristics.documentOpenDelay ?? 100,
			operationTimeout: config.serverCharacteristics.operationTimeout ?? 3e4,
			supportsIncrementalSync: config.serverCharacteristics.supportsIncrementalSync,
			supportsPullDiagnostics: config.serverCharacteristics.supportsPullDiagnostics
		} : void 0;
		const { createAndInitializeLSPClient } = await import("./src-DHi6E6Kh.js");
		const lspClient = await createAndInitializeLSPClient(projectRoot, lspProcess, config.id || config.preset || "custom", config.initializationOptions, serverChars);
		const { NodeFileSystemApi } = await import("./NodeFileSystemApi-Cv425szp.js");
		const fileSystemApi = new NodeFileSystemApi();
		const mcpContext = {
			lspClient,
			fs: fileSystemApi,
			config: { ...config },
			languageId: config.preset || config.id || "custom"
		};
		const { createMcpServerManager } = await import("./mcpServerHelpers-BJDgSxCb.js");
		const server = createMcpServerManager({
			name: `lsmcp (${config.name})`,
			version: "0.1.0"
		});
		server.setContext(mcpContext);
		const capabilityFilter = createCapabilityFilter();
		const lspTools = createLSPTools(lspClient);
		let filteredLspTools = filterUnsupportedTools(lspTools, config.unsupported);
		filteredLspTools = capabilityFilter.filterTools(filteredLspTools);
		const serenityToolsConfig = {};
		if (config.languageFeatures) serenityToolsConfig.languageFeatures = config.languageFeatures;
		const memoryEnabled = config.experiments?.memory || config.memoryAdvanced;
		if (memoryEnabled) serenityToolsConfig.memoryAdvanced = memoryEnabled;
		const serenityTools = getSerenityToolsList(Object.keys(serenityToolsConfig).length > 0 ? serenityToolsConfig : void 0);
		const symbolDetailsTool = createGetSymbolDetailsTool(lspClient);
		const allTools = [
			...filteredLspTools,
			...highLevelTools,
			symbolDetailsTool,
			...serenityTools,
			...onboardingToolsList
		];
		server.registerTools(allTools);
		await server.start();
		debug$1(`lsmcp MCP server connected for: ${config.name}`);
		const fullCommand = resolved.args.length > 0 ? `${resolved.command} ${resolved.args.join(" ")}` : resolved.command;
		lspProcess.on("error", (error) => {
			const context = {
				operation: "LSP server process",
				language: config.id,
				details: { command: fullCommand }
			};
			errorLog(formatError(error, context));
			process.exit(1);
		});
		lspProcess.on("exit", (code) => {
			if (code !== 0) {
				errorLog(`LSP server exited with code ${code}`);
				process.exit(code || 1);
			}
		});
	} catch (error) {
		const context = {
			operation: "MCP server startup",
			language: config.id,
			details: { command: `${config.bin} ${config.args?.join(" ") || ""}` }
		};
		errorLog(formatError(error, context));
		process.exit(1);
	}
}

//#endregion
//#region src/utils/filePatternParser.ts
/**
* Parse file patterns string, handling both comma-separated patterns and brace expansion
*/
function parseFilePatterns(patternsString) {
	const patterns = [];
	const parts = splitByCommaOutsideBraces(patternsString);
	for (const part of parts) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		if (trimmed.includes("{") && trimmed.includes("}")) {
			const expanded = minimatch.braceExpand(trimmed);
			patterns.push(...expanded);
		} else patterns.push(trimmed);
	}
	return [...new Set(patterns)];
}
/**
* Split string by commas, but ignore commas inside braces
*/
function splitByCommaOutsideBraces(str) {
	const result = [];
	let current = "";
	let braceDepth = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str[i];
		if (char === "{") {
			braceDepth++;
			current += char;
		} else if (char === "}") {
			braceDepth--;
			current += char;
		} else if (char === "," && braceDepth === 0) {
			result.push(current);
			current = "";
		} else current += char;
	}
	if (current) result.push(current);
	return result;
}

//#endregion
//#region src/utils/projectDetector.ts
/**
* Detect project type based on project files
*/
async function detectProjectType(projectRoot) {
	if (!existsSync$1(projectRoot)) throw new LSMCPError(ErrorCode.FILE_NOT_FOUND, `Project root not found: ${projectRoot}`, { filePath: projectRoot }, ["Ensure the project root path is correct", "Use an absolute path to the project directory"]);
	const detected = [];
	const packageJsonPath = join$1(projectRoot, "package.json");
	const tsconfigPath = join$1(projectRoot, "tsconfig.json");
	if (existsSync$1(packageJsonPath)) try {
		const packageContent = await readFile(packageJsonPath, "utf-8");
		const packageJson = JSON.parse(packageContent);
		if (packageJson.devDependencies?.["@typescript/native-preview"] || packageJson.dependencies?.["@typescript/native-preview"]) detected.push({
			preset: "tsgo",
			reason: "Found @typescript/native-preview in package.json"
		});
		else if (existsSync$1(tsconfigPath)) detected.push({
			preset: "typescript",
			reason: "Found package.json and tsconfig.json"
		});
	} catch (error) {
		debug$1(`Failed to parse package.json: ${error}`);
	}
	if (existsSync$1(join$1(projectRoot, "deno.json")) || existsSync$1(join$1(projectRoot, "deno.jsonc"))) detected.push({
		preset: "deno",
		reason: "Found deno.json or deno.jsonc"
	});
	try {
		const files = readdirSync(projectRoot);
		const fsprojFile = files.find((file) => file.endsWith(".fsproj"));
		if (fsprojFile) detected.push({
			preset: "fsharp",
			reason: `Found ${fsprojFile}`
		});
	} catch (error) {
		debug$1(`Failed to read directory for F# detection: ${error}`);
	}
	if (existsSync$1(join$1(projectRoot, "moon.mod.json"))) detected.push({
		preset: "moonbit",
		reason: "Found moon.mod.json"
	});
	if (existsSync$1(join$1(projectRoot, "Cargo.toml"))) detected.push({
		preset: "rust-analyzer",
		reason: "Found Cargo.toml"
	});
	const pythonFiles = [
		"setup.py",
		"pyproject.toml",
		"requirements.txt",
		"Pipfile"
	];
	for (const file of pythonFiles) if (existsSync$1(join$1(projectRoot, file))) {
		detected.push({
			preset: "pyright",
			reason: `Found ${file}`
		});
		break;
	}
	if (existsSync$1(join$1(projectRoot, "go.mod"))) detected.push({
		preset: "gopls",
		reason: "Found go.mod"
	});
	return detected;
}
/**
* Generate boilerplate config for manual setup
*/
function generateManualConfigBoilerplate() {
	return `{
  "files": [
    "**/*.ts",
    "**/*.tsx",
    "**/*.js",
    "**/*.jsx"
  ],
  "settings": {
    "autoIndex": false,
    "indexConcurrency": 5,
    "autoIndexDelay": 500,
    "enableWatchers": true,
    "memoryLimit": 1024
  },
  "symbolFilter": {
    "excludeKinds": [
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
    "excludePatterns": [
      "callback",
      "temp",
      "tmp",
      "_",
      "^[a-z]$"
    ],
    "includeOnlyTopLevel": false
  },
  "ignorePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/.git/**"
  ],
  "adapter": {
    "id": "custom",
    "name": "Custom Language Server",
    "bin": "your-language-server",
    "args": ["--stdio"],
    "baseLanguage": "unknown",
    "description": "Configure your language server here"
  }
}`;
}

//#endregion
//#region src/cli/subcommands.ts
/**
* Initialize lsmcp project
*/
async function initCommand(projectRoot, preset, adapterRegistry$1, configLoader, autoIndex) {
	console.log("Initializing lsmcp project...");
	if (!preset && adapterRegistry$1) {
		console.log("\nDetecting project type...");
		const detected = await detectProjectType(projectRoot);
		if (detected.length === 0) {
			console.log("\n❌ Could not detect project type.");
			console.log("\nPlease specify a preset with -p option, or create a custom config.");
			console.log("\nAvailable presets:");
			adapterRegistry$1.list().slice(0, 5).forEach((adapter) => {
				const id = "presetId" in adapter ? adapter.presetId : adapter.id || "";
				const description = adapter.description || adapter.name || "";
				console.log(`  ${id.padEnd(20)} - ${description}`);
			});
			console.log("\nFor a complete list: lsmcp --list");
			console.log("\nAlternatively, we'll create a boilerplate config for manual setup.");
			const readline = await import("readline");
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout
			});
			const answer = await new Promise((resolve$2) => {
				rl.question("\nCreate boilerplate config? (y/N): ", resolve$2);
			});
			rl.close();
			if (answer.toLowerCase() !== "y") {
				console.log("\nInitialization cancelled.");
				process.exit(0);
			}
		} else if (detected.length === 1) {
			preset = detected[0].preset;
			console.log(`\n✓ Detected ${detected[0].preset} project: ${detected[0].reason}`);
			console.log(`  Using preset: ${preset}`);
		} else {
			console.log("\n⚠️  Multiple project types detected:");
			detected.forEach((d, i) => {
				console.log(`  ${i + 1}. ${d.preset.padEnd(15)} - ${d.reason}`);
			});
			const readline = await import("readline");
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout
			});
			const answer = await new Promise((resolve$2) => {
				rl.question(`\nSelect preset (1-${detected.length}) or press Enter for manual config: `, resolve$2);
			});
			rl.close();
			const selection = parseInt(answer);
			if (selection >= 1 && selection <= detected.length) {
				preset = detected[selection - 1].preset;
				console.log(`\nUsing preset: ${preset}`);
			} else console.log("\nCreating boilerplate config for manual setup...");
		}
	}
	const lsmcpDir = join$1(projectRoot, ".lsmcp");
	if (!existsSync$1(lsmcpDir)) {
		await mkdir(lsmcpDir, { recursive: true });
		console.log("✓ Created .lsmcp directory");
	}
	const gitignorePath = join$1(projectRoot, ".gitignore");
	let gitignoreContent = "";
	if (existsSync$1(gitignorePath)) gitignoreContent = await readFile(gitignorePath, "utf-8");
	if (!gitignoreContent.includes(".lsmcp/cache")) {
		await appendFile(gitignorePath, "\n# lsmcp cache\n.lsmcp/cache\n");
		console.log("✓ Updated .gitignore");
	}
	const configPath = join$1(lsmcpDir, "config.json");
	let configContent;
	if (preset && adapterRegistry$1) {
		const adapter = adapterRegistry$1.get(preset);
		if (!adapter) {
			errorLog(`❌ Unknown preset: ${preset}`);
			process.exit(1);
		}
		configContent = { preset };
		let indexPatterns;
		switch (preset) {
			case "pyright":
			case "ruff":
				indexPatterns = ["**/*.py"];
				break;
			case "rust-analyzer":
				indexPatterns = ["**/*.rs"];
				break;
			case "gopls":
				indexPatterns = ["**/*.go"];
				break;
			case "fsharp":
				indexPatterns = [
					"**/*.fs",
					"**/*.fsx",
					"**/*.fsi"
				];
				break;
			case "moonbit":
				indexPatterns = ["**/*.mbt"];
				break;
			default: break;
		}
		if (indexPatterns) configContent.indexFiles = indexPatterns;
	} else {
		const boilerplate = generateManualConfigBoilerplate();
		configContent = JSON.parse(boilerplate);
	}
	await writeFile(configPath, JSON.stringify(configContent, null, 2));
	console.log("✓ Created .lsmcp/config.json");
	const claudeMdPath = join$1(projectRoot, "CLAUDE.md");
	if (!existsSync$1(claudeMdPath)) console.log("\n⚠️  CLAUDE.md not found. Consider creating one with project-specific instructions.");
	else {
		const claudeContent = await readFile(claudeMdPath, "utf-8");
		if (!claudeContent.includes("professional coding agent")) {
			console.log("\nℹ️  Consider adding the following system prompt to the beginning of CLAUDE.md:");
			console.log("   (from src/prompts/system.ts)");
			console.log("\n   This helps AI agents understand how to use the semantic coding tools effectively.");
		}
	}
	console.log("\n✅ Initialization complete!");
	if (!preset || configContent.adapter?.id === "custom") {
		console.log("\n⚠️  Manual configuration required!");
		console.log("   Please edit .lsmcp/config.json to configure your language server:");
		console.log("   - Set 'bin' to your language server command");
		console.log("   - Adjust 'indexFiles' patterns for your language");
		console.log("   - Configure any necessary 'initializationOptions'");
		console.log("\nAfter configuration, run 'lsmcp index' to build the symbol index.");
	} else if (autoIndex) {
		console.log("\nBuilding symbol index...");
		await indexCommand(projectRoot, true, configLoader, adapterRegistry$1);
	} else console.log("\nTo build the symbol index, run: lsmcp index");
}
/**
* Index files based on config
* @param projectRoot - Root directory of the project
* @param isFromInit - Whether this is called from init command
* @param configLoader - Config loader instance
* @param adapterRegistry - Adapter registry instance
* @param forceFullIndex - Force full re-index instead of incremental
*/
async function indexCommand(projectRoot, isFromInit = false, configLoader, adapterRegistry$1, forceFullIndex = false) {
	const configPath = join$1(projectRoot, ".lsmcp", "config.json");
	if (!existsSync$1(configPath)) {
		errorLog("❌ .lsmcp/config.json not found. Run 'lsmcp init' first.");
		process.exit(1);
	}
	const mainConfigLoader = new ConfigLoader(projectRoot);
	let config;
	try {
		const result$1 = await mainConfigLoader.load({ configFile: ".lsmcp/config.json" });
		config = result$1.config;
	} catch (error) {
		errorLog("❌ Invalid config.json:", error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
	if (!config.files || config.files.length === 0) {
		errorLog("❌ No indexFiles patterns found in config.json");
		process.exit(1);
	}
	console.log("Indexing files...");
	console.log(`Patterns: ${config.files.join(", ")}`);
	const allFiles = [];
	for (const pattern of config.files) {
		const filesGen = await glob(pattern, { cwd: projectRoot });
		for await (const file of filesGen) allFiles.push(file);
	}
	const uniqueFiles = [...new Set(allFiles)];
	if (uniqueFiles.length === 0) {
		console.log("No files found matching the patterns.");
		if (!isFromInit) console.log("\nTip: Check your indexFiles patterns in .lsmcp/config.json");
		return;
	}
	console.log(`Found ${uniqueFiles.length} files to index`);
	let lspClient;
	let index;
	if (config.preset && configLoader && adapterRegistry$1) try {
		const presetConfig = adapterRegistry$1.get(config.preset);
		if (!presetConfig) throw new Error(`Unknown preset: ${config.preset}`);
		const adapterConfig = presetConfig;
		console.log(`Starting ${adapterConfig.name || adapterConfig.presetId} for indexing...`);
		const { command, args } = resolveAdapterCommand(adapterConfig, projectRoot);
		const { execSync: execSync$1 } = await import("child_process");
		try {
			execSync$1(`which ${command}`, { stdio: "ignore" });
		} catch {
			throw new Error(`Command not found: ${command}`);
		}
		const lspProcess = spawn(command, args, {
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			],
			cwd: projectRoot
		});
		lspProcess.on("error", (error) => {
			errorLog(`Failed to start ${command}: ${error.message}`);
			if (error.message.includes("ENOENT")) {
				errorLog(`Make sure ${adapterConfig.bin} is installed and in PATH`);
				if (adapterConfig.presetId === "tsgo") errorLog("Install with: npm install -g @typescript/native-preview");
				else if (adapterConfig.presetId === "typescript") errorLog("Install with: npm install -g typescript typescript-language-server");
				else if (adapterConfig.presetId === "rust-analyzer") errorLog("Install rust-analyzer from: https://rust-analyzer.github.io/");
			}
		});
		lspClient = createLSPClient({
			process: lspProcess,
			rootPath: projectRoot,
			languageId: adapterConfig.baseLanguage || adapterConfig.presetId,
			initializationOptions: adapterConfig.initializationOptions,
			serverCharacteristics: adapterConfig.serverCharacteristics
		});
		await lspClient?.start();
		const fileContentProvider = async (uri) => {
			const path$1 = fileURLToPath(uri);
			return await readFile(path$1, "utf-8");
		};
		const symbolProvider = lspClient ? createLSPSymbolProvider(lspClient, fileContentProvider) : null;
		const fileSystem = new NodeFileSystem();
		const cache = new SQLiteCache(projectRoot);
		if (symbolProvider) {
			index = new SymbolIndex(projectRoot, symbolProvider, fileSystem, cache);
			await index.initialize();
		}
	} catch (error) {
		errorLog(`Failed to start LSP server: ${error instanceof Error ? error.message : String(error)}`);
		if (error instanceof Error && error.message.includes("Command not found")) {
			if (config.preset === "tsgo") {
				errorLog("\nTo install tsgo:");
				errorLog("  npm install -g @typescript/native-preview");
				errorLog("\nAlternatively, you can use a different preset:");
				errorLog("  lsmcp init -p typescript");
			} else if (config.preset === "typescript") {
				errorLog("\nTo install typescript-language-server:");
				errorLog("  npm install -g typescript typescript-language-server");
			} else if (config.preset === "rust-analyzer") {
				errorLog("\nTo install rust-analyzer:");
				errorLog("  Visit: https://rust-analyzer.github.io/");
			} else if (config.preset === "pyright") {
				errorLog("\nTo install pyright:");
				errorLog("  npm install -g pyright");
			} else if (config.preset === "gopls") {
				errorLog("\nTo install gopls:");
				errorLog("  go install golang.org/x/tools/gopls@latest");
			}
		}
		if (isFromInit) {
			console.log("\n⚠️  Symbol indexing skipped (LSP not available).");
			console.log("   You can run 'lsmcp index' later to build the index.");
			return;
		} else process.exit(1);
	}
	else {
		const maybeIndex = getOrCreateIndex(projectRoot, null);
		index = maybeIndex !== null ? maybeIndex : void 0;
	}
	if (!index) if (isFromInit) {
		console.log("\n⚠️  Symbol indexing skipped (LSP not available).");
		console.log("   You can run 'lsmcp index' later to build the index.");
		return;
	} else {
		errorLog("❌ Failed to create symbol index. Make sure LSP is available.");
		process.exit(1);
	}
	const startTime = Date.now();
	let result;
	try {
		await index.loadIndexFromCache();
		const stats = index.getStats();
		const hasExistingIndex = stats.totalFiles > 0;
		if (!forceFullIndex && hasExistingIndex) {
			console.log("Performing incremental update...");
			const incrementalResult = await index.updateIncremental({ batchSize: config.settings?.indexConcurrency || 5 });
			const updatedStats = index.getStats();
			result = {
				success: true,
				totalFiles: updatedStats.totalFiles,
				totalSymbols: updatedStats.totalSymbols,
				errors: incrementalResult.errors.map((err) => ({
					file: "incremental",
					error: err
				})),
				updated: incrementalResult.updated,
				removed: incrementalResult.removed,
				mode: "incremental"
			};
		} else if (!forceFullIndex) {
			const cache = new SQLiteCache(projectRoot);
			const cachedFiles = await cache.getAllFiles();
			if (cachedFiles.length > 0) {
				console.log(`Found ${cachedFiles.length} files in cache. Checking for changes...`);
				const filesToUpdate = [];
				const { statSync: statSync$1 } = await import("fs");
				for (const file of uniqueFiles) try {
					const absolutePath = join$1(projectRoot, file);
					const stats$1 = statSync$1(absolutePath);
					const cacheInfo = await cache.getFileInfo(absolutePath);
					if (!cacheInfo || stats$1.mtimeMs > cacheInfo.lastModified) filesToUpdate.push(file);
				} catch {
					filesToUpdate.push(file);
				}
				const currentFileSet = new Set(uniqueFiles.map((f) => join$1(projectRoot, f)));
				const removedFiles = cachedFiles.filter((f) => !currentFileSet.has(f));
				if (filesToUpdate.length > 0 || removedFiles.length > 0) {
					console.log(`Detected ${filesToUpdate.length} files to update, ${removedFiles.length} files to remove`);
					if (filesToUpdate.length > 0) await index.indexFiles(filesToUpdate, config.settings?.indexConcurrency || 5);
					for (const removedFile of removedFiles) {
						const relativePath = removedFile.startsWith(projectRoot) ? removedFile.slice(projectRoot.length + 1) : removedFile;
						index.removeFile(relativePath);
					}
					const updatedStats = index.getStats();
					result = {
						success: true,
						totalFiles: updatedStats.totalFiles,
						totalSymbols: updatedStats.totalSymbols,
						errors: [],
						updated: filesToUpdate,
						removed: removedFiles.map((f) => f.startsWith(projectRoot) ? f.slice(projectRoot.length + 1) : f),
						mode: "smart-incremental"
					};
				} else {
					console.log("No changes detected. Index is up to date.");
					const updatedStats = index.getStats();
					result = {
						success: true,
						totalFiles: updatedStats.totalFiles,
						totalSymbols: updatedStats.totalSymbols,
						errors: [],
						updated: [],
						removed: [],
						mode: "no-changes"
					};
				}
			} else {
				console.log("No existing cache found. Performing full index...");
				await index.indexFiles(uniqueFiles, config.settings?.indexConcurrency || 5);
				const stats$1 = index.getStats();
				result = {
					success: true,
					totalFiles: stats$1.totalFiles,
					totalSymbols: stats$1.totalSymbols,
					errors: [],
					mode: "full"
				};
			}
		} else {
			console.log("Performing full re-index (--full flag)...");
			await index.indexFiles(uniqueFiles, config.settings?.indexConcurrency || 5);
			const stats$1 = index.getStats();
			result = {
				success: true,
				totalFiles: stats$1.totalFiles,
				totalSymbols: stats$1.totalSymbols,
				errors: [],
				mode: "full"
			};
		}
	} catch (error) {
		result = {
			success: false,
			totalFiles: 0,
			totalSymbols: 0,
			errors: [{
				file: "index",
				error: error instanceof Error ? error.message : String(error)
			}]
		};
	}
	const duration = Date.now() - startTime;
	if (result.success) {
		if (result.mode === "incremental") {
			console.log(`\n✅ Incremental update complete in ${duration}ms`);
			if (result.updated && result.updated.length > 0) console.log(`   Updated files: ${result.updated.length}`);
			if (result.removed && result.removed.length > 0) console.log(`   Removed files: ${result.removed.length}`);
		} else if (result.mode === "smart-incremental") {
			console.log(`\n✅ Smart incremental update complete in ${duration}ms`);
			if (result.updated && result.updated.length > 0) console.log(`   Updated files: ${result.updated.length}`);
			if (result.removed && result.removed.length > 0) console.log(`   Removed files: ${result.removed.length}`);
		} else if (result.mode === "no-changes") console.log(`\n✅ Index is up to date (checked in ${duration}ms)`);
		else console.log(`\n✅ Full indexing complete in ${duration}ms`);
		console.log(`   Total files: ${result.totalFiles}`);
		console.log(`   Total symbols: ${result.totalSymbols}`);
		if (result.errors.length > 0) {
			console.log(`\n⚠️  ${result.errors.length} files had errors:`);
			result.errors.slice(0, 5).forEach((err) => {
				console.log(`   - ${err.file}: ${err.error}`);
			});
			if (result.errors.length > 5) console.log(`   ... and ${result.errors.length - 5} more`);
		}
	} else {
		errorLog("\n❌ Indexing failed");
		result.errors.forEach((err) => {
			errorLog(`   ${err.file}: ${err.error}`);
		});
	}
	if (lspClient) try {
		await lspClient.stop();
		console.log("\n✓ LSP server stopped");
	} catch (error) {
		errorLog(`Failed to stop LSP server: ${error instanceof Error ? error.message : String(error)}`);
	}
}

//#endregion
//#region src/cli/doctor.ts
/**
* Check if a command exists in PATH
*/
function commandExists(command) {
	try {
		execSync(`which ${command}`, { stdio: "ignore" });
		return true;
	} catch {
		try {
			execSync(`where ${command}`, { stdio: "ignore" });
			return true;
		} catch {
			try {
				execSync(`npx --no-install ${command} --version`, {
					stdio: "ignore",
					timeout: 2e3
				});
				return true;
			} catch {
				return false;
			}
		}
	}
}
/**
* Detect programming languages in the project
*/
async function detectLanguages(projectRoot) {
	const languages = [];
	if (existsSync$1(join$1(projectRoot, "package.json"))) {
		const packageJson = JSON.parse(await readFile(join$1(projectRoot, "package.json"), "utf-8"));
		if (packageJson.devDependencies?.typescript || packageJson.dependencies?.typescript) {
			languages.push({
				name: "TypeScript (tsgo - Recommended)",
				reason: "Fast native TypeScript server",
				files: ["**/*.ts", "**/*.tsx"],
				preset: "tsgo"
			});
			languages.push({
				name: "TypeScript (typescript-language-server)",
				reason: "Standard TypeScript language server",
				files: ["**/*.ts", "**/*.tsx"],
				preset: "typescript"
			});
		} else languages.push({
			name: "JavaScript",
			reason: "package.json found",
			files: ["**/*.js", "**/*.jsx"],
			preset: "typescript"
		});
	}
	if (existsSync$1(join$1(projectRoot, "pyproject.toml")) || existsSync$1(join$1(projectRoot, "requirements.txt")) || existsSync$1(join$1(projectRoot, "setup.py"))) {
		languages.push({
			name: "Python (Pyright)",
			reason: "Python project files found",
			files: ["**/*.py"],
			preset: "pyright"
		});
		languages.push({
			name: "Python (Ruff)",
			reason: "Alternative Python linter/formatter",
			files: ["**/*.py"],
			preset: "ruff"
		});
	}
	if (existsSync$1(join$1(projectRoot, "Cargo.toml"))) languages.push({
		name: "Rust",
		reason: "Cargo.toml found",
		files: ["**/*.rs"],
		preset: "rust-analyzer"
	});
	if (existsSync$1(join$1(projectRoot, "go.mod"))) languages.push({
		name: "Go",
		reason: "go.mod found",
		files: ["**/*.go"],
		preset: "gopls"
	});
	if (existsSync$1(join$1(projectRoot, "*.fsproj")) || existsSync$1(join$1(projectRoot, "paket.dependencies"))) languages.push({
		name: "F#",
		reason: "F# project files found",
		files: [
			"**/*.fs",
			"**/*.fsx",
			"**/*.fsi"
		],
		preset: "fsharp"
	});
	if (existsSync$1(join$1(projectRoot, "moon.mod.json"))) languages.push({
		name: "MoonBit",
		reason: "moon.mod.json found",
		files: ["**/*.mbt"],
		preset: "moonbit"
	});
	return languages;
}
/**
* Check available language servers
*/
async function checkAvailableServers(projectRoot, languages, adapterRegistry$1) {
	const servers = [];
	const checkedPresets = /* @__PURE__ */ new Set();
	for (const lang of languages) if (lang.preset && !checkedPresets.has(lang.preset)) {
		checkedPresets.add(lang.preset);
		const adapter = adapterRegistry$1.get(lang.preset);
		if (adapter) {
			let installed = false;
			let command;
			try {
				const resolved = resolveAdapterCommand(adapter, projectRoot);
				command = resolved.command;
				installed = true;
			} catch (error) {
				if (process.env.DEBUG) console.error(`Failed to resolve ${lang.preset}:`, error);
				if (adapter.bin) {
					command = adapter.bin;
					installed = commandExists(command);
				} else installed = false;
			}
			let serverName = adapter.name || lang.preset;
			if (lang.preset === "tsgo") serverName = "tsgo (Recommended - Fast native TypeScript)";
			else if (lang.preset === "typescript") serverName = "typescript-language-server";
			else if (lang.preset === "pyright") serverName = "Pyright";
			else if (lang.preset === "ruff") serverName = "Ruff LSP";
			const server = {
				preset: lang.preset,
				name: serverName,
				installed,
				command
			};
			switch (lang.preset) {
				case "typescript":
					server.installCommand = "npm install -g typescript typescript-language-server";
					break;
				case "tsgo":
					server.installCommand = "npm install -g @typescript/native-preview";
					break;
				case "pyright":
					server.installCommand = "npm install -g pyright";
					break;
				case "ruff":
					server.installCommand = "pip install ruff-lsp";
					break;
				case "rust-analyzer":
					server.installCommand = "rustup component add rust-analyzer";
					break;
				case "gopls":
					server.installCommand = "go install golang.org/x/tools/gopls@latest";
					break;
				case "fsharp":
					server.installCommand = "dotnet tool install -g fsautocomplete";
					break;
			}
			servers.push(server);
		}
	}
	return servers;
}
/**
* Generate MCP configurations
*/
function generateMcpConfigurations(servers) {
	const configurations = [];
	for (const server of servers) {
		if (!server.installed) continue;
		configurations.push({
			preset: server.preset,
			claudeCommand: `claude mcp add lsmcp npx -- -y @mizchi/lsmcp -p ${server.preset}`
		});
	}
	return configurations;
}
/**
* Run doctor command
*/
async function doctorCommand(projectRoot, options) {
	const adapterRegistry$1 = globalPresetRegistry;
	registerBuiltinAdapters(adapterRegistry$1);
	console.log("🔍 Analyzing project environment...\n");
	if (options?.preset) {
		const adapter = adapterRegistry$1.get(options.preset);
		if (!adapter) {
			console.error(`❌ Unknown preset: ${options.preset}`);
			process.exit(1);
		}
		let installed = false;
		let command;
		try {
			const resolved = resolveAdapterCommand(adapter, projectRoot);
			command = resolved.command;
			installed = true;
		} catch (error) {
			if (adapter.bin) {
				command = adapter.bin;
				installed = commandExists(command);
			} else installed = false;
		}
		const server = {
			preset: options.preset,
			name: adapter.name || options.preset,
			installed,
			command
		};
		switch (options.preset) {
			case "typescript":
				server.installCommand = "npm install -g typescript typescript-language-server";
				break;
			case "tsgo":
				server.installCommand = "npm install -g @typescript/native-preview";
				break;
			case "pyright":
				server.installCommand = "npm install -g pyright";
				break;
			case "rust-analyzer":
				server.installCommand = "rustup component add rust-analyzer";
				break;
			case "gopls":
				server.installCommand = "go install golang.org/x/tools/gopls@latest";
				break;
		}
		if (!installed) {
			console.log(`❌ ${server.name} is not installed\n`);
			if (server.installCommand) console.log(`To install:\n  ${server.installCommand}\n`);
			process.exit(1);
		}
		console.log(`✅ ${server.name} is installed\n`);
		console.log("📋 Setup Command:");
		console.log(`  claude mcp add lsmcp npx -- -y @mizchi/lsmcp -p ${options.preset}\n`);
		return;
	}
	const languages = await detectLanguages(projectRoot);
	if (languages.length === 0) {
		console.log("⚠️  No supported languages detected in this project.\n");
		console.log("Supported languages:");
		console.log("  - TypeScript/JavaScript");
		console.log("  - Python");
		console.log("  - Rust");
		console.log("  - Go");
		console.log("  - F#");
		console.log("  - MoonBit\n");
		return;
	}
	console.log("📦 Detected Languages:");
	for (const lang of languages) console.log(`  - ${lang.name}: ${lang.reason}`);
	console.log();
	const servers = await checkAvailableServers(projectRoot, languages, adapterRegistry$1);
	console.log("🔧 Language Servers:");
	for (const server of servers) {
		const status = server.installed ? "✅" : "❌";
		console.log(`  ${status} ${server.name} (${server.preset})`);
		if (!server.installed && server.installCommand) console.log(`      Install: ${server.installCommand}`);
	}
	console.log();
	const configurations = generateMcpConfigurations(servers);
	if (configurations.length === 0) {
		console.log("⚠️  No language servers are installed. Install them first:\n");
		for (const server of servers) if (!server.installed && server.installCommand) console.log(`  ${server.installCommand}`);
		return;
	}
	console.log("📋 Setup Commands:\n");
	for (const config of configurations) {
		const server = servers.find((s) => s.preset === config.preset);
		console.log(`  # ${server?.name}`);
		console.log(`  ${config.claudeCommand}\n`);
	}
	console.log();
	if (options?.json) {
		const result = {
			projectRoot,
			detectedLanguages: languages,
			availableServers: servers,
			mcpConfigurations: configurations,
			claudeCodeCommands: configurations.map((c) => c.claudeCommand)
		};
		console.log("\n📊 JSON Output:");
		console.log(JSON.stringify(result, null, 2));
	}
}

//#endregion
//#region src/cli/lsmcp.ts
const adapterRegistry = globalPresetRegistry;
const lspConfigLoader = new ConfigLoader(process.cwd());
registerBuiltinAdapters(adapterRegistry);
const { values, positionals } = parseArgs({
	options: {
		preset: {
			type: "string",
			short: "p",
			description: "Language adapter to use (typescript-language-server, tsgo, deno, pyright, etc.)"
		},
		config: {
			type: "string",
			description: "Path to JSON configuration file for custom language definition"
		},
		bin: {
			type: "string",
			description: "Custom LSP server command (e.g., \"deno lsp\", \"rust-analyzer\")"
		},
		files: {
			type: "string",
			description: "File patterns for custom LSP (required with --bin, e.g., \"**/*.rs\")"
		},
		include: {
			type: "string",
			description: "Glob pattern for files to get diagnostics (e.g., \"src/**/*.ts\")"
		},
		initializationOptions: {
			type: "string",
			description: "JSON string for LSP initialization options (e.g., '{}', '[object Object]')"
		},
		help: {
			type: "boolean",
			short: "h",
			description: "Show help message"
		},
		list: {
			type: "boolean",
			description: "List supported languages and presets"
		},
		"list-tools": {
			type: "boolean",
			description: "List available MCP tools for the current configuration"
		},
		disable: {
			type: "string",
			description: "Comma-separated list of tools to disable"
		},
		"auto-index": {
			type: "boolean",
			description: "Automatically build symbol index after init"
		},
		full: {
			type: "boolean",
			description: "Force full re-index instead of incremental update (for 'index' command)"
		}
	},
	allowPositionals: true
});
async function main() {
	debug$1(`[lsmcp] main() called with values: ${JSON.stringify(values)}, positionals: ${JSON.stringify(positionals)}`);
	const subcommand = positionals[0];
	if (subcommand === "init") {
		await initCommand(process.cwd(), values.preset, adapterRegistry, lspConfigLoader, values["auto-index"]);
		process.exit(0);
	}
	if (subcommand === "index") {
		await indexCommand(process.cwd(), false, lspConfigLoader, adapterRegistry, values.full);
		process.exit(0);
	}
	if (subcommand === "doctor") {
		await doctorCommand(process.cwd(), {
			preset: values.preset,
			json: values.list
		});
		process.exit(0);
	}
	if (!values.preset && !values.config && !values.bin && !values.help && !values.list && positionals.length === 0) {
		const configPath = join(process.cwd(), ".lsmcp", "config.json");
		if (!existsSync(configPath)) {
			debug$1("[lsmcp] No config found, attempting auto-detection");
			const detected = await detectProjectType(process.cwd());
			if (detected.length === 1) {
				debug$1(`[lsmcp] Auto-detected ${detected[0].preset}: ${detected[0].reason}`);
				values.preset = detected[0].preset;
			} else if (detected.length === 0) {
				showNoArgsHelp(adapterRegistry);
				process.exit(0);
			} else {
				console.log("\n🌍 LSMCP - Language Service MCP\n");
				console.log("Multiple project types detected:");
				detected.forEach((d) => {
					console.log(`  • ${d.preset}: ${d.reason}`);
				});
				console.log("\nPlease specify which preset to use:");
				detected.forEach((d) => {
					console.log(`  lsmcp -p ${d.preset}`);
				});
				console.log("\nOr initialize with: lsmcp init");
				process.exit(0);
			}
		}
	}
	return await mainWithConfigLoader();
}
async function mainWithConfigLoader() {
	debug$1("[lsmcp] Using new configuration system");
	if (values.help) {
		showHelp();
		process.exit(0);
	}
	if (values.list) {
		showListWithConfigLoader(adapterRegistry);
		process.exit(0);
	}
	if (values["list-tools"]) {
		await listTools(values.preset, values.disable);
		process.exit(0);
	}
	try {
		const lspSources = {};
		const configPath = join(process.cwd(), ".lsmcp", "config.json");
		const hasConfigFile = existsSync(configPath);
		const hasExplicitConfig = values.preset || values.config || values.bin;
		if (!values.preset && !values.config && !values.bin && !hasConfigFile) {
			if (!values.files) {
				errorLog("Error: Either --preset, --config, --bin, or --files is required");
				errorLog("");
				errorLog("Options:");
				errorLog("  lsmcp --preset tsgo                    # Use a preset");
				errorLog("  lsmcp --files \"**/*.ts,**/*.tsx\"       # Specify file patterns (comma-separated)");
				errorLog("  lsmcp --bin \"deno lsp\" --files \"**/*.ts\"  # Custom LSP server");
				errorLog("");
				errorLog("Available presets:");
				const presets = globalPresetRegistry.list();
				presets.forEach((p) => {
					errorLog(`  - ${p.presetId}: ${p.name || p.presetId}`);
				});
				process.exit(1);
			}
		}
		if (hasConfigFile && !hasExplicitConfig) {
			debug$1("[lsmcp] Loading config from .lsmcp/config.json");
			lspSources.configFile = configPath;
		} else if (!hasConfigFile && !hasExplicitConfig && !values.files) {
			const { detectEnvironment, formatEnvironmentGuide } = await import("./environmentDetector-Dsb5zIaL.js");
			const detected = detectEnvironment(process.cwd());
			if (detected) {
				errorLog(formatEnvironmentGuide(detected));
				errorLog("");
				errorLog("Or run with explicit preset:");
				errorLog(`  lsmcp --preset ${detected.preset}`);
				errorLog("");
				process.exit(1);
			}
		}
		if (values.preset) lspSources.preset = values.preset;
		if (values.config) lspSources.configFile = values.config;
		if (values.bin) {
			if (!values.files) {
				errorLog("Error: --files is required when using --bin");
				errorLog("");
				errorLog("Example:");
				errorLog("  lsmcp --bin \"clangd\" --files \"**/*.{c,cpp,h,hpp}\"");
				errorLog("  lsmcp --bin \"rust-analyzer\" --files \"**/*.rs\"");
				errorLog("  lsmcp --bin \"gopls\" --files \"**/*.go\"");
				errorLog("");
				errorLog("The --files pattern specifies which files the LSP server should handle.");
				process.exit(1);
			}
			const parts = values.bin.split(" ");
			const customPreset = {
				presetId: "custom",
				bin: parts[0],
				args: parts.slice(1),
				files: parseFilePatterns(values.files)
			};
			globalPresetRegistry.register(customPreset);
			lspSources.preset = "custom";
		}
		if (values.files && !values.preset && !values.bin) {
			if (!lspSources.config) lspSources.config = {};
			lspSources.config.files = parseFilePatterns(values.files);
		}
		if (values.initializationOptions) try {
			const parsedOptions = JSON.parse(values.initializationOptions);
			if (!lspSources.config) lspSources.config = { initializationOptions: parsedOptions };
			else lspSources.config.initializationOptions = parsedOptions;
		} catch (error) {
			errorLog(`Error parsing initializationOptions JSON: ${error instanceof Error ? error.message : String(error)}`);
			process.exit(1);
		}
		const result = await lspConfigLoader.load(lspSources);
		const config = result.config;
		debug$1(`[lsmcp] ===== Final Configuration =====`);
		debug$1(`[lsmcp] Adapter ID: ${config.id || config.preset}`);
		debug$1(`[lsmcp] Name: ${config.name || config.preset}`);
		debug$1(`[lsmcp] Command: ${config.bin || "N/A"}`);
		debug$1(`[lsmcp] Arguments: ${JSON.stringify(config.args || [])}`);
		if (config.baseLanguage) debug$1(`[lsmcp] Base Language: ${config.baseLanguage}`);
		if (config.description) debug$1(`[lsmcp] Description: ${config.description}`);
		if (config.unsupported && config.unsupported.length > 0) debug$1(`[lsmcp] Unsupported features: ${config.unsupported.join(", ")}`);
		if (config.initializationOptions) debug$1(`[lsmcp] Initialization Options: ${JSON.stringify(config.initializationOptions, null, 2)}`);
		debug$1(`[lsmcp] ================================`);
		await runLanguageServerWithConfig(config, positionals);
	} catch (error) {
		errorLog(`Configuration error: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}
/**
* List available MCP tools based on configuration
*/
async function listTools(presetName, disableList) {
	console.log("\n🛠️  Available MCP Tools\n");
	const disabledTools = disableList ? disableList.split(",").map((t) => t.trim()) : [];
	try {
		let config = null;
		if (!presetName) {
			const configPath = join(process.cwd(), ".lsmcp", "config.json");
			if (existsSync(configPath)) {
				const result = await lspConfigLoader.load({ configFile: configPath });
				config = result.config;
				console.log(`Loading tools from: ${configPath}\n`);
			} else {
				console.log("No preset specified. Showing all available tools.\n");
				console.log("To see preset-specific tools, use: lsmcp --list-tools -p <preset>\n");
			}
		} else {
			const result = await lspConfigLoader.load({ preset: presetName });
			config = result.config;
			console.log(`Preset: ${presetName}\n`);
		}
		const { getAllAvailableTools } = await import("./getAllTools-C4VCV4fs.js");
		const { filterUnsupportedTools: filterUnsupportedTools$1 } = await import("./toolFilters-DnaKbFIC.js");
		const allTools = await getAllAvailableTools(config);
		let filteredTools = allTools;
		if (config?.disable && config.disable.length > 0) {
			filteredTools = filterUnsupportedTools$1(filteredTools, config.disable);
			console.log(`Preset disabled tools: ${config.disable.join(", ")}\n`);
		}
		if (disabledTools.length > 0) {
			filteredTools = filterUnsupportedTools$1(filteredTools, disabledTools);
			console.log(`User disabled tools: ${disabledTools.join(", ")}\n`);
		}
		if (presetName && config) try {
			const { getCapabilitiesForPreset } = await import("./capabilityChecker-Czy_SAiM.js");
			const capabilities = await getCapabilitiesForPreset(config);
			if (capabilities) {
				const { filterToolsByCapabilities: filterToolsByCapabilities$1 } = await import("./toolFilters-DnaKbFIC.js");
				const beforeCount = filteredTools.length;
				filteredTools = filterToolsByCapabilities$1(filteredTools, capabilities);
				const removedCount = beforeCount - filteredTools.length;
				if (removedCount > 0) console.log(`Filtered ${removedCount} tools based on LSP capabilities\n`);
			}
		} catch (error) {
			debug$1(`Failed to get capabilities: ${error}`);
		}
		const categoryOrder = [
			"Project Overview",
			"Memory System",
			"Symbol Search & Indexing",
			"File System",
			"Code Editing",
			"LSP: Code Navigation",
			"LSP: Diagnostics",
			"LSP: Code Actions",
			"LSP: Code Intelligence",
			"LSP: Capabilities",
			"Other"
		];
		const categories = {};
		for (const cat of categoryOrder) categories[cat] = [];
		for (const tool of filteredTools) {
			const name = tool.name;
			if (name.includes("project_overview")) categories["Project Overview"].push(tool);
			else if (name.includes("memory") || name === "index_onboarding") categories["Memory System"].push(tool);
			else if (name === "search_symbols" || name.includes("index_symbols") || name.includes("clear_index") || name.includes("search_symbol") || name.includes("get_symbols_overview") || name.includes("find_file") || name === "index_files" || name === "query_symbols") categories["Symbol Search & Indexing"].push(tool);
			else if (name === "list_dir") categories["File System"].push(tool);
			else if (name === "replace_range" || name === "replace_regex" || name.includes("replace") && !name.includes("lsp") || name.includes("insert") && !name.includes("lsp")) categories["Code Editing"].push(tool);
			else if (name.includes("lsp_find_references") || name.includes("lsp_get_definitions") || name.includes("lsp_get_hover") || name.includes("lsp_get_document_symbols") || name.includes("lsp_get_workspace_symbols")) categories["LSP: Code Navigation"].push(tool);
			else if (name.includes("lsp_get_diagnostics")) categories["LSP: Diagnostics"].push(tool);
			else if (name.includes("lsp_rename") || name.includes("lsp_delete") || name.includes("lsp_format") || name.includes("lsp_get_code_actions")) categories["LSP: Code Actions"].push(tool);
			else if (name.includes("lsp_get_completion") || name.includes("lsp_get_signature")) categories["LSP: Code Intelligence"].push(tool);
			else if (name === "lsp_check_capabilities") categories["LSP: Capabilities"].push(tool);
			else categories["Other"].push(tool);
		}
		let totalTools = 0;
		for (const category of categoryOrder) {
			const tools = categories[category];
			if (!tools || tools.length === 0) continue;
			console.log(`${category}:`);
			for (const tool of tools) {
				const description = tool.description ? tool.description.split("\n")[0].substring(0, 70) + (tool.description.length > 70 ? "..." : "") : "";
				console.log(`  • ${tool.name}`);
				if (description) console.log(`    ${description}`);
			}
			console.log();
			totalTools += tools.length;
		}
		console.log(`Total: ${totalTools} tools available`);
		const disabledCount = allTools.length - filteredTools.length;
		if (disabledCount > 0) console.log(`(${disabledCount} tools disabled or filtered)\n`);
	} catch (error) {
		errorLog(`Error listing tools: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}
main().catch((error) => {
	errorLog("Fatal error:", error);
	process.exit(1);
});

//#endregion