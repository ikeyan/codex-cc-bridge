import { errorLog } from "./debugLog-LfbHS9a2.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

//#region packages/code-indexer/src/config/configLoader.ts
/**
* Load index configuration from .lsmcp/config.json
* Returns IndexConfig with defaults merged
*/
function loadIndexConfig(rootPath) {
	const configPath = join(rootPath, ".lsmcp", "config.json");
	const defaultConfig = {
		files: [],
		settings: {
			indexConcurrency: 5,
			autoIndex: false,
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
		]
	};
	if (!existsSync(configPath)) return defaultConfig;
	try {
		const content = readFileSync(configPath, "utf-8");
		const userConfig = JSON.parse(content);
		return {
			files: userConfig.files ?? defaultConfig.files,
			settings: {
				...defaultConfig.settings,
				...userConfig.settings
			},
			symbolFilter: {
				...defaultConfig.symbolFilter,
				...userConfig.symbolFilter
			},
			ignorePatterns: userConfig.ignorePatterns ?? defaultConfig.ignorePatterns
		};
	} catch (error) {
		errorLog(`[loadIndexConfig] Failed to load config from ${configPath}:`, error);
		return defaultConfig;
	}
}

//#endregion
export { loadIndexConfig };