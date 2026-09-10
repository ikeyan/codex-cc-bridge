import { __commonJS, __require, __toESM } from "./chunk-BLXvPPr8.js";
import { errorLog } from "./debugLog-LfbHS9a2.js";
import * as fs from "fs";
import { appendFileSync, existsSync as existsSync$1, mkdirSync as mkdirSync$1 } from "fs";
import * as path$3 from "path";
import * as path$2 from "path";
import path, { join, relative } from "path";
import { z } from "zod";
import { spawn } from "child_process";
import { EventEmitter } from "events";
import { pathToFileURL } from "url";

//#region src/domain/errors/index.ts
/**
* Unified error system for LSMCP
*/
/**
* Error codes for categorizing errors
*/
let ErrorCode = /* @__PURE__ */ function(ErrorCode$1) {
	ErrorCode$1["FILE_NOT_FOUND"] = "FILE_NOT_FOUND";
	ErrorCode$1["FILE_READ_ERROR"] = "FILE_READ_ERROR";
	ErrorCode$1["FILE_WRITE_ERROR"] = "FILE_WRITE_ERROR";
	ErrorCode$1["PERMISSION_DENIED"] = "PERMISSION_DENIED";
	ErrorCode$1["LSP_NOT_RUNNING"] = "LSP_NOT_RUNNING";
	ErrorCode$1["LSP_START_ERROR"] = "LSP_START_ERROR";
	ErrorCode$1["LSP_TIMEOUT"] = "LSP_TIMEOUT";
	ErrorCode$1["LSP_COMMUNICATION_ERROR"] = "LSP_COMMUNICATION_ERROR";
	ErrorCode$1["LSP_NOT_SUPPORTED"] = "LSP_NOT_SUPPORTED";
	ErrorCode$1["SYMBOL_NOT_FOUND"] = "SYMBOL_NOT_FOUND";
	ErrorCode$1["LINE_NOT_FOUND"] = "LINE_NOT_FOUND";
	ErrorCode$1["INVALID_LINE_NUMBER"] = "INVALID_LINE_NUMBER";
	ErrorCode$1["INVALID_POSITION"] = "INVALID_POSITION";
	ErrorCode$1["TOOL_NOT_FOUND"] = "TOOL_NOT_FOUND";
	ErrorCode$1["PARAMETER_REQUIRED"] = "PARAMETER_REQUIRED";
	ErrorCode$1["INVALID_PARAMETER"] = "INVALID_PARAMETER";
	ErrorCode$1["RESPONSE_TOO_LARGE"] = "RESPONSE_TOO_LARGE";
	ErrorCode$1["NO_RESULTS"] = "NO_RESULTS";
	ErrorCode$1["PROJECT_CONFIG_ERROR"] = "PROJECT_CONFIG_ERROR";
	ErrorCode$1["NO_TSCONFIG"] = "NO_TSCONFIG";
	ErrorCode$1["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
	ErrorCode$1["OPERATION_FAILED"] = "OPERATION_FAILED";
	return ErrorCode$1;
}({});
/**
* Unified error class for LSMCP
*/
var LSMCPError = class extends Error {
	constructor(code, message, context, suggestions, relatedTools) {
		super(message);
		this.code = code;
		this.context = context;
		this.suggestions = suggestions;
		this.relatedTools = relatedTools;
		this.name = "LSMCPError";
	}
	/**
	* Format the error for user display
	*/
	format() {
		let result = `❌ Error: ${this.message}`;
		result += `\n   Code: ${this.code}`;
		if (this.context) {
			if (this.context.filePath) result += `\n   File: ${this.context.filePath}`;
			if (this.context.line !== void 0) result += `\n   Line: ${this.context.line}`;
			if (this.context.symbolName) result += `\n   Symbol: ${this.context.symbolName}`;
		}
		if (this.suggestions && this.suggestions.length > 0) {
			result += "\n\n💡 Suggestions:";
			this.suggestions.forEach((suggestion) => {
				result += `\n   • ${suggestion}`;
			});
		}
		if (this.relatedTools && this.relatedTools.length > 0) {
			result += "\n\n🔧 Alternative tools you can try:";
			this.relatedTools.forEach((tool) => {
				result += `\n   • ${tool}`;
			});
		}
		if (process.env.DEBUG && this.stack) {
			result += "\n\n🐛 Debug info:";
			result += `\n${this.stack}`;
		}
		return result;
	}
	/**
	* Convert to plain string
	*/
	toString() {
		return this.format();
	}
	/**
	* Check if error is of specific type
	*/
	is(code) {
		return this.code === code;
	}
};
/**
* Error factory functions for common scenarios
*/
/**
* Type guard to check if a code is valid ErrorCode
*/
function isErrorCode(code) {
	return Object.values(ErrorCode).includes(code);
}
const errors = {
	fileNotFound: (filePath, context) => new LSMCPError(ErrorCode.FILE_NOT_FOUND, `File not found: ${filePath}`, {
		...context,
		filePath
	}, [
		"Check if the file path is correct and relative to the root directory",
		"Use forward slashes (/) for path separators",
		"Make sure the file exists in the project"
	]),
	fileRead: (filePath, error$2, context) => new LSMCPError(ErrorCode.FILE_READ_ERROR, `Failed to read file ${filePath}: ${error$2}`, {
		...context,
		filePath
	}, [
		"Check if the file exists and is readable",
		"Verify file permissions",
		"Ensure the file is not corrupted"
	]),
	fileWrite: (filePath, error$2, context) => new LSMCPError(ErrorCode.FILE_WRITE_ERROR, `Failed to write file ${filePath}: ${error$2}`, {
		...context,
		filePath
	}, [
		"Check if the directory exists and is writable",
		"Verify file permissions",
		"Ensure there is enough disk space"
	]),
	filePermission: (filePath, context) => new LSMCPError(ErrorCode.PERMISSION_DENIED, `Permission denied: ${filePath}`, {
		...context,
		filePath
	}, [
		"Check file permissions",
		"Ensure you have read/write access to the file",
		"Try running with appropriate permissions"
	]),
	symbolNotFound: (symbol, line, context) => new LSMCPError(ErrorCode.SYMBOL_NOT_FOUND, `Symbol "${symbol}" not found${line ? ` on line ${line}` : ""}`, {
		...context,
		symbolName: symbol,
		line
	}, [
		"Check if the symbol name is spelled correctly",
		"The symbol might be on a different line",
		"Use find_references to search for the symbol across the entire file"
	], ["find_references", "get_workspace_symbols"]),
	lineNotFound: (line, filePath, context) => new LSMCPError(ErrorCode.LINE_NOT_FOUND, typeof line === "string" ? `Line containing "${line}" not found in ${filePath}` : `Line ${line} not found in ${filePath}`, {
		...context,
		line,
		filePath
	}, [
		"Check if the line number is correct (1-based)",
		"For string search, ensure the text exists in the file",
		"Use get_document_symbols to see the file structure"
	]),
	lspNotRunning: (language = "unknown", context) => new LSMCPError(ErrorCode.LSP_NOT_RUNNING, `LSP server for ${language} is not running or not initialized`, {
		...context,
		language
	}, [
		`Make sure the ${language} language server is installed`,
		"Check if the LSP server process is running",
		"Try restarting the MCP server"
	], getAlternativeTools(language)),
	lspStartError: (language, error$2, context) => new LSMCPError(ErrorCode.LSP_START_ERROR, `Failed to start ${language} language server: ${error$2}`, {
		...context,
		language
	}, [
		`Check if the ${language} language server is installed correctly`,
		"Try running the language server command manually to diagnose issues",
		`Install command: ${getLSPInstallCommand(language)}`
	]),
	responseTooLarge: (size, limit, context) => new LSMCPError(ErrorCode.RESPONSE_TOO_LARGE, `Response size (${size} tokens) exceeds limit (${limit} tokens)`, context, [
		"Use filters to reduce the response size",
		"Specify a more targeted search query",
		"Use pagination parameters if available",
		"Try searching in a specific directory instead of the whole project"
	]),
	parameterRequired: (param, description, context) => new LSMCPError(ErrorCode.PARAMETER_REQUIRED, `Required parameter missing: ${param}`, context, [
		description || `The ${param} parameter is required for this tool`,
		"Check the tool schema for required parameters",
		"Use list_tools to see tool descriptions"
	]),
	timeout: (operation, context) => new LSMCPError(ErrorCode.LSP_TIMEOUT, `Operation timed out: ${operation}`, {
		...context,
		operation
	}, [
		"Try again - the server might be busy",
		"If the problem persists, restart the language server",
		"Consider increasing the timeout value"
	]),
	noTsConfig: (context) => new LSMCPError(ErrorCode.NO_TSCONFIG, "TypeScript project configuration not found", context, [
		"Ensure tsconfig.json exists in the project root or a parent directory",
		"Run 'tsc --init' to create a default configuration",
		"Check if the project root is set correctly"
	]),
	operationNotSupported: (operation, language, context) => new LSMCPError(ErrorCode.LSP_NOT_SUPPORTED, `Operation "${operation}" is not supported for ${language}`, {
		...context,
		operation,
		language
	}, [
		`The ${language} language server does not support this feature`,
		"Check the language server documentation for supported features",
		"Try using alternative tools for similar functionality"
	], getAlternativeTools(language)),
	generic: (message, code, context) => {
		const errorCode = code && isErrorCode(code) ? code : ErrorCode.UNKNOWN_ERROR;
		return new LSMCPError(errorCode, message, context);
	}
};
/**
* Helper function to get LSP install command
*/
function getLSPInstallCommand(language) {
	const commands = {
		typescript: "npm install -g typescript typescript-language-server",
		javascript: "npm install -g typescript typescript-language-server",
		python: "pip install python-lsp-server[all]",
		rust: "rustup component add rust-analyzer",
		go: "go install golang.org/x/tools/gopls@latest",
		java: "Download from https://download.eclipse.org/jdtls/",
		"c++": "Install clangd from https://clangd.llvm.org/installation",
		c: "Install clangd from https://clangd.llvm.org/installation",
		ruby: "gem install solargraph",
		fsharp: "dotnet tool install --global fsautocomplete",
		moonbit: "moon update && moon install"
	};
	return commands[language.toLowerCase()] || `Check the documentation for ${language} language server installation`;
}
/**
* Get alternative tools for a language
*/
function getAlternativeTools(language) {
	if (language === "typescript" || language === "javascript") return ["Use non-LSP TypeScript tools if available", "Try generic text search tools"];
	return ["Use generic text search and navigation tools"];
}

//#endregion
//#region src/utils/mcpHelpers.ts
/**
* Debug logging for MCP servers.
*
* IMPORTANT: MCP servers communicate via stdio, so regular console.log output
* would interfere with the protocol. All debug/logging output MUST be sent
* to stderr using console.error instead.
*
* This function provides a convenient way to output debug messages that won't
* interfere with MCP communication.
*
* Debug output is only shown when LSMCP_DEBUG=1 environment variable is set.
*
* @example
* debug("Server started");
* debug("Processing request:", requestData);
*/
function debug$1(...args) {
	if (process.env.LSMCP_DEBUG === "1") console.error(...args);
}

//#endregion
//#region src/utils/errorHandler.ts
function formatError$1(error$2, context) {
	if (error$2 instanceof LSMCPError) return error$2.format();
	if (error$2 instanceof Error) {
		const lsmcpError = handleKnownError(error$2, context);
		if (lsmcpError) return lsmcpError.format();
		return errors.generic(error$2.message, ErrorCode.UNKNOWN_ERROR, context).format();
	}
	return String(error$2);
}
function handleKnownError(error$2, context) {
	const message = error$2.message.toLowerCase();
	if ((message.includes("command not found") || message.includes("enoent")) && !context?.filePath) {
		const language = context?.language || "unknown";
		return errors.lspStartError(language, "Command not found", context);
	}
	if (message.includes("lsp server exited") || message.includes("failed to start")) {
		const language = context?.language || "unknown";
		return errors.lspStartError(language, error$2.message, context);
	}
	if (message.includes("enoent") || message.includes("no such file") || message.includes("file not found")) {
		const filePath = context?.filePath || "unknown";
		return errors.fileNotFound(filePath, context);
	}
	if (message.includes("symbol not found") || message.includes("could not find symbol")) {
		const symbolName = context?.symbolName || "unknown";
		return errors.symbolNotFound(symbolName, context?.line, context);
	}
	if (message.includes("no tsconfig") || message.includes("typescript project")) return errors.noTsConfig(context);
	if (message.includes("not supported") || message.includes("not available")) {
		const language = context?.language || "unknown";
		const operation = context?.operation || "operation";
		return errors.operationNotSupported(operation, language, context);
	}
	if (message.includes("timeout") || message.includes("timed out")) return errors.timeout(context?.operation || "unknown", context);
	if (message.includes("permission denied") || message.includes("eacces")) {
		const filePath = context?.filePath || "unknown";
		return errors.filePermission(filePath, context);
	}
	return null;
}

//#endregion
//#region packages/lsp-client/src/utils/filesystem.ts
const nodeFileSystemApi = {
	async readFile(filePath) {
		return fs.promises.readFile(filePath, "utf-8");
	},
	async writeFile(filePath, data, encoding) {
		await fs.promises.mkdir(path$3.dirname(filePath), { recursive: true });
		await fs.promises.writeFile(filePath, data, encoding || "utf-8");
	},
	async readdir(path$4, options) {
		if (options?.withFileTypes) return fs.promises.readdir(path$4, options);
		return fs.promises.readdir(path$4);
	},
	async stat(path$4) {
		return fs.promises.stat(path$4);
	},
	async exists(filePath) {
		try {
			await fs.promises.access(filePath);
			return true;
		} catch {
			return false;
		}
	},
	async isDirectory(path$4) {
		try {
			const stats = await fs.promises.stat(path$4);
			return stats.isDirectory();
		} catch {
			return false;
		}
	},
	async listDirectory(path$4) {
		return fs.promises.readdir(path$4);
	},
	async lstat(path$4) {
		return fs.promises.lstat(path$4);
	},
	async mkdir(path$4, options) {
		return fs.promises.mkdir(path$4, options);
	},
	async rm(path$4, options) {
		await fs.promises.rm(path$4, options);
	},
	async realpath(path$4) {
		return fs.promises.realpath(path$4);
	},
	async cwd() {
		return process.cwd();
	},
	async resolve(...paths) {
		return path$3.resolve(...paths);
	}
};

//#endregion
//#region packages/lsp-client/src/core/state.ts
function createInitialState(config) {
	return {
		process: config.process,
		messageId: 0,
		responseHandlers: /* @__PURE__ */ new Map(),
		buffer: "",
		contentLength: -1,
		diagnostics: /* @__PURE__ */ new Map(),
		eventEmitter: new EventEmitter(),
		rootPath: config.rootPath,
		languageId: config.languageId || "plaintext",
		serverCharacteristics: config.serverCharacteristics,
		fileSystemApi: config.fileSystemApi || createDefaultFileSystemApi()
	};
}
function createDefaultFileSystemApi() {
	return nodeFileSystemApi;
}

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-types@3.17.5/node_modules/vscode-languageserver-types/lib/esm/main.js
var DocumentUri;
(function(DocumentUri$1) {
	function is$1(value) {
		return typeof value === "string";
	}
	DocumentUri$1.is = is$1;
})(DocumentUri || (DocumentUri = {}));
var URI;
(function(URI$1) {
	function is$1(value) {
		return typeof value === "string";
	}
	URI$1.is = is$1;
})(URI || (URI = {}));
var integer;
(function(integer$1) {
	integer$1.MIN_VALUE = -2147483648;
	integer$1.MAX_VALUE = 2147483647;
	function is$1(value) {
		return typeof value === "number" && integer$1.MIN_VALUE <= value && value <= integer$1.MAX_VALUE;
	}
	integer$1.is = is$1;
})(integer || (integer = {}));
var uinteger;
(function(uinteger$1) {
	uinteger$1.MIN_VALUE = 0;
	uinteger$1.MAX_VALUE = 2147483647;
	function is$1(value) {
		return typeof value === "number" && uinteger$1.MIN_VALUE <= value && value <= uinteger$1.MAX_VALUE;
	}
	uinteger$1.is = is$1;
})(uinteger || (uinteger = {}));
/**
* The Position namespace provides helper functions to work with
* {@link Position} literals.
*/
var Position;
(function(Position$1) {
	/**
	* Creates a new Position literal from the given line and character.
	* @param line The position's line.
	* @param character The position's character.
	*/
	function create(line, character) {
		if (line === Number.MAX_VALUE) line = uinteger.MAX_VALUE;
		if (character === Number.MAX_VALUE) character = uinteger.MAX_VALUE;
		return {
			line,
			character
		};
	}
	Position$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link Position} interface.
	*/
	function is$1(value) {
		let candidate = value;
		return Is$7.objectLiteral(candidate) && Is$7.uinteger(candidate.line) && Is$7.uinteger(candidate.character);
	}
	Position$1.is = is$1;
})(Position || (Position = {}));
/**
* The Range namespace provides helper functions to work with
* {@link Range} literals.
*/
var Range;
(function(Range$1) {
	function create(one, two, three, four) {
		if (Is$7.uinteger(one) && Is$7.uinteger(two) && Is$7.uinteger(three) && Is$7.uinteger(four)) return {
			start: Position.create(one, two),
			end: Position.create(three, four)
		};
		else if (Position.is(one) && Position.is(two)) return {
			start: one,
			end: two
		};
		else throw new Error(`Range#create called with invalid arguments[${one}, ${two}, ${three}, ${four}]`);
	}
	Range$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link Range} interface.
	*/
	function is$1(value) {
		let candidate = value;
		return Is$7.objectLiteral(candidate) && Position.is(candidate.start) && Position.is(candidate.end);
	}
	Range$1.is = is$1;
})(Range || (Range = {}));
/**
* The Location namespace provides helper functions to work with
* {@link Location} literals.
*/
var Location;
(function(Location$1) {
	/**
	* Creates a Location literal.
	* @param uri The location's uri.
	* @param range The location's range.
	*/
	function create(uri, range) {
		return {
			uri,
			range
		};
	}
	Location$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link Location} interface.
	*/
	function is$1(value) {
		let candidate = value;
		return Is$7.objectLiteral(candidate) && Range.is(candidate.range) && (Is$7.string(candidate.uri) || Is$7.undefined(candidate.uri));
	}
	Location$1.is = is$1;
})(Location || (Location = {}));
/**
* The LocationLink namespace provides helper functions to work with
* {@link LocationLink} literals.
*/
var LocationLink;
(function(LocationLink$1) {
	/**
	* Creates a LocationLink literal.
	* @param targetUri The definition's uri.
	* @param targetRange The full range of the definition.
	* @param targetSelectionRange The span of the symbol definition at the target.
	* @param originSelectionRange The span of the symbol being defined in the originating source file.
	*/
	function create(targetUri, targetRange, targetSelectionRange, originSelectionRange) {
		return {
			targetUri,
			targetRange,
			targetSelectionRange,
			originSelectionRange
		};
	}
	LocationLink$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link LocationLink} interface.
	*/
	function is$1(value) {
		let candidate = value;
		return Is$7.objectLiteral(candidate) && Range.is(candidate.targetRange) && Is$7.string(candidate.targetUri) && Range.is(candidate.targetSelectionRange) && (Range.is(candidate.originSelectionRange) || Is$7.undefined(candidate.originSelectionRange));
	}
	LocationLink$1.is = is$1;
})(LocationLink || (LocationLink = {}));
/**
* The Color namespace provides helper functions to work with
* {@link Color} literals.
*/
var Color;
(function(Color$1) {
	/**
	* Creates a new Color literal.
	*/
	function create(red, green, blue, alpha) {
		return {
			red,
			green,
			blue,
			alpha
		};
	}
	Color$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link Color} interface.
	*/
	function is$1(value) {
		const candidate = value;
		return Is$7.objectLiteral(candidate) && Is$7.numberRange(candidate.red, 0, 1) && Is$7.numberRange(candidate.green, 0, 1) && Is$7.numberRange(candidate.blue, 0, 1) && Is$7.numberRange(candidate.alpha, 0, 1);
	}
	Color$1.is = is$1;
})(Color || (Color = {}));
/**
* The ColorInformation namespace provides helper functions to work with
* {@link ColorInformation} literals.
*/
var ColorInformation;
(function(ColorInformation$1) {
	/**
	* Creates a new ColorInformation literal.
	*/
	function create(range, color) {
		return {
			range,
			color
		};
	}
	ColorInformation$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link ColorInformation} interface.
	*/
	function is$1(value) {
		const candidate = value;
		return Is$7.objectLiteral(candidate) && Range.is(candidate.range) && Color.is(candidate.color);
	}
	ColorInformation$1.is = is$1;
})(ColorInformation || (ColorInformation = {}));
/**
* The Color namespace provides helper functions to work with
* {@link ColorPresentation} literals.
*/
var ColorPresentation;
(function(ColorPresentation$1) {
	/**
	* Creates a new ColorInformation literal.
	*/
	function create(label, textEdit, additionalTextEdits) {
		return {
			label,
			textEdit,
			additionalTextEdits
		};
	}
	ColorPresentation$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link ColorInformation} interface.
	*/
	function is$1(value) {
		const candidate = value;
		return Is$7.objectLiteral(candidate) && Is$7.string(candidate.label) && (Is$7.undefined(candidate.textEdit) || TextEdit.is(candidate)) && (Is$7.undefined(candidate.additionalTextEdits) || Is$7.typedArray(candidate.additionalTextEdits, TextEdit.is));
	}
	ColorPresentation$1.is = is$1;
})(ColorPresentation || (ColorPresentation = {}));
/**
* A set of predefined range kinds.
*/
var FoldingRangeKind;
(function(FoldingRangeKind$1) {
	/**
	* Folding range for a comment
	*/
	FoldingRangeKind$1.Comment = "comment";
	/**
	* Folding range for an import or include
	*/
	FoldingRangeKind$1.Imports = "imports";
	/**
	* Folding range for a region (e.g. `#region`)
	*/
	FoldingRangeKind$1.Region = "region";
})(FoldingRangeKind || (FoldingRangeKind = {}));
/**
* The folding range namespace provides helper functions to work with
* {@link FoldingRange} literals.
*/
var FoldingRange;
(function(FoldingRange$1) {
	/**
	* Creates a new FoldingRange literal.
	*/
	function create(startLine, endLine, startCharacter, endCharacter, kind, collapsedText) {
		const result = {
			startLine,
			endLine
		};
		if (Is$7.defined(startCharacter)) result.startCharacter = startCharacter;
		if (Is$7.defined(endCharacter)) result.endCharacter = endCharacter;
		if (Is$7.defined(kind)) result.kind = kind;
		if (Is$7.defined(collapsedText)) result.collapsedText = collapsedText;
		return result;
	}
	FoldingRange$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link FoldingRange} interface.
	*/
	function is$1(value) {
		const candidate = value;
		return Is$7.objectLiteral(candidate) && Is$7.uinteger(candidate.startLine) && Is$7.uinteger(candidate.startLine) && (Is$7.undefined(candidate.startCharacter) || Is$7.uinteger(candidate.startCharacter)) && (Is$7.undefined(candidate.endCharacter) || Is$7.uinteger(candidate.endCharacter)) && (Is$7.undefined(candidate.kind) || Is$7.string(candidate.kind));
	}
	FoldingRange$1.is = is$1;
})(FoldingRange || (FoldingRange = {}));
/**
* The DiagnosticRelatedInformation namespace provides helper functions to work with
* {@link DiagnosticRelatedInformation} literals.
*/
var DiagnosticRelatedInformation;
(function(DiagnosticRelatedInformation$1) {
	/**
	* Creates a new DiagnosticRelatedInformation literal.
	*/
	function create(location, message) {
		return {
			location,
			message
		};
	}
	DiagnosticRelatedInformation$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link DiagnosticRelatedInformation} interface.
	*/
	function is$1(value) {
		let candidate = value;
		return Is$7.defined(candidate) && Location.is(candidate.location) && Is$7.string(candidate.message);
	}
	DiagnosticRelatedInformation$1.is = is$1;
})(DiagnosticRelatedInformation || (DiagnosticRelatedInformation = {}));
/**
* The diagnostic's severity.
*/
var DiagnosticSeverity$1;
(function(DiagnosticSeverity$2) {
	/**
	* Reports an error.
	*/
	DiagnosticSeverity$2.Error = 1;
	/**
	* Reports a warning.
	*/
	DiagnosticSeverity$2.Warning = 2;
	/**
	* Reports an information.
	*/
	DiagnosticSeverity$2.Information = 3;
	/**
	* Reports a hint.
	*/
	DiagnosticSeverity$2.Hint = 4;
})(DiagnosticSeverity$1 || (DiagnosticSeverity$1 = {}));
/**
* The diagnostic tags.
*
* @since 3.15.0
*/
var DiagnosticTag;
(function(DiagnosticTag$1) {
	/**
	* Unused or unnecessary code.
	*
	* Clients are allowed to render diagnostics with this tag faded out instead of having
	* an error squiggle.
	*/
	DiagnosticTag$1.Unnecessary = 1;
	/**
	* Deprecated or obsolete code.
	*
	* Clients are allowed to rendered diagnostics with this tag strike through.
	*/
	DiagnosticTag$1.Deprecated = 2;
})(DiagnosticTag || (DiagnosticTag = {}));
/**
* The CodeDescription namespace provides functions to deal with descriptions for diagnostic codes.
*
* @since 3.16.0
*/
var CodeDescription;
(function(CodeDescription$1) {
	function is$1(value) {
		const candidate = value;
		return Is$7.objectLiteral(candidate) && Is$7.string(candidate.href);
	}
	CodeDescription$1.is = is$1;
})(CodeDescription || (CodeDescription = {}));
/**
* The Diagnostic namespace provides helper functions to work with
* {@link Diagnostic} literals.
*/
var Diagnostic;
(function(Diagnostic$1) {
	/**
	* Creates a new Diagnostic literal.
	*/
	function create(range, message, severity, code, source, relatedInformation) {
		let result = {
			range,
			message
		};
		if (Is$7.defined(severity)) result.severity = severity;
		if (Is$7.defined(code)) result.code = code;
		if (Is$7.defined(source)) result.source = source;
		if (Is$7.defined(relatedInformation)) result.relatedInformation = relatedInformation;
		return result;
	}
	Diagnostic$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link Diagnostic} interface.
	*/
	function is$1(value) {
		var _a$1;
		let candidate = value;
		return Is$7.defined(candidate) && Range.is(candidate.range) && Is$7.string(candidate.message) && (Is$7.number(candidate.severity) || Is$7.undefined(candidate.severity)) && (Is$7.integer(candidate.code) || Is$7.string(candidate.code) || Is$7.undefined(candidate.code)) && (Is$7.undefined(candidate.codeDescription) || Is$7.string((_a$1 = candidate.codeDescription) === null || _a$1 === void 0 ? void 0 : _a$1.href)) && (Is$7.string(candidate.source) || Is$7.undefined(candidate.source)) && (Is$7.undefined(candidate.relatedInformation) || Is$7.typedArray(candidate.relatedInformation, DiagnosticRelatedInformation.is));
	}
	Diagnostic$1.is = is$1;
})(Diagnostic || (Diagnostic = {}));
/**
* The Command namespace provides helper functions to work with
* {@link Command} literals.
*/
var Command;
(function(Command$1) {
	/**
	* Creates a new Command literal.
	*/
	function create(title, command, ...args) {
		let result = {
			title,
			command
		};
		if (Is$7.defined(args) && args.length > 0) result.arguments = args;
		return result;
	}
	Command$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link Command} interface.
	*/
	function is$1(value) {
		let candidate = value;
		return Is$7.defined(candidate) && Is$7.string(candidate.title) && Is$7.string(candidate.command);
	}
	Command$1.is = is$1;
})(Command || (Command = {}));
/**
* The TextEdit namespace provides helper function to create replace,
* insert and delete edits more easily.
*/
var TextEdit;
(function(TextEdit$1) {
	/**
	* Creates a replace text edit.
	* @param range The range of text to be replaced.
	* @param newText The new text.
	*/
	function replace(range, newText) {
		return {
			range,
			newText
		};
	}
	TextEdit$1.replace = replace;
	/**
	* Creates an insert text edit.
	* @param position The position to insert the text at.
	* @param newText The text to be inserted.
	*/
	function insert(position, newText) {
		return {
			range: {
				start: position,
				end: position
			},
			newText
		};
	}
	TextEdit$1.insert = insert;
	/**
	* Creates a delete text edit.
	* @param range The range of text to be deleted.
	*/
	function del(range) {
		return {
			range,
			newText: ""
		};
	}
	TextEdit$1.del = del;
	function is$1(value) {
		const candidate = value;
		return Is$7.objectLiteral(candidate) && Is$7.string(candidate.newText) && Range.is(candidate.range);
	}
	TextEdit$1.is = is$1;
})(TextEdit || (TextEdit = {}));
var ChangeAnnotation;
(function(ChangeAnnotation$1) {
	function create(label, needsConfirmation, description) {
		const result = { label };
		if (needsConfirmation !== void 0) result.needsConfirmation = needsConfirmation;
		if (description !== void 0) result.description = description;
		return result;
	}
	ChangeAnnotation$1.create = create;
	function is$1(value) {
		const candidate = value;
		return Is$7.objectLiteral(candidate) && Is$7.string(candidate.label) && (Is$7.boolean(candidate.needsConfirmation) || candidate.needsConfirmation === void 0) && (Is$7.string(candidate.description) || candidate.description === void 0);
	}
	ChangeAnnotation$1.is = is$1;
})(ChangeAnnotation || (ChangeAnnotation = {}));
var ChangeAnnotationIdentifier;
(function(ChangeAnnotationIdentifier$1) {
	function is$1(value) {
		const candidate = value;
		return Is$7.string(candidate);
	}
	ChangeAnnotationIdentifier$1.is = is$1;
})(ChangeAnnotationIdentifier || (ChangeAnnotationIdentifier = {}));
var AnnotatedTextEdit;
(function(AnnotatedTextEdit$1) {
	/**
	* Creates an annotated replace text edit.
	*
	* @param range The range of text to be replaced.
	* @param newText The new text.
	* @param annotation The annotation.
	*/
	function replace(range, newText, annotation) {
		return {
			range,
			newText,
			annotationId: annotation
		};
	}
	AnnotatedTextEdit$1.replace = replace;
	/**
	* Creates an annotated insert text edit.
	*
	* @param position The position to insert the text at.
	* @param newText The text to be inserted.
	* @param annotation The annotation.
	*/
	function insert(position, newText, annotation) {
		return {
			range: {
				start: position,
				end: position
			},
			newText,
			annotationId: annotation
		};
	}
	AnnotatedTextEdit$1.insert = insert;
	/**
	* Creates an annotated delete text edit.
	*
	* @param range The range of text to be deleted.
	* @param annotation The annotation.
	*/
	function del(range, annotation) {
		return {
			range,
			newText: "",
			annotationId: annotation
		};
	}
	AnnotatedTextEdit$1.del = del;
	function is$1(value) {
		const candidate = value;
		return TextEdit.is(candidate) && (ChangeAnnotation.is(candidate.annotationId) || ChangeAnnotationIdentifier.is(candidate.annotationId));
	}
	AnnotatedTextEdit$1.is = is$1;
})(AnnotatedTextEdit || (AnnotatedTextEdit = {}));
/**
* The TextDocumentEdit namespace provides helper function to create
* an edit that manipulates a text document.
*/
var TextDocumentEdit;
(function(TextDocumentEdit$1) {
	/**
	* Creates a new `TextDocumentEdit`
	*/
	function create(textDocument, edits) {
		return {
			textDocument,
			edits
		};
	}
	TextDocumentEdit$1.create = create;
	function is$1(value) {
		let candidate = value;
		return Is$7.defined(candidate) && OptionalVersionedTextDocumentIdentifier.is(candidate.textDocument) && Array.isArray(candidate.edits);
	}
	TextDocumentEdit$1.is = is$1;
})(TextDocumentEdit || (TextDocumentEdit = {}));
var CreateFile;
(function(CreateFile$1) {
	function create(uri, options, annotation) {
		let result = {
			kind: "create",
			uri
		};
		if (options !== void 0 && (options.overwrite !== void 0 || options.ignoreIfExists !== void 0)) result.options = options;
		if (annotation !== void 0) result.annotationId = annotation;
		return result;
	}
	CreateFile$1.create = create;
	function is$1(value) {
		let candidate = value;
		return candidate && candidate.kind === "create" && Is$7.string(candidate.uri) && (candidate.options === void 0 || (candidate.options.overwrite === void 0 || Is$7.boolean(candidate.options.overwrite)) && (candidate.options.ignoreIfExists === void 0 || Is$7.boolean(candidate.options.ignoreIfExists))) && (candidate.annotationId === void 0 || ChangeAnnotationIdentifier.is(candidate.annotationId));
	}
	CreateFile$1.is = is$1;
})(CreateFile || (CreateFile = {}));
var RenameFile;
(function(RenameFile$1) {
	function create(oldUri, newUri, options, annotation) {
		let result = {
			kind: "rename",
			oldUri,
			newUri
		};
		if (options !== void 0 && (options.overwrite !== void 0 || options.ignoreIfExists !== void 0)) result.options = options;
		if (annotation !== void 0) result.annotationId = annotation;
		return result;
	}
	RenameFile$1.create = create;
	function is$1(value) {
		let candidate = value;
		return candidate && candidate.kind === "rename" && Is$7.string(candidate.oldUri) && Is$7.string(candidate.newUri) && (candidate.options === void 0 || (candidate.options.overwrite === void 0 || Is$7.boolean(candidate.options.overwrite)) && (candidate.options.ignoreIfExists === void 0 || Is$7.boolean(candidate.options.ignoreIfExists))) && (candidate.annotationId === void 0 || ChangeAnnotationIdentifier.is(candidate.annotationId));
	}
	RenameFile$1.is = is$1;
})(RenameFile || (RenameFile = {}));
var DeleteFile;
(function(DeleteFile$1) {
	function create(uri, options, annotation) {
		let result = {
			kind: "delete",
			uri
		};
		if (options !== void 0 && (options.recursive !== void 0 || options.ignoreIfNotExists !== void 0)) result.options = options;
		if (annotation !== void 0) result.annotationId = annotation;
		return result;
	}
	DeleteFile$1.create = create;
	function is$1(value) {
		let candidate = value;
		return candidate && candidate.kind === "delete" && Is$7.string(candidate.uri) && (candidate.options === void 0 || (candidate.options.recursive === void 0 || Is$7.boolean(candidate.options.recursive)) && (candidate.options.ignoreIfNotExists === void 0 || Is$7.boolean(candidate.options.ignoreIfNotExists))) && (candidate.annotationId === void 0 || ChangeAnnotationIdentifier.is(candidate.annotationId));
	}
	DeleteFile$1.is = is$1;
})(DeleteFile || (DeleteFile = {}));
var WorkspaceEdit;
(function(WorkspaceEdit$1) {
	function is$1(value) {
		let candidate = value;
		return candidate && (candidate.changes !== void 0 || candidate.documentChanges !== void 0) && (candidate.documentChanges === void 0 || candidate.documentChanges.every((change) => {
			if (Is$7.string(change.kind)) return CreateFile.is(change) || RenameFile.is(change) || DeleteFile.is(change);
			else return TextDocumentEdit.is(change);
		}));
	}
	WorkspaceEdit$1.is = is$1;
})(WorkspaceEdit || (WorkspaceEdit = {}));
/**
* The TextDocumentIdentifier namespace provides helper functions to work with
* {@link TextDocumentIdentifier} literals.
*/
var TextDocumentIdentifier;
(function(TextDocumentIdentifier$1) {
	/**
	* Creates a new TextDocumentIdentifier literal.
	* @param uri The document's uri.
	*/
	function create(uri) {
		return { uri };
	}
	TextDocumentIdentifier$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link TextDocumentIdentifier} interface.
	*/
	function is$1(value) {
		let candidate = value;
		return Is$7.defined(candidate) && Is$7.string(candidate.uri);
	}
	TextDocumentIdentifier$1.is = is$1;
})(TextDocumentIdentifier || (TextDocumentIdentifier = {}));
/**
* The VersionedTextDocumentIdentifier namespace provides helper functions to work with
* {@link VersionedTextDocumentIdentifier} literals.
*/
var VersionedTextDocumentIdentifier;
(function(VersionedTextDocumentIdentifier$1) {
	/**
	* Creates a new VersionedTextDocumentIdentifier literal.
	* @param uri The document's uri.
	* @param version The document's version.
	*/
	function create(uri, version) {
		return {
			uri,
			version
		};
	}
	VersionedTextDocumentIdentifier$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link VersionedTextDocumentIdentifier} interface.
	*/
	function is$1(value) {
		let candidate = value;
		return Is$7.defined(candidate) && Is$7.string(candidate.uri) && Is$7.integer(candidate.version);
	}
	VersionedTextDocumentIdentifier$1.is = is$1;
})(VersionedTextDocumentIdentifier || (VersionedTextDocumentIdentifier = {}));
/**
* The OptionalVersionedTextDocumentIdentifier namespace provides helper functions to work with
* {@link OptionalVersionedTextDocumentIdentifier} literals.
*/
var OptionalVersionedTextDocumentIdentifier;
(function(OptionalVersionedTextDocumentIdentifier$1) {
	/**
	* Creates a new OptionalVersionedTextDocumentIdentifier literal.
	* @param uri The document's uri.
	* @param version The document's version.
	*/
	function create(uri, version) {
		return {
			uri,
			version
		};
	}
	OptionalVersionedTextDocumentIdentifier$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link OptionalVersionedTextDocumentIdentifier} interface.
	*/
	function is$1(value) {
		let candidate = value;
		return Is$7.defined(candidate) && Is$7.string(candidate.uri) && (candidate.version === null || Is$7.integer(candidate.version));
	}
	OptionalVersionedTextDocumentIdentifier$1.is = is$1;
})(OptionalVersionedTextDocumentIdentifier || (OptionalVersionedTextDocumentIdentifier = {}));
/**
* The TextDocumentItem namespace provides helper functions to work with
* {@link TextDocumentItem} literals.
*/
var TextDocumentItem;
(function(TextDocumentItem$1) {
	/**
	* Creates a new TextDocumentItem literal.
	* @param uri The document's uri.
	* @param languageId The document's language identifier.
	* @param version The document's version number.
	* @param text The document's text.
	*/
	function create(uri, languageId, version, text) {
		return {
			uri,
			languageId,
			version,
			text
		};
	}
	TextDocumentItem$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link TextDocumentItem} interface.
	*/
	function is$1(value) {
		let candidate = value;
		return Is$7.defined(candidate) && Is$7.string(candidate.uri) && Is$7.string(candidate.languageId) && Is$7.integer(candidate.version) && Is$7.string(candidate.text);
	}
	TextDocumentItem$1.is = is$1;
})(TextDocumentItem || (TextDocumentItem = {}));
/**
* Describes the content type that a client supports in various
* result literals like `Hover`, `ParameterInfo` or `CompletionItem`.
*
* Please note that `MarkupKinds` must not start with a `$`. This kinds
* are reserved for internal usage.
*/
var MarkupKind$1;
(function(MarkupKind$2) {
	/**
	* Plain text is supported as a content format
	*/
	MarkupKind$2.PlainText = "plaintext";
	/**
	* Markdown is supported as a content format
	*/
	MarkupKind$2.Markdown = "markdown";
	/**
	* Checks whether the given value is a value of the {@link MarkupKind} type.
	*/
	function is$1(value) {
		const candidate = value;
		return candidate === MarkupKind$2.PlainText || candidate === MarkupKind$2.Markdown;
	}
	MarkupKind$2.is = is$1;
})(MarkupKind$1 || (MarkupKind$1 = {}));
var MarkupContent;
(function(MarkupContent$1) {
	/**
	* Checks whether the given value conforms to the {@link MarkupContent} interface.
	*/
	function is$1(value) {
		const candidate = value;
		return Is$7.objectLiteral(value) && MarkupKind$1.is(candidate.kind) && Is$7.string(candidate.value);
	}
	MarkupContent$1.is = is$1;
})(MarkupContent || (MarkupContent = {}));
/**
* The kind of a completion entry.
*/
var CompletionItemKind$1;
(function(CompletionItemKind$2) {
	CompletionItemKind$2.Text = 1;
	CompletionItemKind$2.Method = 2;
	CompletionItemKind$2.Function = 3;
	CompletionItemKind$2.Constructor = 4;
	CompletionItemKind$2.Field = 5;
	CompletionItemKind$2.Variable = 6;
	CompletionItemKind$2.Class = 7;
	CompletionItemKind$2.Interface = 8;
	CompletionItemKind$2.Module = 9;
	CompletionItemKind$2.Property = 10;
	CompletionItemKind$2.Unit = 11;
	CompletionItemKind$2.Value = 12;
	CompletionItemKind$2.Enum = 13;
	CompletionItemKind$2.Keyword = 14;
	CompletionItemKind$2.Snippet = 15;
	CompletionItemKind$2.Color = 16;
	CompletionItemKind$2.File = 17;
	CompletionItemKind$2.Reference = 18;
	CompletionItemKind$2.Folder = 19;
	CompletionItemKind$2.EnumMember = 20;
	CompletionItemKind$2.Constant = 21;
	CompletionItemKind$2.Struct = 22;
	CompletionItemKind$2.Event = 23;
	CompletionItemKind$2.Operator = 24;
	CompletionItemKind$2.TypeParameter = 25;
})(CompletionItemKind$1 || (CompletionItemKind$1 = {}));
/**
* Defines whether the insert text in a completion item should be interpreted as
* plain text or a snippet.
*/
var InsertTextFormat;
(function(InsertTextFormat$1) {
	/**
	* The primary text to be inserted is treated as a plain string.
	*/
	InsertTextFormat$1.PlainText = 1;
	/**
	* The primary text to be inserted is treated as a snippet.
	*
	* A snippet can define tab stops and placeholders with `$1`, `$2`
	* and `${3:foo}`. `$0` defines the final tab stop, it defaults to
	* the end of the snippet. Placeholders with equal identifiers are linked,
	* that is typing in one will update others too.
	*
	* See also: https://microsoft.github.io/language-server-protocol/specifications/specification-current/#snippet_syntax
	*/
	InsertTextFormat$1.Snippet = 2;
})(InsertTextFormat || (InsertTextFormat = {}));
/**
* Completion item tags are extra annotations that tweak the rendering of a completion
* item.
*
* @since 3.15.0
*/
var CompletionItemTag;
(function(CompletionItemTag$1) {
	/**
	* Render a completion as obsolete, usually using a strike-out.
	*/
	CompletionItemTag$1.Deprecated = 1;
})(CompletionItemTag || (CompletionItemTag = {}));
/**
* The InsertReplaceEdit namespace provides functions to deal with insert / replace edits.
*
* @since 3.16.0
*/
var InsertReplaceEdit;
(function(InsertReplaceEdit$1) {
	/**
	* Creates a new insert / replace edit
	*/
	function create(newText, insert, replace) {
		return {
			newText,
			insert,
			replace
		};
	}
	InsertReplaceEdit$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link InsertReplaceEdit} interface.
	*/
	function is$1(value) {
		const candidate = value;
		return candidate && Is$7.string(candidate.newText) && Range.is(candidate.insert) && Range.is(candidate.replace);
	}
	InsertReplaceEdit$1.is = is$1;
})(InsertReplaceEdit || (InsertReplaceEdit = {}));
/**
* How whitespace and indentation is handled during completion
* item insertion.
*
* @since 3.16.0
*/
var InsertTextMode;
(function(InsertTextMode$1) {
	/**
	* The insertion or replace strings is taken as it is. If the
	* value is multi line the lines below the cursor will be
	* inserted using the indentation defined in the string value.
	* The client will not apply any kind of adjustments to the
	* string.
	*/
	InsertTextMode$1.asIs = 1;
	/**
	* The editor adjusts leading whitespace of new lines so that
	* they match the indentation up to the cursor of the line for
	* which the item is accepted.
	*
	* Consider a line like this: <2tabs><cursor><3tabs>foo. Accepting a
	* multi line completion item is indented using 2 tabs and all
	* following lines inserted will be indented using 2 tabs as well.
	*/
	InsertTextMode$1.adjustIndentation = 2;
})(InsertTextMode || (InsertTextMode = {}));
var CompletionItemLabelDetails;
(function(CompletionItemLabelDetails$1) {
	function is$1(value) {
		const candidate = value;
		return candidate && (Is$7.string(candidate.detail) || candidate.detail === void 0) && (Is$7.string(candidate.description) || candidate.description === void 0);
	}
	CompletionItemLabelDetails$1.is = is$1;
})(CompletionItemLabelDetails || (CompletionItemLabelDetails = {}));
/**
* The CompletionItem namespace provides functions to deal with
* completion items.
*/
var CompletionItem;
(function(CompletionItem$1) {
	/**
	* Create a completion item and seed it with a label.
	* @param label The completion item's label
	*/
	function create(label) {
		return { label };
	}
	CompletionItem$1.create = create;
})(CompletionItem || (CompletionItem = {}));
/**
* The CompletionList namespace provides functions to deal with
* completion lists.
*/
var CompletionList;
(function(CompletionList$1) {
	/**
	* Creates a new completion list.
	*
	* @param items The completion items.
	* @param isIncomplete The list is not complete.
	*/
	function create(items, isIncomplete) {
		return {
			items: items ? items : [],
			isIncomplete: !!isIncomplete
		};
	}
	CompletionList$1.create = create;
})(CompletionList || (CompletionList = {}));
var MarkedString;
(function(MarkedString$1) {
	/**
	* Creates a marked string from plain text.
	*
	* @param plainText The plain text.
	*/
	function fromPlainText(plainText) {
		return plainText.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&");
	}
	MarkedString$1.fromPlainText = fromPlainText;
	/**
	* Checks whether the given value conforms to the {@link MarkedString} type.
	*/
	function is$1(value) {
		const candidate = value;
		return Is$7.string(candidate) || Is$7.objectLiteral(candidate) && Is$7.string(candidate.language) && Is$7.string(candidate.value);
	}
	MarkedString$1.is = is$1;
})(MarkedString || (MarkedString = {}));
var Hover;
(function(Hover$1) {
	/**
	* Checks whether the given value conforms to the {@link Hover} interface.
	*/
	function is$1(value) {
		let candidate = value;
		return !!candidate && Is$7.objectLiteral(candidate) && (MarkupContent.is(candidate.contents) || MarkedString.is(candidate.contents) || Is$7.typedArray(candidate.contents, MarkedString.is)) && (value.range === void 0 || Range.is(value.range));
	}
	Hover$1.is = is$1;
})(Hover || (Hover = {}));
/**
* The ParameterInformation namespace provides helper functions to work with
* {@link ParameterInformation} literals.
*/
var ParameterInformation;
(function(ParameterInformation$1) {
	/**
	* Creates a new parameter information literal.
	*
	* @param label A label string.
	* @param documentation A doc string.
	*/
	function create(label, documentation) {
		return documentation ? {
			label,
			documentation
		} : { label };
	}
	ParameterInformation$1.create = create;
})(ParameterInformation || (ParameterInformation = {}));
/**
* The SignatureInformation namespace provides helper functions to work with
* {@link SignatureInformation} literals.
*/
var SignatureInformation;
(function(SignatureInformation$1) {
	function create(label, documentation, ...parameters) {
		let result = { label };
		if (Is$7.defined(documentation)) result.documentation = documentation;
		if (Is$7.defined(parameters)) result.parameters = parameters;
		else result.parameters = [];
		return result;
	}
	SignatureInformation$1.create = create;
})(SignatureInformation || (SignatureInformation = {}));
/**
* A document highlight kind.
*/
var DocumentHighlightKind;
(function(DocumentHighlightKind$1) {
	/**
	* A textual occurrence.
	*/
	DocumentHighlightKind$1.Text = 1;
	/**
	* Read-access of a symbol, like reading a variable.
	*/
	DocumentHighlightKind$1.Read = 2;
	/**
	* Write-access of a symbol, like writing to a variable.
	*/
	DocumentHighlightKind$1.Write = 3;
})(DocumentHighlightKind || (DocumentHighlightKind = {}));
/**
* DocumentHighlight namespace to provide helper functions to work with
* {@link DocumentHighlight} literals.
*/
var DocumentHighlight;
(function(DocumentHighlight$1) {
	/**
	* Create a DocumentHighlight object.
	* @param range The range the highlight applies to.
	* @param kind The highlight kind
	*/
	function create(range, kind) {
		let result = { range };
		if (Is$7.number(kind)) result.kind = kind;
		return result;
	}
	DocumentHighlight$1.create = create;
})(DocumentHighlight || (DocumentHighlight = {}));
/**
* A symbol kind.
*/
var SymbolKind$1;
(function(SymbolKind$2) {
	SymbolKind$2.File = 1;
	SymbolKind$2.Module = 2;
	SymbolKind$2.Namespace = 3;
	SymbolKind$2.Package = 4;
	SymbolKind$2.Class = 5;
	SymbolKind$2.Method = 6;
	SymbolKind$2.Property = 7;
	SymbolKind$2.Field = 8;
	SymbolKind$2.Constructor = 9;
	SymbolKind$2.Enum = 10;
	SymbolKind$2.Interface = 11;
	SymbolKind$2.Function = 12;
	SymbolKind$2.Variable = 13;
	SymbolKind$2.Constant = 14;
	SymbolKind$2.String = 15;
	SymbolKind$2.Number = 16;
	SymbolKind$2.Boolean = 17;
	SymbolKind$2.Array = 18;
	SymbolKind$2.Object = 19;
	SymbolKind$2.Key = 20;
	SymbolKind$2.Null = 21;
	SymbolKind$2.EnumMember = 22;
	SymbolKind$2.Struct = 23;
	SymbolKind$2.Event = 24;
	SymbolKind$2.Operator = 25;
	SymbolKind$2.TypeParameter = 26;
})(SymbolKind$1 || (SymbolKind$1 = {}));
/**
* Symbol tags are extra annotations that tweak the rendering of a symbol.
*
* @since 3.16
*/
var SymbolTag;
(function(SymbolTag$1) {
	/**
	* Render a symbol as obsolete, usually using a strike-out.
	*/
	SymbolTag$1.Deprecated = 1;
})(SymbolTag || (SymbolTag = {}));
var SymbolInformation;
(function(SymbolInformation$1) {
	/**
	* Creates a new symbol information literal.
	*
	* @param name The name of the symbol.
	* @param kind The kind of the symbol.
	* @param range The range of the location of the symbol.
	* @param uri The resource of the location of symbol.
	* @param containerName The name of the symbol containing the symbol.
	*/
	function create(name, kind, range, uri, containerName) {
		let result = {
			name,
			kind,
			location: {
				uri,
				range
			}
		};
		if (containerName) result.containerName = containerName;
		return result;
	}
	SymbolInformation$1.create = create;
})(SymbolInformation || (SymbolInformation = {}));
var WorkspaceSymbol;
(function(WorkspaceSymbol$1) {
	/**
	* Create a new workspace symbol.
	*
	* @param name The name of the symbol.
	* @param kind The kind of the symbol.
	* @param uri The resource of the location of the symbol.
	* @param range An options range of the location.
	* @returns A WorkspaceSymbol.
	*/
	function create(name, kind, uri, range) {
		return range !== void 0 ? {
			name,
			kind,
			location: {
				uri,
				range
			}
		} : {
			name,
			kind,
			location: { uri }
		};
	}
	WorkspaceSymbol$1.create = create;
})(WorkspaceSymbol || (WorkspaceSymbol = {}));
var DocumentSymbol;
(function(DocumentSymbol$1) {
	/**
	* Creates a new symbol information literal.
	*
	* @param name The name of the symbol.
	* @param detail The detail of the symbol.
	* @param kind The kind of the symbol.
	* @param range The range of the symbol.
	* @param selectionRange The selectionRange of the symbol.
	* @param children Children of the symbol.
	*/
	function create(name, detail, kind, range, selectionRange, children) {
		let result = {
			name,
			detail,
			kind,
			range,
			selectionRange
		};
		if (children !== void 0) result.children = children;
		return result;
	}
	DocumentSymbol$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link DocumentSymbol} interface.
	*/
	function is$1(value) {
		let candidate = value;
		return candidate && Is$7.string(candidate.name) && Is$7.number(candidate.kind) && Range.is(candidate.range) && Range.is(candidate.selectionRange) && (candidate.detail === void 0 || Is$7.string(candidate.detail)) && (candidate.deprecated === void 0 || Is$7.boolean(candidate.deprecated)) && (candidate.children === void 0 || Array.isArray(candidate.children)) && (candidate.tags === void 0 || Array.isArray(candidate.tags));
	}
	DocumentSymbol$1.is = is$1;
})(DocumentSymbol || (DocumentSymbol = {}));
/**
* A set of predefined code action kinds
*/
var CodeActionKind$1;
(function(CodeActionKind$2) {
	/**
	* Empty kind.
	*/
	CodeActionKind$2.Empty = "";
	/**
	* Base kind for quickfix actions: 'quickfix'
	*/
	CodeActionKind$2.QuickFix = "quickfix";
	/**
	* Base kind for refactoring actions: 'refactor'
	*/
	CodeActionKind$2.Refactor = "refactor";
	/**
	* Base kind for refactoring extraction actions: 'refactor.extract'
	*
	* Example extract actions:
	*
	* - Extract method
	* - Extract function
	* - Extract variable
	* - Extract interface from class
	* - ...
	*/
	CodeActionKind$2.RefactorExtract = "refactor.extract";
	/**
	* Base kind for refactoring inline actions: 'refactor.inline'
	*
	* Example inline actions:
	*
	* - Inline function
	* - Inline variable
	* - Inline constant
	* - ...
	*/
	CodeActionKind$2.RefactorInline = "refactor.inline";
	/**
	* Base kind for refactoring rewrite actions: 'refactor.rewrite'
	*
	* Example rewrite actions:
	*
	* - Convert JavaScript function to class
	* - Add or remove parameter
	* - Encapsulate field
	* - Make method static
	* - Move method to base class
	* - ...
	*/
	CodeActionKind$2.RefactorRewrite = "refactor.rewrite";
	/**
	* Base kind for source actions: `source`
	*
	* Source code actions apply to the entire file.
	*/
	CodeActionKind$2.Source = "source";
	/**
	* Base kind for an organize imports source action: `source.organizeImports`
	*/
	CodeActionKind$2.SourceOrganizeImports = "source.organizeImports";
	/**
	* Base kind for auto-fix source actions: `source.fixAll`.
	*
	* Fix all actions automatically fix errors that have a clear fix that do not require user input.
	* They should not suppress errors or perform unsafe fixes such as generating new types or classes.
	*
	* @since 3.15.0
	*/
	CodeActionKind$2.SourceFixAll = "source.fixAll";
})(CodeActionKind$1 || (CodeActionKind$1 = {}));
/**
* The reason why code actions were requested.
*
* @since 3.17.0
*/
var CodeActionTriggerKind;
(function(CodeActionTriggerKind$1) {
	/**
	* Code actions were explicitly requested by the user or by an extension.
	*/
	CodeActionTriggerKind$1.Invoked = 1;
	/**
	* Code actions were requested automatically.
	*
	* This typically happens when current selection in a file changes, but can
	* also be triggered when file content changes.
	*/
	CodeActionTriggerKind$1.Automatic = 2;
})(CodeActionTriggerKind || (CodeActionTriggerKind = {}));
/**
* The CodeActionContext namespace provides helper functions to work with
* {@link CodeActionContext} literals.
*/
var CodeActionContext;
(function(CodeActionContext$1) {
	/**
	* Creates a new CodeActionContext literal.
	*/
	function create(diagnostics, only, triggerKind) {
		let result = { diagnostics };
		if (only !== void 0 && only !== null) result.only = only;
		if (triggerKind !== void 0 && triggerKind !== null) result.triggerKind = triggerKind;
		return result;
	}
	CodeActionContext$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link CodeActionContext} interface.
	*/
	function is$1(value) {
		let candidate = value;
		return Is$7.defined(candidate) && Is$7.typedArray(candidate.diagnostics, Diagnostic.is) && (candidate.only === void 0 || Is$7.typedArray(candidate.only, Is$7.string)) && (candidate.triggerKind === void 0 || candidate.triggerKind === CodeActionTriggerKind.Invoked || candidate.triggerKind === CodeActionTriggerKind.Automatic);
	}
	CodeActionContext$1.is = is$1;
})(CodeActionContext || (CodeActionContext = {}));
var CodeAction;
(function(CodeAction$1) {
	function create(title, kindOrCommandOrEdit, kind) {
		let result = { title };
		let checkKind = true;
		if (typeof kindOrCommandOrEdit === "string") {
			checkKind = false;
			result.kind = kindOrCommandOrEdit;
		} else if (Command.is(kindOrCommandOrEdit)) result.command = kindOrCommandOrEdit;
		else result.edit = kindOrCommandOrEdit;
		if (checkKind && kind !== void 0) result.kind = kind;
		return result;
	}
	CodeAction$1.create = create;
	function is$1(value) {
		let candidate = value;
		return candidate && Is$7.string(candidate.title) && (candidate.diagnostics === void 0 || Is$7.typedArray(candidate.diagnostics, Diagnostic.is)) && (candidate.kind === void 0 || Is$7.string(candidate.kind)) && (candidate.edit !== void 0 || candidate.command !== void 0) && (candidate.command === void 0 || Command.is(candidate.command)) && (candidate.isPreferred === void 0 || Is$7.boolean(candidate.isPreferred)) && (candidate.edit === void 0 || WorkspaceEdit.is(candidate.edit));
	}
	CodeAction$1.is = is$1;
})(CodeAction || (CodeAction = {}));
/**
* The CodeLens namespace provides helper functions to work with
* {@link CodeLens} literals.
*/
var CodeLens;
(function(CodeLens$1) {
	/**
	* Creates a new CodeLens literal.
	*/
	function create(range, data) {
		let result = { range };
		if (Is$7.defined(data)) result.data = data;
		return result;
	}
	CodeLens$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link CodeLens} interface.
	*/
	function is$1(value) {
		let candidate = value;
		return Is$7.defined(candidate) && Range.is(candidate.range) && (Is$7.undefined(candidate.command) || Command.is(candidate.command));
	}
	CodeLens$1.is = is$1;
})(CodeLens || (CodeLens = {}));
/**
* The FormattingOptions namespace provides helper functions to work with
* {@link FormattingOptions} literals.
*/
var FormattingOptions;
(function(FormattingOptions$1) {
	/**
	* Creates a new FormattingOptions literal.
	*/
	function create(tabSize, insertSpaces) {
		return {
			tabSize,
			insertSpaces
		};
	}
	FormattingOptions$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link FormattingOptions} interface.
	*/
	function is$1(value) {
		let candidate = value;
		return Is$7.defined(candidate) && Is$7.uinteger(candidate.tabSize) && Is$7.boolean(candidate.insertSpaces);
	}
	FormattingOptions$1.is = is$1;
})(FormattingOptions || (FormattingOptions = {}));
/**
* The DocumentLink namespace provides helper functions to work with
* {@link DocumentLink} literals.
*/
var DocumentLink;
(function(DocumentLink$1) {
	/**
	* Creates a new DocumentLink literal.
	*/
	function create(range, target, data) {
		return {
			range,
			target,
			data
		};
	}
	DocumentLink$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link DocumentLink} interface.
	*/
	function is$1(value) {
		let candidate = value;
		return Is$7.defined(candidate) && Range.is(candidate.range) && (Is$7.undefined(candidate.target) || Is$7.string(candidate.target));
	}
	DocumentLink$1.is = is$1;
})(DocumentLink || (DocumentLink = {}));
/**
* The SelectionRange namespace provides helper function to work with
* SelectionRange literals.
*/
var SelectionRange;
(function(SelectionRange$1) {
	/**
	* Creates a new SelectionRange
	* @param range the range.
	* @param parent an optional parent.
	*/
	function create(range, parent) {
		return {
			range,
			parent
		};
	}
	SelectionRange$1.create = create;
	function is$1(value) {
		let candidate = value;
		return Is$7.objectLiteral(candidate) && Range.is(candidate.range) && (candidate.parent === void 0 || SelectionRange$1.is(candidate.parent));
	}
	SelectionRange$1.is = is$1;
})(SelectionRange || (SelectionRange = {}));
/**
* A set of predefined token types. This set is not fixed
* an clients can specify additional token types via the
* corresponding client capabilities.
*
* @since 3.16.0
*/
var SemanticTokenTypes;
(function(SemanticTokenTypes$1) {
	SemanticTokenTypes$1["namespace"] = "namespace";
	/**
	* Represents a generic type. Acts as a fallback for types which can't be mapped to
	* a specific type like class or enum.
	*/
	SemanticTokenTypes$1["type"] = "type";
	SemanticTokenTypes$1["class"] = "class";
	SemanticTokenTypes$1["enum"] = "enum";
	SemanticTokenTypes$1["interface"] = "interface";
	SemanticTokenTypes$1["struct"] = "struct";
	SemanticTokenTypes$1["typeParameter"] = "typeParameter";
	SemanticTokenTypes$1["parameter"] = "parameter";
	SemanticTokenTypes$1["variable"] = "variable";
	SemanticTokenTypes$1["property"] = "property";
	SemanticTokenTypes$1["enumMember"] = "enumMember";
	SemanticTokenTypes$1["event"] = "event";
	SemanticTokenTypes$1["function"] = "function";
	SemanticTokenTypes$1["method"] = "method";
	SemanticTokenTypes$1["macro"] = "macro";
	SemanticTokenTypes$1["keyword"] = "keyword";
	SemanticTokenTypes$1["modifier"] = "modifier";
	SemanticTokenTypes$1["comment"] = "comment";
	SemanticTokenTypes$1["string"] = "string";
	SemanticTokenTypes$1["number"] = "number";
	SemanticTokenTypes$1["regexp"] = "regexp";
	SemanticTokenTypes$1["operator"] = "operator";
	/**
	* @since 3.17.0
	*/
	SemanticTokenTypes$1["decorator"] = "decorator";
})(SemanticTokenTypes || (SemanticTokenTypes = {}));
/**
* A set of predefined token modifiers. This set is not fixed
* an clients can specify additional token types via the
* corresponding client capabilities.
*
* @since 3.16.0
*/
var SemanticTokenModifiers;
(function(SemanticTokenModifiers$1) {
	SemanticTokenModifiers$1["declaration"] = "declaration";
	SemanticTokenModifiers$1["definition"] = "definition";
	SemanticTokenModifiers$1["readonly"] = "readonly";
	SemanticTokenModifiers$1["static"] = "static";
	SemanticTokenModifiers$1["deprecated"] = "deprecated";
	SemanticTokenModifiers$1["abstract"] = "abstract";
	SemanticTokenModifiers$1["async"] = "async";
	SemanticTokenModifiers$1["modification"] = "modification";
	SemanticTokenModifiers$1["documentation"] = "documentation";
	SemanticTokenModifiers$1["defaultLibrary"] = "defaultLibrary";
})(SemanticTokenModifiers || (SemanticTokenModifiers = {}));
/**
* @since 3.16.0
*/
var SemanticTokens;
(function(SemanticTokens$1) {
	function is$1(value) {
		const candidate = value;
		return Is$7.objectLiteral(candidate) && (candidate.resultId === void 0 || typeof candidate.resultId === "string") && Array.isArray(candidate.data) && (candidate.data.length === 0 || typeof candidate.data[0] === "number");
	}
	SemanticTokens$1.is = is$1;
})(SemanticTokens || (SemanticTokens = {}));
/**
* The InlineValueText namespace provides functions to deal with InlineValueTexts.
*
* @since 3.17.0
*/
var InlineValueText;
(function(InlineValueText$1) {
	/**
	* Creates a new InlineValueText literal.
	*/
	function create(range, text) {
		return {
			range,
			text
		};
	}
	InlineValueText$1.create = create;
	function is$1(value) {
		const candidate = value;
		return candidate !== void 0 && candidate !== null && Range.is(candidate.range) && Is$7.string(candidate.text);
	}
	InlineValueText$1.is = is$1;
})(InlineValueText || (InlineValueText = {}));
/**
* The InlineValueVariableLookup namespace provides functions to deal with InlineValueVariableLookups.
*
* @since 3.17.0
*/
var InlineValueVariableLookup;
(function(InlineValueVariableLookup$1) {
	/**
	* Creates a new InlineValueText literal.
	*/
	function create(range, variableName, caseSensitiveLookup) {
		return {
			range,
			variableName,
			caseSensitiveLookup
		};
	}
	InlineValueVariableLookup$1.create = create;
	function is$1(value) {
		const candidate = value;
		return candidate !== void 0 && candidate !== null && Range.is(candidate.range) && Is$7.boolean(candidate.caseSensitiveLookup) && (Is$7.string(candidate.variableName) || candidate.variableName === void 0);
	}
	InlineValueVariableLookup$1.is = is$1;
})(InlineValueVariableLookup || (InlineValueVariableLookup = {}));
/**
* The InlineValueEvaluatableExpression namespace provides functions to deal with InlineValueEvaluatableExpression.
*
* @since 3.17.0
*/
var InlineValueEvaluatableExpression;
(function(InlineValueEvaluatableExpression$1) {
	/**
	* Creates a new InlineValueEvaluatableExpression literal.
	*/
	function create(range, expression) {
		return {
			range,
			expression
		};
	}
	InlineValueEvaluatableExpression$1.create = create;
	function is$1(value) {
		const candidate = value;
		return candidate !== void 0 && candidate !== null && Range.is(candidate.range) && (Is$7.string(candidate.expression) || candidate.expression === void 0);
	}
	InlineValueEvaluatableExpression$1.is = is$1;
})(InlineValueEvaluatableExpression || (InlineValueEvaluatableExpression = {}));
/**
* The InlineValueContext namespace provides helper functions to work with
* {@link InlineValueContext} literals.
*
* @since 3.17.0
*/
var InlineValueContext;
(function(InlineValueContext$1) {
	/**
	* Creates a new InlineValueContext literal.
	*/
	function create(frameId, stoppedLocation) {
		return {
			frameId,
			stoppedLocation
		};
	}
	InlineValueContext$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link InlineValueContext} interface.
	*/
	function is$1(value) {
		const candidate = value;
		return Is$7.defined(candidate) && Range.is(value.stoppedLocation);
	}
	InlineValueContext$1.is = is$1;
})(InlineValueContext || (InlineValueContext = {}));
/**
* Inlay hint kinds.
*
* @since 3.17.0
*/
var InlayHintKind;
(function(InlayHintKind$1) {
	/**
	* An inlay hint that for a type annotation.
	*/
	InlayHintKind$1.Type = 1;
	/**
	* An inlay hint that is for a parameter.
	*/
	InlayHintKind$1.Parameter = 2;
	function is$1(value) {
		return value === 1 || value === 2;
	}
	InlayHintKind$1.is = is$1;
})(InlayHintKind || (InlayHintKind = {}));
var InlayHintLabelPart;
(function(InlayHintLabelPart$1) {
	function create(value) {
		return { value };
	}
	InlayHintLabelPart$1.create = create;
	function is$1(value) {
		const candidate = value;
		return Is$7.objectLiteral(candidate) && (candidate.tooltip === void 0 || Is$7.string(candidate.tooltip) || MarkupContent.is(candidate.tooltip)) && (candidate.location === void 0 || Location.is(candidate.location)) && (candidate.command === void 0 || Command.is(candidate.command));
	}
	InlayHintLabelPart$1.is = is$1;
})(InlayHintLabelPart || (InlayHintLabelPart = {}));
var InlayHint;
(function(InlayHint$1) {
	function create(position, label, kind) {
		const result = {
			position,
			label
		};
		if (kind !== void 0) result.kind = kind;
		return result;
	}
	InlayHint$1.create = create;
	function is$1(value) {
		const candidate = value;
		return Is$7.objectLiteral(candidate) && Position.is(candidate.position) && (Is$7.string(candidate.label) || Is$7.typedArray(candidate.label, InlayHintLabelPart.is)) && (candidate.kind === void 0 || InlayHintKind.is(candidate.kind)) && candidate.textEdits === void 0 || Is$7.typedArray(candidate.textEdits, TextEdit.is) && (candidate.tooltip === void 0 || Is$7.string(candidate.tooltip) || MarkupContent.is(candidate.tooltip)) && (candidate.paddingLeft === void 0 || Is$7.boolean(candidate.paddingLeft)) && (candidate.paddingRight === void 0 || Is$7.boolean(candidate.paddingRight));
	}
	InlayHint$1.is = is$1;
})(InlayHint || (InlayHint = {}));
var StringValue;
(function(StringValue$1) {
	function createSnippet(value) {
		return {
			kind: "snippet",
			value
		};
	}
	StringValue$1.createSnippet = createSnippet;
})(StringValue || (StringValue = {}));
var InlineCompletionItem;
(function(InlineCompletionItem$1) {
	function create(insertText, filterText, range, command) {
		return {
			insertText,
			filterText,
			range,
			command
		};
	}
	InlineCompletionItem$1.create = create;
})(InlineCompletionItem || (InlineCompletionItem = {}));
var InlineCompletionList;
(function(InlineCompletionList$1) {
	function create(items) {
		return { items };
	}
	InlineCompletionList$1.create = create;
})(InlineCompletionList || (InlineCompletionList = {}));
/**
* Describes how an {@link InlineCompletionItemProvider inline completion provider} was triggered.
*
* @since 3.18.0
* @proposed
*/
var InlineCompletionTriggerKind;
(function(InlineCompletionTriggerKind$1) {
	/**
	* Completion was triggered explicitly by a user gesture.
	*/
	InlineCompletionTriggerKind$1.Invoked = 0;
	/**
	* Completion was triggered automatically while editing.
	*/
	InlineCompletionTriggerKind$1.Automatic = 1;
})(InlineCompletionTriggerKind || (InlineCompletionTriggerKind = {}));
var SelectedCompletionInfo;
(function(SelectedCompletionInfo$1) {
	function create(range, text) {
		return {
			range,
			text
		};
	}
	SelectedCompletionInfo$1.create = create;
})(SelectedCompletionInfo || (SelectedCompletionInfo = {}));
var InlineCompletionContext;
(function(InlineCompletionContext$1) {
	function create(triggerKind, selectedCompletionInfo) {
		return {
			triggerKind,
			selectedCompletionInfo
		};
	}
	InlineCompletionContext$1.create = create;
})(InlineCompletionContext || (InlineCompletionContext = {}));
var WorkspaceFolder;
(function(WorkspaceFolder$1) {
	function is$1(value) {
		const candidate = value;
		return Is$7.objectLiteral(candidate) && URI.is(candidate.uri) && Is$7.string(candidate.name);
	}
	WorkspaceFolder$1.is = is$1;
})(WorkspaceFolder || (WorkspaceFolder = {}));
/**
* @deprecated Use the text document from the new vscode-languageserver-textdocument package.
*/
var TextDocument;
(function(TextDocument$1) {
	/**
	* Creates a new ITextDocument literal from the given uri and content.
	* @param uri The document's uri.
	* @param languageId The document's language Id.
	* @param version The document's version.
	* @param content The document's content.
	*/
	function create(uri, languageId, version, content) {
		return new FullTextDocument(uri, languageId, version, content);
	}
	TextDocument$1.create = create;
	/**
	* Checks whether the given literal conforms to the {@link ITextDocument} interface.
	*/
	function is$1(value) {
		let candidate = value;
		return Is$7.defined(candidate) && Is$7.string(candidate.uri) && (Is$7.undefined(candidate.languageId) || Is$7.string(candidate.languageId)) && Is$7.uinteger(candidate.lineCount) && Is$7.func(candidate.getText) && Is$7.func(candidate.positionAt) && Is$7.func(candidate.offsetAt) ? true : false;
	}
	TextDocument$1.is = is$1;
	function applyEdits(document, edits) {
		let text = document.getText();
		let sortedEdits = mergeSort(edits, (a, b) => {
			let diff = a.range.start.line - b.range.start.line;
			if (diff === 0) return a.range.start.character - b.range.start.character;
			return diff;
		});
		let lastModifiedOffset = text.length;
		for (let i = sortedEdits.length - 1; i >= 0; i--) {
			let e = sortedEdits[i];
			let startOffset = document.offsetAt(e.range.start);
			let endOffset = document.offsetAt(e.range.end);
			if (endOffset <= lastModifiedOffset) text = text.substring(0, startOffset) + e.newText + text.substring(endOffset, text.length);
			else throw new Error("Overlapping edit");
			lastModifiedOffset = startOffset;
		}
		return text;
	}
	TextDocument$1.applyEdits = applyEdits;
	function mergeSort(data, compare) {
		if (data.length <= 1) return data;
		const p = data.length / 2 | 0;
		const left = data.slice(0, p);
		const right = data.slice(p);
		mergeSort(left, compare);
		mergeSort(right, compare);
		let leftIdx = 0;
		let rightIdx = 0;
		let i = 0;
		while (leftIdx < left.length && rightIdx < right.length) {
			let ret = compare(left[leftIdx], right[rightIdx]);
			if (ret <= 0) data[i++] = left[leftIdx++];
			else data[i++] = right[rightIdx++];
		}
		while (leftIdx < left.length) data[i++] = left[leftIdx++];
		while (rightIdx < right.length) data[i++] = right[rightIdx++];
		return data;
	}
})(TextDocument || (TextDocument = {}));
/**
* @deprecated Use the text document from the new vscode-languageserver-textdocument package.
*/
var FullTextDocument = class {
	constructor(uri, languageId, version, content) {
		this._uri = uri;
		this._languageId = languageId;
		this._version = version;
		this._content = content;
		this._lineOffsets = void 0;
	}
	get uri() {
		return this._uri;
	}
	get languageId() {
		return this._languageId;
	}
	get version() {
		return this._version;
	}
	getText(range) {
		if (range) {
			let start = this.offsetAt(range.start);
			let end = this.offsetAt(range.end);
			return this._content.substring(start, end);
		}
		return this._content;
	}
	update(event, version) {
		this._content = event.text;
		this._version = version;
		this._lineOffsets = void 0;
	}
	getLineOffsets() {
		if (this._lineOffsets === void 0) {
			let lineOffsets = [];
			let text = this._content;
			let isLineStart = true;
			for (let i = 0; i < text.length; i++) {
				if (isLineStart) {
					lineOffsets.push(i);
					isLineStart = false;
				}
				let ch = text.charAt(i);
				isLineStart = ch === "\r" || ch === "\n";
				if (ch === "\r" && i + 1 < text.length && text.charAt(i + 1) === "\n") i++;
			}
			if (isLineStart && text.length > 0) lineOffsets.push(text.length);
			this._lineOffsets = lineOffsets;
		}
		return this._lineOffsets;
	}
	positionAt(offset) {
		offset = Math.max(Math.min(offset, this._content.length), 0);
		let lineOffsets = this.getLineOffsets();
		let low = 0, high = lineOffsets.length;
		if (high === 0) return Position.create(0, offset);
		while (low < high) {
			let mid = Math.floor((low + high) / 2);
			if (lineOffsets[mid] > offset) high = mid;
			else low = mid + 1;
		}
		let line = low - 1;
		return Position.create(line, offset - lineOffsets[line]);
	}
	offsetAt(position) {
		let lineOffsets = this.getLineOffsets();
		if (position.line >= lineOffsets.length) return this._content.length;
		else if (position.line < 0) return 0;
		let lineOffset = lineOffsets[position.line];
		let nextLineOffset = position.line + 1 < lineOffsets.length ? lineOffsets[position.line + 1] : this._content.length;
		return Math.max(Math.min(lineOffset + position.character, nextLineOffset), lineOffset);
	}
	get lineCount() {
		return this.getLineOffsets().length;
	}
};
var Is$7;
(function(Is$8) {
	const toString = Object.prototype.toString;
	function defined(value) {
		return typeof value !== "undefined";
	}
	Is$8.defined = defined;
	function undefined$1(value) {
		return typeof value === "undefined";
	}
	Is$8.undefined = undefined$1;
	function boolean$2(value) {
		return value === true || value === false;
	}
	Is$8.boolean = boolean$2;
	function string$2(value) {
		return toString.call(value) === "[object String]";
	}
	Is$8.string = string$2;
	function number$2(value) {
		return toString.call(value) === "[object Number]";
	}
	Is$8.number = number$2;
	function numberRange(value, min, max) {
		return toString.call(value) === "[object Number]" && min <= value && value <= max;
	}
	Is$8.numberRange = numberRange;
	function integer$1(value) {
		return toString.call(value) === "[object Number]" && -2147483648 <= value && value <= 2147483647;
	}
	Is$8.integer = integer$1;
	function uinteger$1(value) {
		return toString.call(value) === "[object Number]" && 0 <= value && value <= 2147483647;
	}
	Is$8.uinteger = uinteger$1;
	function func$2(value) {
		return toString.call(value) === "[object Function]";
	}
	Is$8.func = func$2;
	function objectLiteral$1(value) {
		return value !== null && typeof value === "object";
	}
	Is$8.objectLiteral = objectLiteral$1;
	function typedArray$1(value, check) {
		return Array.isArray(value) && value.every(check);
	}
	Is$8.typedArray = typedArray$1;
})(Is$7 || (Is$7 = {}));

//#endregion
//#region packages/types/src/lsp/symbols.ts
const SYMBOL_KINDS = {
	File: SymbolKind$1.File,
	Module: SymbolKind$1.Module,
	Namespace: SymbolKind$1.Namespace,
	Package: SymbolKind$1.Package,
	Class: SymbolKind$1.Class,
	Method: SymbolKind$1.Method,
	Property: SymbolKind$1.Property,
	Field: SymbolKind$1.Field,
	Constructor: SymbolKind$1.Constructor,
	Enum: SymbolKind$1.Enum,
	Interface: SymbolKind$1.Interface,
	Function: SymbolKind$1.Function,
	Variable: SymbolKind$1.Variable,
	Constant: SymbolKind$1.Constant,
	String: SymbolKind$1.String,
	Number: SymbolKind$1.Number,
	Boolean: SymbolKind$1.Boolean,
	Array: SymbolKind$1.Array,
	Object: SymbolKind$1.Object,
	Key: SymbolKind$1.Key,
	Null: SymbolKind$1.Null,
	EnumMember: SymbolKind$1.EnumMember,
	Struct: SymbolKind$1.Struct,
	Event: SymbolKind$1.Event,
	Operator: SymbolKind$1.Operator,
	TypeParameter: SymbolKind$1.TypeParameter
};
const SYMBOL_KIND_NAMES = Object.keys(SYMBOL_KINDS);
const SymbolKindNames = {
	[SymbolKind$1.File]: "File",
	[SymbolKind$1.Module]: "Module",
	[SymbolKind$1.Namespace]: "Namespace",
	[SymbolKind$1.Package]: "Package",
	[SymbolKind$1.Class]: "Class",
	[SymbolKind$1.Method]: "Method",
	[SymbolKind$1.Property]: "Property",
	[SymbolKind$1.Field]: "Field",
	[SymbolKind$1.Constructor]: "Constructor",
	[SymbolKind$1.Enum]: "Enum",
	[SymbolKind$1.Interface]: "Interface",
	[SymbolKind$1.Function]: "Function",
	[SymbolKind$1.Variable]: "Variable",
	[SymbolKind$1.Constant]: "Constant",
	[SymbolKind$1.String]: "String",
	[SymbolKind$1.Number]: "Number",
	[SymbolKind$1.Boolean]: "Boolean",
	[SymbolKind$1.Array]: "Array",
	[SymbolKind$1.Object]: "Object",
	[SymbolKind$1.Key]: "Key",
	[SymbolKind$1.Null]: "Null",
	[SymbolKind$1.EnumMember]: "EnumMember",
	[SymbolKind$1.Struct]: "Struct",
	[SymbolKind$1.Event]: "Event",
	[SymbolKind$1.Operator]: "Operator",
	[SymbolKind$1.TypeParameter]: "TypeParameter"
};
/**
* Get the display name for a symbol kind
*/
function getSymbolKindName(kind) {
	const entry = Object.entries(SYMBOL_KINDS).find(([_, value]) => value === kind);
	return entry ? entry[0] : void 0;
}
/**
* Parse symbol kind input (string or array of strings) to SymbolKind values
* Accepts string values with case-insensitive matching (e.g., "Class", "class", "CLASS")
*/
function parseSymbolKind(input) {
	if (input === void 0 || input === null) return void 0;
	if (typeof input === "string") {
		if (input.startsWith("[") && input.endsWith("]")) try {
			const parsed = JSON.parse(input);
			if (Array.isArray(parsed)) input = parsed;
		} catch {}
	}
	const kinds = Array.isArray(input) ? input : [input];
	return kinds.map((k) => {
		if (typeof k !== "string") throw new Error(`Invalid kind type: ${typeof k}. Expected string.`);
		const kindName = SYMBOL_KIND_NAMES.find((name) => name.toLowerCase() === k.toLowerCase());
		if (kindName) return SYMBOL_KINDS[kindName];
		throw new Error(`Unknown symbol kind: "${k}". Valid options: ${SYMBOL_KIND_NAMES.join(", ")}`);
	});
}

//#endregion
//#region packages/types/src/lsp/diagnostics.ts
const DIAGNOSTIC_SEVERITY_NAMES = {
	[DiagnosticSeverity$1.Error]: "error",
	[DiagnosticSeverity$1.Warning]: "warning",
	[DiagnosticSeverity$1.Information]: "info",
	[DiagnosticSeverity$1.Hint]: "hint"
};

//#endregion
//#region packages/types/src/domain/tools.ts
const toolSchemas = {
	root: z.string().describe("Root directory for resolving relative paths"),
	filePath: z.string().describe("File path (relative to root)"),
	line: z.union([z.number().describe("Line number (1-based)"), z.string().describe("String to match in the line")]),
	symbolName: z.string().describe("Name of the symbol"),
	includeBody: z.boolean().optional().describe("Include the full body of the symbol"),
	before: z.number().optional().describe("Number of lines to show before"),
	after: z.number().optional().describe("Number of lines to show after")
};

//#endregion
//#region packages/types/src/common/logger.ts
/**
* Common logging types and constants
*/
let LogLevel = /* @__PURE__ */ function(LogLevel$1) {
	LogLevel$1[LogLevel$1["ERROR"] = 0] = "ERROR";
	LogLevel$1[LogLevel$1["WARN"] = 1] = "WARN";
	LogLevel$1[LogLevel$1["INFO"] = 2] = "INFO";
	LogLevel$1[LogLevel$1["DEBUG"] = 3] = "DEBUG";
	LogLevel$1[LogLevel$1["TRACE"] = 4] = "TRACE";
	return LogLevel$1;
}({});

//#endregion
//#region packages/types/src/shared/resultBuilders.ts
/**
* Builder for diagnostic results
*/
var DiagnosticResultBuilder = class {
	diagnostics = [];
	filePath;
	constructor(_root, filePath) {
		this.filePath = filePath;
	}
	/**
	* Add an LSP diagnostic
	*/
	addLSPDiagnostic(diagnostic) {
		this.diagnostics.push({
			severity: this.mapSeverity(diagnostic.severity || 1),
			line: diagnostic.range.start.line + 1,
			column: diagnostic.range.start.character + 1,
			endLine: diagnostic.range.end.line + 1,
			endColumn: diagnostic.range.end.character + 1,
			message: diagnostic.message,
			source: diagnostic.source
		});
		return this;
	}
	/**
	* Add multiple LSP diagnostics
	*/
	addLSPDiagnostics(diagnostics) {
		diagnostics.forEach((d) => this.addLSPDiagnostic(d));
		return this;
	}
	/**
	* Add a custom diagnostic
	*/
	addDiagnostic(diagnostic) {
		this.diagnostics.push(diagnostic);
		return this;
	}
	/**
	* Get the count of diagnostics by severity
	*/
	getCounts() {
		const counts = {
			errors: 0,
			warnings: 0,
			info: 0,
			hints: 0
		};
		this.diagnostics.forEach((d) => {
			switch (d.severity) {
				case "error":
					counts.errors++;
					break;
				case "warning":
					counts.warnings++;
					break;
				case "info":
					counts.info++;
					break;
				case "hint":
					counts.hints++;
					break;
			}
		});
		return counts;
	}
	/**
	* Build the final result
	*/
	build() {
		const counts = this.getCounts();
		const parts = [];
		if (counts.errors > 0) parts.push(`${counts.errors} error(s)`);
		if (counts.warnings > 0) parts.push(`${counts.warnings} warning(s)`);
		if (counts.info > 0) parts.push(`${counts.info} info`);
		if (counts.hints > 0) parts.push(`${counts.hints} hint(s)`);
		let message;
		if (this.diagnostics.length === 0) message = `Found 0 errors and 0 warnings`;
		else if (parts.length > 0) message = `Found ${parts.join(", ")}`;
		else message = "No diagnostics found";
		if (this.filePath) message += ` in ${this.filePath}`;
		return {
			message,
			diagnostics: this.diagnostics
		};
	}
	/**
	* Format as string for display
	*/
	toString() {
		const result = this.build();
		const lines = [result.message];
		if (result.diagnostics.length > 0) {
			lines.push("");
			result.diagnostics.forEach((d) => {
				const location = `${this.filePath || ""}:${d.line}:${d.column}`;
				const severity = d.severity.toUpperCase();
				lines.push(`[${severity}] ${location} - ${d.message}`);
			});
		}
		return lines.join("\n");
	}
	mapSeverity(severity) {
		switch (severity) {
			case 1: return "error";
			case 2: return "warning";
			case 3: return "info";
			case 4: return "hint";
			default: return "info";
		}
	}
};

//#endregion
//#region packages/types/src/constants/indexer.ts
/**
* Symbol indexer constants
*/
const SYMBOL_CACHE_SCHEMA_VERSION = 2;

//#endregion
//#region packages/types/src/validators/lsp.ts
const lspSchemas = {
	root: z.string().describe("Root directory for resolving relative paths"),
	relativePath: z.string().describe("File path (relative to root)"),
	line: z.union([z.number(), z.string()]).describe("Line number (1-based) or string to match in the line"),
	symbolName: z.string().describe("Name of the symbol"),
	character: z.number().describe("Character position in the line (0-based)"),
	symbolIndex: z.number().default(0).describe("Index of the symbol occurrence if it appears multiple times on the line (0-based)"),
	before: z.number().default(0).describe("Number of lines to show before the definition"),
	after: z.number().default(0).describe("Number of lines to show after the definition"),
	textTarget: z.string().optional().describe("Text to find in the file"),
	column: z.number().optional().describe("Column position in the line (0-based)"),
	includeBody: z.boolean().optional().describe("Include the full body of the symbol"),
	forceRefresh: z.boolean().optional().describe("Force refresh of the document"),
	timeout: z.number().optional().describe("Timeout in milliseconds")
};
const fileLocationSchema = z.object({
	root: lspSchemas.root,
	relativePath: lspSchemas.relativePath
});
const symbolLocationSchema = z.object({
	root: lspSchemas.root,
	relativePath: lspSchemas.relativePath,
	line: lspSchemas.line,
	symbolName: lspSchemas.symbolName
});
const definitionSchema = symbolLocationSchema.extend({
	before: lspSchemas.before.optional(),
	after: lspSchemas.after.optional(),
	includeBody: lspSchemas.includeBody.optional()
});
const hoverSchema = z.object({
	root: lspSchemas.root,
	relativePath: lspSchemas.relativePath,
	line: lspSchemas.line.optional(),
	character: lspSchemas.character.optional(),
	column: lspSchemas.column.optional(),
	textTarget: lspSchemas.textTarget.optional()
});
const diagnosticsSchema = z.object({
	root: lspSchemas.root,
	relativePath: lspSchemas.relativePath,
	forceRefresh: lspSchemas.forceRefresh.optional(),
	timeout: lspSchemas.timeout.optional()
});
const formattingOptionsSchema = z.object({
	tabSize: z.number().default(2).describe("Number of spaces for indentation"),
	insertSpaces: z.boolean().default(true).describe("Use spaces instead of tabs"),
	trimTrailingWhitespace: z.boolean().default(true).describe("Trim trailing whitespace"),
	insertFinalNewline: z.boolean().default(true).describe("Insert final newline"),
	trimFinalNewlines: z.boolean().default(true).describe("Trim final newlines")
});
const commonSchemas = lspSchemas;

//#endregion
//#region packages/types/src/validators/indexer.ts
const SymbolKindSchema = z.enum([
	"File",
	"Module",
	"Namespace",
	"Package",
	"Class",
	"Method",
	"Property",
	"Field",
	"Constructor",
	"Enum",
	"Interface",
	"Function",
	"Variable",
	"Constant",
	"String",
	"Number",
	"Boolean",
	"Array",
	"Object",
	"Key",
	"Null",
	"EnumMember",
	"Struct",
	"Event",
	"Operator",
	"TypeParameter"
]);
const indexFilesSchema = z.object({
	root: z.string().optional().describe("Root directory for the project"),
	pattern: z.string().optional().describe("Glob pattern for files to index"),
	noCache: z.boolean().default(false).describe("Force full re-index, ignoring cache"),
	forceReset: z.boolean().default(false).describe("Completely reset the index before starting"),
	concurrency: z.number().min(1).max(20).optional().describe("Number of files to index in parallel")
});
const searchSymbolSchema = z.object({
	root: z.string().optional().describe("Root directory for the project"),
	name: z.string().optional().describe("Symbol name to search for"),
	kind: z.union([SymbolKindSchema, z.array(SymbolKindSchema)]).optional().describe("Symbol kind(s) to filter by"),
	file: z.string().optional().describe("File path to search within"),
	containerName: z.string().optional().describe("Container name"),
	includeChildren: z.boolean().default(true).describe("Include child symbols"),
	includeExternal: z.boolean().default(false).describe("Include external library symbols"),
	onlyExternal: z.boolean().default(false).describe("Only return external library symbols"),
	sourceLibrary: z.string().optional().describe("Filter by specific library name")
});
const clearIndexSchema = z.object({
	root: z.string().optional().describe("Root directory for the project"),
	force: z.boolean().default(false).describe("Force clear all caches including SQLite cache")
});

//#endregion
//#region packages/types/src/validators/config.ts
const serverCharacteristicsSchema = z.object({
	documentOpenDelay: z.number().optional(),
	requiresInitialDocument: z.boolean().optional(),
	requiresFileScheme: z.boolean().optional(),
	supportsProgressNotifications: z.boolean().optional(),
	supportsWorkDoneProgress: z.boolean().optional(),
	supportsPartialResults: z.boolean().optional()
});
const adapterConfigSchema = z.object({
	id: z.string(),
	name: z.string(),
	command: z.string(),
	args: z.array(z.string()).optional(),
	env: z.record(z.string()).optional(),
	rootMarkers: z.array(z.string()).optional(),
	initializationOptions: z.any().optional(),
	serverCharacteristics: serverCharacteristicsSchema.optional(),
	capabilities: z.object({
		hover: z.boolean().optional(),
		definition: z.boolean().optional(),
		references: z.boolean().optional(),
		completion: z.boolean().optional(),
		signatureHelp: z.boolean().optional(),
		diagnostics: z.boolean().optional(),
		codeAction: z.boolean().optional(),
		formatting: z.boolean().optional(),
		rename: z.boolean().optional(),
		documentSymbol: z.boolean().optional(),
		workspaceSymbol: z.boolean().optional()
	}).optional(),
	fileExtensions: z.array(z.string()).optional(),
	languageId: z.string().optional()
});
const memoryConfigSchema = z.object({
	enabled: z.boolean().default(true),
	autoSave: z.boolean().default(true),
	templates: z.record(z.string()).optional(),
	maxMemories: z.number().default(100),
	compressionEnabled: z.boolean().default(false)
});
const indexConfigSchema = z.object({
	patterns: z.array(z.string()).optional(),
	exclude: z.array(z.string()).optional(),
	maxFiles: z.number().optional(),
	concurrency: z.number().optional(),
	cacheEnabled: z.boolean().default(true),
	autoUpdate: z.boolean().default(true)
});
const configSchema = z.object({
	language: z.string().optional(),
	adapter: adapterConfigSchema.optional(),
	memory: memoryConfigSchema.optional(),
	index: indexConfigSchema.optional(),
	debug: z.boolean().optional(),
	verbose: z.boolean().optional(),
	experimental: z.record(z.any()).optional()
});

//#endregion
//#region packages/types/src/validators/memory.ts
const listMemoriesSchema = z.object({ root: z.string().describe("Root directory of the project") });
const readMemorySchema = z.object({
	root: z.string().describe("Root directory of the project"),
	memoryName: z.string().describe("Name of the memory to read")
});
const writeMemorySchema = z.object({
	root: z.string().describe("Root directory of the project"),
	memoryName: z.string().describe("Name of the memory to write"),
	content: z.string().describe("Content to save in the memory")
});
const deleteMemorySchema = z.object({
	root: z.string().describe("Root directory of the project"),
	memoryName: z.string().describe("Name of the memory to delete")
});
const searchMemoriesSchema = z.object({
	root: z.string().describe("Root directory of the project"),
	query: z.string().describe("Search query"),
	caseSensitive: z.boolean().optional().describe("Case sensitive search"),
	regex: z.boolean().optional().describe("Use regex for search")
});
const mergeMemoriesSchema = z.object({
	root: z.string().describe("Root directory of the project"),
	sourceMemories: z.array(z.string()).describe("List of memory names to merge"),
	targetMemory: z.string().describe("Target memory name for merged content"),
	deleteSources: z.boolean().optional().describe("Delete source memories after merge")
});
const compressMemorySchema = z.object({
	root: z.string().describe("Root directory of the project"),
	memoryName: z.string().describe("Name of the memory to compress"),
	algorithm: z.enum([
		"gzip",
		"brotli",
		"deflate"
	]).optional()
});

//#endregion
//#region packages/lsp-client/src/protocol/types/base.ts
function isLSPRequest(message) {
	return "method" in message && "id" in message;
}
function isLSPResponse(message) {
	return "id" in message && ("result" in message || "error" in message);
}
function isLSPNotification(message) {
	return "method" in message && !("id" in message);
}

//#endregion
//#region packages/lsp-client/src/utils/lsp-logger.ts
/**
* LSP Client Logger - Independent logging system for LSP client
*
* This logger is separate from the MCP logger and can be controlled independently.
* Use LSP_DEBUG=1 environment variable to enable LSP client debug logging.
*/
/**
* Check if LSP debug logging is enabled
*/
function isLspDebugEnabled() {
	return process.env.LSP_DEBUG === "1" || process.env.LSP_DEBUG === "true";
}
/**
* LSP client debug logging function
*
* @param args Arguments to log (same as console.error)
*
* @example
* lspDebug("Processing LSP request:", requestType);
* lspDebug("[LSPClient] Connected to server");
*/
function lspDebug(...args) {
	if (isLspDebugEnabled()) console.error("[LSP]", ...args);
}
/**
* LSP client debug logging with custom prefix
*
* @param prefix Component prefix (e.g., "Client", "Server", "Protocol")
* @param args Arguments to log
*
* @example
* lspDebugWithPrefix("Client", "Sending request:", method);
* lspDebugWithPrefix("Protocol", "Received response:", data);
*/
function lspDebugWithPrefix(prefix, ...args) {
	if (isLspDebugEnabled()) console.error(`[LSP:${prefix}]`, ...args);
}

//#endregion
//#region packages/lsp-client/src/utils/debug.ts
function debug(...args) {
	lspDebug(...args);
}
function debugLog(message, data) {
	if (data) lspDebugWithPrefix("Debug", message, JSON.stringify(data, null, 2));
	else lspDebugWithPrefix("Debug", message);
}

//#endregion
//#region packages/lsp-client/src/core/connection.ts
/**
* Server-to-client requests that only need an acknowledgement: capability
* registration, progress tokens and "please refresh" requests. Anything else
* (window/showMessageRequest, workspace/applyEdit, ...) is answered with
* MethodNotFound because we cannot honour it.
*/
const ACKNOWLEDGED_SERVER_REQUESTS = new Set([
	"client/registerCapability",
	"client/unregisterCapability",
	"window/workDoneProgress/create",
	"workspace/codeLens/refresh",
	"workspace/diagnostic/refresh",
	"workspace/foldingRange/refresh",
	"workspace/inlayHint/refresh",
	"workspace/inlineValue/refresh",
	"workspace/semanticTokens/refresh"
]);
var ConnectionHandler = class {
	constructor(state) {
		this.state = state;
	}
	processBuffer() {
		while (this.state.buffer.length > 0) {
			if (this.state.contentLength === -1) {
				const headerEnd = this.state.buffer.indexOf("\r\n\r\n");
				if (headerEnd === -1) return;
				const header = this.state.buffer.substring(0, headerEnd);
				const contentLengthMatch = header.match(/Content-Length: (\d+)/);
				if (!contentLengthMatch) {
					debug("Invalid LSP header:", header);
					this.state.buffer = this.state.buffer.substring(headerEnd + 4);
					continue;
				}
				this.state.contentLength = parseInt(contentLengthMatch[1], 10);
				this.state.buffer = this.state.buffer.substring(headerEnd + 4);
			}
			if (this.state.buffer.length < this.state.contentLength) return;
			const messageBody = this.state.buffer.substring(0, this.state.contentLength);
			this.state.buffer = this.state.buffer.substring(this.state.contentLength);
			this.state.contentLength = -1;
			try {
				const message = JSON.parse(messageBody);
				this.handleMessage(message);
			} catch (error$2) {
				debug("Failed to parse LSP message:", messageBody, error$2);
			}
		}
	}
	handleMessage(message) {
		debug("[LSP message]", message.method || `Response #${message.id}`, message.method ? "notification/request" : "response");
		if (isLSPResponse(message)) this.handleResponse(message);
		else if (isLSPNotification(message) || isLSPRequest(message)) this.handleNotificationOrRequest(message);
	}
	handleResponse(message) {
		const handler = this.state.responseHandlers.get(message.id);
		debug(`[LSP response] id=${message.id}, has handler=${!!handler}, pending handlers=${Array.from(this.state.responseHandlers.keys()).join(", ")}`);
		if (handler) {
			if (handler.timer) clearTimeout(handler.timer);
			this.state.responseHandlers.delete(message.id);
			if (message.error) handler.reject(new Error(message.error.message));
			else handler.resolve(message.result);
		} else debug(`[LSP response] No handler found for response id ${message.id}`);
	}
	handleNotificationOrRequest(message) {
		if (message.method === "textDocument/publishDiagnostics" && message.params) {
			const params = message.params;
			if (params?.uri && params?.diagnostics) {
				const validDiagnostics = params.diagnostics.filter((d) => d && d.range);
				this.state.diagnostics.set(params.uri, validDiagnostics);
				this.state.eventEmitter.emit("diagnostics", {
					...params,
					diagnostics: validDiagnostics
				});
			}
		}
		if (isLSPRequest(message) && message.method === "workspace/configuration" && message.params) {
			const params = message.params;
			const configurations = params.items.map((item) => {
				if (item.section === "deno") return {
					enable: true,
					lint: true,
					unstable: true
				};
				return {};
			});
			this.sendResponse(message.id, configurations);
		} else if (isLSPRequest(message)) if (ACKNOWLEDGED_SERVER_REQUESTS.has(message.method)) this.sendResponse(message.id, null);
		else this.sendError(message.id, -32601, `Method not found: ${message.method}`);
		this.state.eventEmitter.emit("message", message);
	}
	sendMessage(message) {
		if (!this.state.process) throw new Error("LSP server not started");
		const content = JSON.stringify(message);
		const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
		this.state.process.stdin?.write(header + content);
	}
	sendRequest(method, params, timeout = 3e4) {
		return new Promise((resolve$1, reject) => {
			const id = ++this.state.messageId;
			const request = {
				jsonrpc: "2.0",
				id,
				method,
				params
			};
			const timer = setTimeout(() => {
				this.state.responseHandlers.delete(id);
				reject(new Error(`LSP request timeout: ${method}`));
			}, timeout);
			this.state.responseHandlers.set(id, {
				resolve: resolve$1,
				reject,
				timer
			});
			this.sendMessage(request);
		});
	}
	sendNotification(method, params) {
		const notification = {
			jsonrpc: "2.0",
			method,
			params
		};
		this.sendMessage(notification);
	}
	sendError(id, code, message) {
		const response = {
			jsonrpc: "2.0",
			id,
			error: {
				code,
				message
			}
		};
		this.sendMessage(response);
	}
	sendResponse(id, result) {
		const response = {
			jsonrpc: "2.0",
			id,
			result
		};
		this.sendMessage(response);
	}
};

//#endregion
//#region packages/lsp-client/src/utils/helpers.ts
function getServerCharacteristics(languageId, customCharacteristics) {
	if (customCharacteristics) return {
		readinessCheckTimeout: customCharacteristics.readinessCheckTimeout || 500,
		supportsDidSave: customCharacteristics.supportsDidSave,
		requiresFileWatching: customCharacteristics.requiresFileWatching
	};
	const defaults = {
		typescript: {
			readinessCheckTimeout: 1e3,
			supportsDidSave: true
		},
		javascript: {
			readinessCheckTimeout: 1e3,
			supportsDidSave: true
		},
		python: {
			readinessCheckTimeout: 2e3,
			supportsDidSave: true
		},
		rust: {
			readinessCheckTimeout: 3e3,
			supportsDidSave: true,
			requiresFileWatching: true
		},
		go: {
			readinessCheckTimeout: 1500,
			supportsDidSave: true
		},
		default: { readinessCheckTimeout: 500 }
	};
	return defaults[languageId] || defaults.default;
}

//#endregion
//#region packages/lsp-client/src/core/lifecycle.ts
var LifecycleManager = class {
	constructor(state, connection, config) {
		this.state = state;
		this.connection = connection;
		this.config = config;
	}
	async initialize() {
		const initParams = this.buildInitializeParams();
		debug("[lspClient] Sending initialize request:", JSON.stringify(initParams, null, 2));
		const initResult = await this.connection.sendRequest("initialize", initParams);
		this.state.serverCapabilities = initResult.capabilities;
		this.connection.sendNotification("initialized", {});
		await this.waitForServerReady();
	}
	buildInitializeParams() {
		return {
			processId: process.pid,
			clientInfo: {
				name: this.config.clientName || "lsp-client",
				version: this.config.clientVersion || "0.1.0"
			},
			locale: "en",
			rootPath: this.state.rootPath,
			rootUri: `file://${this.state.rootPath}`,
			workspaceFolders: [{
				uri: `file://${this.state.rootPath}`,
				name: this.state.rootPath.split("/").pop() || "workspace"
			}],
			capabilities: {
				textDocument: {
					synchronization: {
						dynamicRegistration: false,
						willSave: false,
						willSaveWaitUntil: false,
						didSave: true
					},
					publishDiagnostics: { relatedInformation: true },
					definition: { linkSupport: true },
					references: {},
					hover: { contentFormat: ["markdown", "plaintext"] },
					completion: { completionItem: { snippetSupport: true } },
					documentSymbol: { hierarchicalDocumentSymbolSupport: true }
				},
				workspace: {
					workspaceFolders: true,
					configuration: true
				}
			},
			initializationOptions: this.config.initializationOptions
		};
	}
	async waitForServerReady() {
		const characteristics = getServerCharacteristics(this.state.languageId, this.state.serverCharacteristics);
		await new Promise((resolve$1) => setTimeout(resolve$1, characteristics.readinessCheckTimeout));
	}
	async start() {
		if (!this.state.process) throw new Error("No process provided to LSP client");
		let stderrBuffer = "";
		let processExitPromise = null;
		processExitPromise = new Promise((resolve$1, reject) => {
			this.state.process.once("exit", (code) => {
				this.state.process = null;
				if (code !== 0 && code !== null) {
					const stderr = stderrBuffer.trim();
					const errorDetails = stderr ? `\nStderr output:\n${stderr}` : "";
					const error$2 = new Error(`LSP server exited unexpectedly with code ${code}${errorDetails}`);
					reject(error$2);
				} else resolve$1();
			});
			this.state.process.once("error", (error$2) => {
				this.state.process = null;
				reject(new Error(`LSP server process error: ${error$2.message}`));
			});
		});
		this.state.process.stdout?.on("data", (data) => {
			this.state.buffer += data.toString();
			this.connection.processBuffer();
		});
		this.state.process.stderr?.on("data", (data) => {
			stderrBuffer += data.toString();
			const lines = data.toString().split("\n").filter((line) => line.trim());
			for (const line of lines) debug(`[LSP stderr] ${line}`);
		});
		try {
			await Promise.race([this.initialize(), processExitPromise]);
			this.state.process?.removeAllListeners("exit");
			this.state.process?.removeAllListeners("error");
			this.state.process?.on("exit", (code) => {
				this.state.process = null;
				if (code !== 0 && code !== null) debug(`[LSP] Server exited with code ${code}`);
			});
			this.state.process?.on("error", (error$2) => {
				debug(`[LSP] Server error: ${error$2.message}`);
			});
		} catch (error$2) {
			const context = {
				operation: "LSP initialization",
				language: this.state.languageId,
				stderr: stderrBuffer.trim()
			};
			if (this.state.process && !this.state.process.killed) this.state.process.kill();
			throw new Error(error$2 instanceof Error ? error$2.message : formatError$1(error$2, context));
		}
	}
	async stop() {
		if (this.state.process) {
			try {
				await this.connection.sendRequest("shutdown");
				this.connection.sendNotification("exit");
			} catch {}
			await new Promise((resolve$1) => setTimeout(resolve$1, 100));
			try {
				if (!this.state.process.killed) this.state.process.kill();
			} catch {}
			this.state.process = null;
		}
	}
	getServerCapabilities() {
		return this.state.serverCapabilities;
	}
};

//#endregion
//#region packages/lsp-client/src/managers/document-manager.ts
var DocumentManager = class {
	openDocuments = /* @__PURE__ */ new Set();
	documentVersions = /* @__PURE__ */ new Map();
	/**
	* Open a document in the LSP server
	*/
	openDocument(uri, content, sendNotification, languageId) {
		if (this.openDocuments.has(uri)) return;
		const params = { textDocument: {
			uri,
			languageId: languageId || "typescript",
			version: 1,
			text: content
		} };
		sendNotification("textDocument/didOpen", params);
		this.openDocuments.add(uri);
		this.documentVersions.set(uri, 1);
	}
	/**
	* Close a document in the LSP server
	*/
	closeDocument(uri, sendNotification) {
		if (!this.openDocuments.has(uri)) return;
		const params = { textDocument: { uri } };
		sendNotification("textDocument/didClose", params);
		this.openDocuments.delete(uri);
		this.documentVersions.delete(uri);
	}
	/**
	* Update document content
	*/
	updateDocument(uri, content, sendNotification, version) {
		if (!this.openDocuments.has(uri)) throw new Error(`Document ${uri} is not open`);
		const currentVersion = this.documentVersions.get(uri) || 1;
		const newVersion = version ?? currentVersion + 1;
		const params = {
			textDocument: {
				uri,
				version: newVersion
			},
			contentChanges: [{ text: content }]
		};
		sendNotification("textDocument/didChange", params);
		this.documentVersions.set(uri, newVersion);
	}
	/**
	* Check if a document is open
	*/
	isDocumentOpen(uri) {
		return this.openDocuments.has(uri);
	}
	/**
	* Get all open documents
	*/
	getOpenDocuments() {
		return Array.from(this.openDocuments);
	}
	/**
	* Close all documents
	*/
	closeAllDocuments(sendNotification) {
		for (const uri of this.openDocuments) this.closeDocument(uri, sendNotification);
	}
	/**
	* Get document version
	*/
	getDocumentVersion(uri) {
		return this.documentVersions.get(uri);
	}
};

//#endregion
//#region packages/lsp-client/src/managers/diagnostics.ts
const debugLog$1 = (message, ...args) => {
	debug(`[lspClient] ${message}`, ...args);
};
var DiagnosticsManager = class {
	diagnostics = /* @__PURE__ */ new Map();
	eventEmitter;
	constructor(eventEmitter) {
		this.eventEmitter = eventEmitter;
	}
	/**
	* Handle incoming diagnostics from the server
	*/
	handlePublishDiagnostics(params) {
		debugLog$1("Received diagnostics:", {
			uri: params.uri,
			count: params.diagnostics?.length || 0
		});
		this.diagnostics.set(params.uri, params.diagnostics || []);
		this.eventEmitter.emit("diagnostics", params);
	}
	/**
	* Get stored diagnostics for a document
	*/
	getDiagnostics(uri) {
		return this.diagnostics.get(uri) || [];
	}
	/**
	* Clear diagnostics for a document
	*/
	clearDiagnostics(uri) {
		this.diagnostics.delete(uri);
	}
	/**
	* Clear all diagnostics
	*/
	clearAllDiagnostics() {
		this.diagnostics.clear();
	}
	/**
	* Wait for diagnostics to arrive (event-driven)
	*/
	waitForDiagnostics(fileUri, timeout = 2e3) {
		return new Promise((resolve$1, reject) => {
			let timeoutId;
			const diagnosticsHandler = (params) => {
				if (params.uri === fileUri) {
					if (timeoutId) clearTimeout(timeoutId);
					this.eventEmitter.off("diagnostics", diagnosticsHandler);
					resolve$1(params.diagnostics || []);
				}
			};
			timeoutId = setTimeout(() => {
				this.eventEmitter.off("diagnostics", diagnosticsHandler);
				reject(new Error(`Timeout waiting for diagnostics for ${fileUri}`));
			}, timeout);
			this.eventEmitter.on("diagnostics", diagnosticsHandler);
		});
	}
	/**
	* Get diagnostic support information from server capabilities
	*/
	static getDiagnosticSupport(serverCapabilities) {
		if (!serverCapabilities) return {
			pushDiagnostics: true,
			pullDiagnostics: false
		};
		const hasPullDiagnostics = !!(serverCapabilities.diagnosticProvider || serverCapabilities.textDocument?.diagnostic);
		const hasPushDiagnostics = true;
		return {
			pushDiagnostics: hasPushDiagnostics,
			pullDiagnostics: hasPullDiagnostics
		};
	}
	/**
	* Pull diagnostics from the server (LSP 3.17+)
	*/
	async pullDiagnostics(uri, sendRequest) {
		try {
			const params = { textDocument: { uri } };
			const result = await sendRequest("textDocument/diagnostic", params);
			if (result.kind === "full" && result.items) {
				this.diagnostics.set(uri, result.items);
				return result.items;
			}
			return [];
		} catch (error$2) {
			debugLog$1("Pull diagnostics not supported:", error$2);
			return this.getDiagnostics(uri);
		}
	}
};

//#endregion
//#region packages/lsp-client/src/commands/types.ts
/**
* Utility function to convert LocationLink to Location
*/
function locationLinkToLocation(link) {
	return {
		uri: link.targetUri,
		range: link.targetSelectionRange || link.targetRange
	};
}
/**
* Type guards
*/
function isLocationLink(obj) {
	return typeof obj === "object" && obj !== null && "targetUri" in obj && "targetRange" in obj;
}
function isLocationLinkArray(obj) {
	return Array.isArray(obj) && obj.length > 0 && isLocationLink(obj[0]);
}
function isCompletionList(obj) {
	return typeof obj === "object" && obj !== null && "items" in obj && Array.isArray(obj.items);
}

//#endregion
//#region packages/lsp-client/src/commands/definition.ts
function createDefinitionCommand() {
	return {
		method: "textDocument/definition",
		buildParams(input) {
			return {
				textDocument: { uri: input.uri },
				position: input.position
			};
		},
		processResponse(response) {
			if (!response) return [];
			if (!Array.isArray(response)) return [response];
			if (isLocationLinkArray(response)) return response.map(locationLinkToLocation);
			return response;
		}
	};
}

//#endregion
//#region packages/lsp-client/src/commands/references.ts
function createReferencesCommand() {
	return {
		method: "textDocument/references",
		buildParams(input) {
			return {
				textDocument: { uri: input.uri },
				position: input.position,
				context: { includeDeclaration: input.includeDeclaration ?? true }
			};
		},
		processResponse(response) {
			return response ?? [];
		}
	};
}

//#endregion
//#region packages/lsp-client/src/commands/hover.ts
function createHoverCommand() {
	const normalizeContents = (contents) => {
		if (typeof contents === "string") return {
			kind: "markdown",
			value: contents
		};
		if (typeof contents === "object" && "value" in contents && !("kind" in contents)) return {
			kind: "markdown",
			value: contents.value
		};
		if (typeof contents === "object" && "kind" in contents) return contents;
		if (Array.isArray(contents)) {
			const combined = contents.map((c) => {
				if (typeof c === "string") return c;
				if ("value" in c) return c.value;
				return "";
			}).join("\n\n");
			return {
				kind: "markdown",
				value: combined
			};
		}
		return {
			kind: "plaintext",
			value: String(contents)
		};
	};
	return {
		method: "textDocument/hover",
		buildParams(input) {
			return {
				textDocument: { uri: input.uri },
				position: input.position
			};
		},
		processResponse(response) {
			if (!response) return null;
			const contents = normalizeContents(response.contents);
			return {
				contents,
				range: response.range
			};
		}
	};
}

//#endregion
//#region packages/lsp-client/src/commands/completion.ts
function createCompletionCommand() {
	return {
		method: "textDocument/completion",
		buildParams(input) {
			return {
				textDocument: { uri: input.uri },
				position: input.position
			};
		},
		processResponse(response) {
			if (!response) return [];
			if (isCompletionList(response)) return response.items;
			if (Array.isArray(response)) return response;
			return [];
		}
	};
}
function createCompletionResolveCommand() {
	return {
		method: "completionItem/resolve",
		buildParams(input) {
			return input;
		},
		processResponse(response) {
			return response || {};
		}
	};
}
/**
* Advanced completion handler with filtering capabilities
*/
function createAdvancedCompletionHandler(options = {}) {
	return { processCompletionItems: (items) => {
		if (!options.includeAutoImport) items = items.filter((item) => !isAutoImportItem(item));
		if (options.resolve) {}
		return items;
	} };
}
function isAutoImportItem(item) {
	return item.detail?.includes("Auto import") || item.labelDetails?.description?.includes("import") || false;
}

//#endregion
//#region packages/lsp-client/src/commands/documentSymbols.ts
function createDocumentSymbolsCommand() {
	return {
		method: "textDocument/documentSymbol",
		buildParams(input) {
			return { textDocument: { uri: input.uri } };
		},
		processResponse(response) {
			return response ?? [];
		}
	};
}

//#endregion
//#region packages/lsp-client/src/commands/diagnostics.ts
function createPullDiagnosticsCommand() {
	return {
		method: "textDocument/diagnostic",
		buildParams(input) {
			return {
				textDocument: { uri: input.uri },
				previousResultId: input.previousResultId
			};
		},
		processResponse(response) {
			if (!response) return [];
			const report = response;
			if (report.kind === "full" && report.items) return report.items;
			return [];
		}
	};
}

//#endregion
//#region packages/lsp-client/src/commands/formatting.ts
function createDocumentFormattingCommand() {
	return {
		method: "textDocument/formatting",
		buildParams(input) {
			return {
				textDocument: { uri: input.uri },
				options: input.options
			};
		},
		processResponse(response) {
			return response ?? [];
		}
	};
}
function createDocumentRangeFormattingCommand() {
	return {
		method: "textDocument/rangeFormatting",
		buildParams(input) {
			return {
				textDocument: { uri: input.uri },
				range: input.range,
				options: input.options
			};
		},
		processResponse(response) {
			return response ?? [];
		}
	};
}

//#endregion
//#region packages/lsp-client/src/commands/rename.ts
function createPrepareRenameCommand() {
	return {
		method: "textDocument/prepareRename",
		buildParams(input) {
			return {
				textDocument: { uri: input.uri },
				position: input.position
			};
		},
		processResponse(response) {
			if (!response) return null;
			if (typeof response === "object" && "range" in response) return response.range;
			return response;
		}
	};
}
function createRenameCommand() {
	return {
		method: "textDocument/rename",
		buildParams(input) {
			return {
				textDocument: { uri: input.uri },
				position: input.position,
				newName: input.newName
			};
		},
		processResponse(response) {
			return response;
		}
	};
}

//#endregion
//#region packages/lsp-client/src/commands/codeAction.ts
function createCodeActionCommand() {
	return {
		method: "textDocument/codeAction",
		buildParams(input) {
			return {
				textDocument: { uri: input.uri },
				range: input.range,
				context: { diagnostics: input.diagnostics ?? [] }
			};
		},
		processResponse(response) {
			return response ?? [];
		}
	};
}

//#endregion
//#region packages/lsp-client/src/commands/signatureHelp.ts
function createSignatureHelpCommand() {
	return {
		method: "textDocument/signatureHelp",
		buildParams(input) {
			return {
				textDocument: { uri: input.uri },
				position: input.position
			};
		},
		processResponse(response) {
			return response;
		}
	};
}

//#endregion
//#region packages/lsp-client/src/utils/features.ts
function createFeatureCommands() {
	return {
		definition: createDefinitionCommand(),
		references: createReferencesCommand(),
		hover: createHoverCommand(),
		completion: createCompletionCommand(),
		completionResolve: createCompletionResolveCommand(),
		documentSymbols: createDocumentSymbolsCommand(),
		pullDiagnostics: createPullDiagnosticsCommand(),
		formatting: createDocumentFormattingCommand(),
		rangeFormatting: createDocumentRangeFormattingCommand(),
		prepareRename: createPrepareRenameCommand(),
		rename: createRenameCommand(),
		codeAction: createCodeActionCommand(),
		signatureHelp: createSignatureHelpCommand()
	};
}

//#endregion
//#region packages/lsp-client/src/utils/textEdits.ts
function applyTextEdits(text, edits) {
	const sortedEdits = [...edits].sort((a, b) => {
		if (a.range.start.line !== b.range.start.line) return b.range.start.line - a.range.start.line;
		return b.range.start.character - a.range.start.character;
	});
	let lines = text.split("\n");
	for (const edit of sortedEdits) {
		const startLine = edit.range.start.line;
		const startChar = edit.range.start.character;
		const endLine = edit.range.end.line;
		const endChar = edit.range.end.character;
		const beforeEdit = lines[startLine].substring(0, startChar) + edit.newText + lines[endLine].substring(endChar);
		const removedLines = endLine - startLine;
		lines.splice(startLine, removedLines + 1, ...beforeEdit.split("\n"));
	}
	return lines.join("\n");
}

//#endregion
//#region packages/lsp-client/src/managers/workspace.ts
async function applyWorkspaceEditManually(edit, fileSystemApi) {
	if (!edit.changes) return;
	for (const [uri, edits] of Object.entries(edit.changes)) {
		if (!edits || edits.length === 0) continue;
		const filePath = uri.startsWith("file://") ? uri.slice(7) : uri;
		const currentContent = await fileSystemApi.readFile(filePath);
		const newContent = applyTextEdits(currentContent, edits);
		await fileSystemApi.writeFile(filePath, newContent);
	}
}

//#endregion
//#region packages/lsp-client/src/utils/language.ts
function getLanguageIdFromPath$1(filePath) {
	const ext = path$2.extname(filePath).toLowerCase();
	const languageMap = {
		".ts": "typescript",
		".tsx": "typescriptreact",
		".js": "javascript",
		".jsx": "javascriptreact",
		".mjs": "javascript",
		".cjs": "javascript",
		".py": "python",
		".rs": "rust",
		".go": "go",
		".java": "java",
		".c": "c",
		".cpp": "cpp",
		".cc": "cpp",
		".cxx": "cpp",
		".h": "c",
		".hpp": "cpp",
		".cs": "csharp",
		".fs": "fsharp",
		".fsx": "fsharp",
		".fsi": "fsharp",
		".rb": "ruby",
		".php": "php",
		".swift": "swift",
		".kt": "kotlin",
		".scala": "scala",
		".r": "r",
		".R": "r",
		".lua": "lua",
		".dart": "dart",
		".elm": "elm",
		".clj": "clojure",
		".cljs": "clojure",
		".ex": "elixir",
		".exs": "elixir",
		".erl": "erlang",
		".hrl": "erlang",
		".hs": "haskell",
		".lhs": "haskell",
		".ml": "ocaml",
		".mli": "ocaml",
		".vue": "vue",
		".svelte": "svelte",
		".json": "json",
		".jsonc": "jsonc",
		".yaml": "yaml",
		".yml": "yaml",
		".toml": "toml",
		".xml": "xml",
		".html": "html",
		".htm": "html",
		".css": "css",
		".scss": "scss",
		".sass": "sass",
		".less": "less",
		".md": "markdown",
		".markdown": "markdown",
		".rst": "restructuredtext",
		".tex": "latex",
		".sh": "shellscript",
		".bash": "shellscript",
		".zsh": "shellscript",
		".fish": "shellscript",
		".ps1": "powershell",
		".sql": "sql",
		".vim": "vim",
		".dockerfile": "dockerfile",
		".Dockerfile": "dockerfile",
		".makefile": "makefile",
		".Makefile": "makefile",
		".cmake": "cmake",
		".zig": "zig",
		".nim": "nim",
		".nims": "nim",
		".v": "v",
		".vsh": "v"
	};
	const basename = path$2.basename(filePath).toLowerCase();
	if (basename === "dockerfile" || basename.startsWith("dockerfile.")) return "dockerfile";
	if (basename === "makefile" || basename === "gnumakefile") return "makefile";
	if (basename === "cmakelists.txt") return "cmake";
	return languageMap[ext];
}

//#endregion
//#region packages/lsp-client/src/core/client.ts
function createLSPClient(config) {
	const state = createInitialState(config);
	const connection = new ConnectionHandler(state);
	const lifecycle = new LifecycleManager(state, connection, config);
	const documentManager = new DocumentManager();
	const diagnosticsManager = new DiagnosticsManager(state.eventEmitter);
	const commands = createFeatureCommands();
	const client = {
		languageId: state.languageId,
		rootPath: state.rootPath,
		fileSystemApi: state.fileSystemApi,
		start: () => lifecycle.start(),
		stop: () => lifecycle.stop(),
		isInitialized: () => state.serverCapabilities !== void 0,
		supportsFeature: (feature) => {
			if (!state.serverCapabilities) return false;
			const caps = state.serverCapabilities;
			switch (feature) {
				case "hover": return !!caps.hoverProvider;
				case "completion": return !!caps.completionProvider;
				case "definition": return !!caps.definitionProvider;
				case "references": return !!caps.referencesProvider;
				case "rename": return !!caps.renameProvider;
				case "documentSymbol": return !!caps.documentSymbolProvider;
				case "workspaceSymbol": return !!caps.workspaceSymbolProvider;
				case "codeAction": return !!caps.codeActionProvider;
				case "formatting": return !!caps.documentFormattingProvider;
				case "rangeFormatting": return !!caps.documentRangeFormattingProvider;
				case "signatureHelp": return !!caps.signatureHelpProvider;
				case "diagnostics": return true;
				default: return false;
			}
		},
		openDocument(uri, text, languageId) {
			const actualLanguageId = languageId || getLanguageIdFromPath$1(uri) || state.languageId;
			documentManager.openDocument(uri, text, connection.sendNotification.bind(connection), actualLanguageId);
		},
		closeDocument(uri) {
			documentManager.closeDocument(uri, connection.sendNotification.bind(connection));
			diagnosticsManager.clearDiagnostics(uri);
		},
		updateDocument(uri, text, version) {
			documentManager.updateDocument(uri, text, connection.sendNotification.bind(connection), version);
		},
		isDocumentOpen(uri) {
			return documentManager.isDocumentOpen(uri);
		},
		async findReferences(uri, position) {
			const params = commands.references.buildParams({
				uri,
				position,
				includeDeclaration: true
			});
			const result = await connection.sendRequest(commands.references.method, params);
			return commands.references.processResponse(result);
		},
		async getDefinition(uri, position) {
			const params = commands.definition.buildParams({
				uri,
				position
			});
			debug("[lspClient] Sending textDocument/definition request:", JSON.stringify(params, null, 2));
			const result = await connection.sendRequest(commands.definition.method, params);
			debug("[lspClient] Received definition response:", JSON.stringify(result, null, 2));
			return commands.definition.processResponse(result);
		},
		async getHover(uri, position) {
			const params = commands.hover.buildParams({
				uri,
				position
			});
			const result = await connection.sendRequest(commands.hover.method, params);
			return commands.hover.processResponse(result);
		},
		getDiagnostics(uri) {
			return diagnosticsManager.getDiagnostics(uri);
		},
		async pullDiagnostics(uri) {
			return diagnosticsManager.pullDiagnostics(uri, connection.sendRequest.bind(connection));
		},
		async getDocumentSymbols(uri) {
			try {
				const params = commands.documentSymbols.buildParams({ uri });
				const result = await connection.sendRequest(commands.documentSymbols.method, params);
				return commands.documentSymbols.processResponse(result);
			} catch (error$2) {
				const errorMessage = error$2 instanceof Error ? error$2.message : String(error$2);
				if (errorMessage.includes("Unhandled method") || errorMessage.includes("Method not found")) {
					debug("LSP server doesn't support document symbols");
					throw new Error("Document symbols not supported by this language server");
				}
				throw error$2;
			}
		},
		async getWorkspaceSymbols(query) {
			const params = { query };
			const result = await connection.sendRequest("workspace/symbol", params);
			return result ?? [];
		},
		async getCompletion(uri, position) {
			const params = commands.completion.buildParams({
				uri,
				position
			});
			const result = await connection.sendRequest(commands.completion.method, params);
			return commands.completion.processResponse(result);
		},
		async resolveCompletionItem(item) {
			const params = commands.completionResolve.buildParams(item);
			const result = await connection.sendRequest(commands.completionResolve.method, params);
			return commands.completionResolve.processResponse(result) || item;
		},
		async getSignatureHelp(uri, position) {
			const params = commands.signatureHelp.buildParams({
				uri,
				position
			});
			const result = await connection.sendRequest(commands.signatureHelp.method, params);
			return commands.signatureHelp.processResponse(result);
		},
		async getCodeActions(uri, range, context) {
			const params = commands.codeAction.buildParams({
				uri,
				range,
				diagnostics: context?.diagnostics
			});
			const result = await connection.sendRequest(commands.codeAction.method, params);
			return commands.codeAction.processResponse(result);
		},
		async formatDocument(uri, options) {
			const params = commands.formatting.buildParams({
				uri,
				options
			});
			const result = await connection.sendRequest(commands.formatting.method, params);
			return commands.formatting.processResponse(result);
		},
		async formatRange(uri, range, options) {
			const params = commands.rangeFormatting.buildParams({
				uri,
				range,
				options
			});
			const result = await connection.sendRequest(commands.rangeFormatting.method, params);
			return commands.rangeFormatting.processResponse(result);
		},
		async prepareRename(uri, position) {
			const params = commands.prepareRename.buildParams({
				uri,
				position
			});
			try {
				const result = await connection.sendRequest(commands.prepareRename.method, params);
				return commands.prepareRename.processResponse(result);
			} catch {
				return null;
			}
		},
		async rename(uri, position, newName) {
			const params = commands.rename.buildParams({
				uri,
				position,
				newName
			});
			try {
				const result = await connection.sendRequest(commands.rename.method, params);
				return commands.rename.processResponse(result);
			} catch (error$2) {
				const errorMessage = error$2 instanceof Error ? error$2.message : String(error$2);
				if (errorMessage.includes("Unhandled method") || errorMessage.includes("Method not found")) {
					debug("LSP server doesn't support rename");
					return null;
				}
				throw error$2;
			}
		},
		async applyEdit(edit, label) {
			try {
				const params = {
					edit,
					label
				};
				const result = await connection.sendRequest("workspace/applyEdit", params);
				return result ?? {
					applied: false,
					failureReason: "No response from server"
				};
			} catch (error$2) {
				const errorMessage = error$2 instanceof Error ? error$2.message : String(error$2);
				if (errorMessage.includes("Unhandled method") || errorMessage.includes("Method not found")) {
					debug("LSP server doesn't support workspace/applyEdit, applying edits manually");
					try {
						await applyWorkspaceEditManually(edit, state.fileSystemApi);
						return { applied: true };
					} catch (err) {
						return {
							applied: false,
							failureReason: `Failed to apply edits manually: ${err instanceof Error ? err.message : String(err)}`
						};
					}
				}
				throw error$2;
			}
		},
		sendRequest: connection.sendRequest.bind(connection),
		on(event, listener) {
			state.eventEmitter.on(event, listener);
		},
		emit(event, ...args) {
			return state.eventEmitter.emit(event, ...args);
		},
		waitForDiagnostics(fileUri, timeout = 2e3) {
			return diagnosticsManager.waitForDiagnostics(fileUri, timeout);
		},
		getDiagnosticSupport() {
			return DiagnosticsManager.getDiagnosticSupport(state.serverCapabilities);
		},
		getServerCapabilities() {
			return lifecycle.getServerCapabilities();
		}
	};
	return client;
}
async function createAndInitializeLSPClient(rootPath, process$1, languageId, initializationOptions, serverCharacteristics, fileSystemApi) {
	const client = createLSPClient({
		rootPath,
		process: process$1,
		languageId,
		initializationOptions,
		serverCharacteristics,
		fileSystemApi
	});
	await client.start();
	return client;
}

//#endregion
//#region node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/is.js
var require_is$1 = __commonJS({ "node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/is.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.stringArray = exports.array = exports.func = exports.error = exports.number = exports.string = exports.boolean = void 0;
	function boolean$1(value) {
		return value === true || value === false;
	}
	exports.boolean = boolean$1;
	function string$1(value) {
		return typeof value === "string" || value instanceof String;
	}
	exports.string = string$1;
	function number$1(value) {
		return typeof value === "number" || value instanceof Number;
	}
	exports.number = number$1;
	function error$1(value) {
		return value instanceof Error;
	}
	exports.error = error$1;
	function func$1(value) {
		return typeof value === "function";
	}
	exports.func = func$1;
	function array$1(value) {
		return Array.isArray(value);
	}
	exports.array = array$1;
	function stringArray$1(value) {
		return array$1(value) && value.every((elem) => string$1(elem));
	}
	exports.stringArray = stringArray$1;
} });

//#endregion
//#region node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/messages.js
var require_messages$1 = __commonJS({ "node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/messages.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Message = exports.NotificationType9 = exports.NotificationType8 = exports.NotificationType7 = exports.NotificationType6 = exports.NotificationType5 = exports.NotificationType4 = exports.NotificationType3 = exports.NotificationType2 = exports.NotificationType1 = exports.NotificationType0 = exports.NotificationType = exports.RequestType9 = exports.RequestType8 = exports.RequestType7 = exports.RequestType6 = exports.RequestType5 = exports.RequestType4 = exports.RequestType3 = exports.RequestType2 = exports.RequestType1 = exports.RequestType = exports.RequestType0 = exports.AbstractMessageSignature = exports.ParameterStructures = exports.ResponseError = exports.ErrorCodes = void 0;
	const is = require_is$1();
	/**
	* Predefined error codes.
	*/
	var ErrorCodes;
	(function(ErrorCodes$1) {
		ErrorCodes$1.ParseError = -32700;
		ErrorCodes$1.InvalidRequest = -32600;
		ErrorCodes$1.MethodNotFound = -32601;
		ErrorCodes$1.InvalidParams = -32602;
		ErrorCodes$1.InternalError = -32603;
		/**
		* This is the start range of JSON RPC reserved error codes.
		* It doesn't denote a real error code. No application error codes should
		* be defined between the start and end range. For backwards
		* compatibility the `ServerNotInitialized` and the `UnknownErrorCode`
		* are left in the range.
		*
		* @since 3.16.0
		*/
		ErrorCodes$1.jsonrpcReservedErrorRangeStart = -32099;
		/** @deprecated use  jsonrpcReservedErrorRangeStart */
		ErrorCodes$1.serverErrorStart = -32099;
		/**
		* An error occurred when write a message to the transport layer.
		*/
		ErrorCodes$1.MessageWriteError = -32099;
		/**
		* An error occurred when reading a message from the transport layer.
		*/
		ErrorCodes$1.MessageReadError = -32098;
		/**
		* The connection got disposed or lost and all pending responses got
		* rejected.
		*/
		ErrorCodes$1.PendingResponseRejected = -32097;
		/**
		* The connection is inactive and a use of it failed.
		*/
		ErrorCodes$1.ConnectionInactive = -32096;
		/**
		* Error code indicating that a server received a notification or
		* request before the server has received the `initialize` request.
		*/
		ErrorCodes$1.ServerNotInitialized = -32002;
		ErrorCodes$1.UnknownErrorCode = -32001;
		/**
		* This is the end range of JSON RPC reserved error codes.
		* It doesn't denote a real error code.
		*
		* @since 3.16.0
		*/
		ErrorCodes$1.jsonrpcReservedErrorRangeEnd = -32e3;
		/** @deprecated use  jsonrpcReservedErrorRangeEnd */
		ErrorCodes$1.serverErrorEnd = -32e3;
	})(ErrorCodes || (exports.ErrorCodes = ErrorCodes = {}));
	/**
	* An error object return in a response in case a request
	* has failed.
	*/
	var ResponseError = class ResponseError extends Error {
		constructor(code, message, data) {
			super(message);
			this.code = is.number(code) ? code : ErrorCodes.UnknownErrorCode;
			this.data = data;
			Object.setPrototypeOf(this, ResponseError.prototype);
		}
		toJson() {
			const result = {
				code: this.code,
				message: this.message
			};
			if (this.data !== void 0) result.data = this.data;
			return result;
		}
	};
	exports.ResponseError = ResponseError;
	var ParameterStructures = class ParameterStructures {
		constructor(kind) {
			this.kind = kind;
		}
		static is(value) {
			return value === ParameterStructures.auto || value === ParameterStructures.byName || value === ParameterStructures.byPosition;
		}
		toString() {
			return this.kind;
		}
	};
	exports.ParameterStructures = ParameterStructures;
	/**
	* The parameter structure is automatically inferred on the number of parameters
	* and the parameter type in case of a single param.
	*/
	ParameterStructures.auto = new ParameterStructures("auto");
	/**
	* Forces `byPosition` parameter structure. This is useful if you have a single
	* parameter which has a literal type.
	*/
	ParameterStructures.byPosition = new ParameterStructures("byPosition");
	/**
	* Forces `byName` parameter structure. This is only useful when having a single
	* parameter. The library will report errors if used with a different number of
	* parameters.
	*/
	ParameterStructures.byName = new ParameterStructures("byName");
	/**
	* An abstract implementation of a MessageType.
	*/
	var AbstractMessageSignature = class {
		constructor(method, numberOfParams) {
			this.method = method;
			this.numberOfParams = numberOfParams;
		}
		get parameterStructures() {
			return ParameterStructures.auto;
		}
	};
	exports.AbstractMessageSignature = AbstractMessageSignature;
	/**
	* Classes to type request response pairs
	*/
	var RequestType0 = class extends AbstractMessageSignature {
		constructor(method) {
			super(method, 0);
		}
	};
	exports.RequestType0 = RequestType0;
	var RequestType = class extends AbstractMessageSignature {
		constructor(method, _parameterStructures = ParameterStructures.auto) {
			super(method, 1);
			this._parameterStructures = _parameterStructures;
		}
		get parameterStructures() {
			return this._parameterStructures;
		}
	};
	exports.RequestType = RequestType;
	var RequestType1 = class extends AbstractMessageSignature {
		constructor(method, _parameterStructures = ParameterStructures.auto) {
			super(method, 1);
			this._parameterStructures = _parameterStructures;
		}
		get parameterStructures() {
			return this._parameterStructures;
		}
	};
	exports.RequestType1 = RequestType1;
	var RequestType2 = class extends AbstractMessageSignature {
		constructor(method) {
			super(method, 2);
		}
	};
	exports.RequestType2 = RequestType2;
	var RequestType3 = class extends AbstractMessageSignature {
		constructor(method) {
			super(method, 3);
		}
	};
	exports.RequestType3 = RequestType3;
	var RequestType4 = class extends AbstractMessageSignature {
		constructor(method) {
			super(method, 4);
		}
	};
	exports.RequestType4 = RequestType4;
	var RequestType5 = class extends AbstractMessageSignature {
		constructor(method) {
			super(method, 5);
		}
	};
	exports.RequestType5 = RequestType5;
	var RequestType6 = class extends AbstractMessageSignature {
		constructor(method) {
			super(method, 6);
		}
	};
	exports.RequestType6 = RequestType6;
	var RequestType7 = class extends AbstractMessageSignature {
		constructor(method) {
			super(method, 7);
		}
	};
	exports.RequestType7 = RequestType7;
	var RequestType8 = class extends AbstractMessageSignature {
		constructor(method) {
			super(method, 8);
		}
	};
	exports.RequestType8 = RequestType8;
	var RequestType9 = class extends AbstractMessageSignature {
		constructor(method) {
			super(method, 9);
		}
	};
	exports.RequestType9 = RequestType9;
	var NotificationType = class extends AbstractMessageSignature {
		constructor(method, _parameterStructures = ParameterStructures.auto) {
			super(method, 1);
			this._parameterStructures = _parameterStructures;
		}
		get parameterStructures() {
			return this._parameterStructures;
		}
	};
	exports.NotificationType = NotificationType;
	var NotificationType0 = class extends AbstractMessageSignature {
		constructor(method) {
			super(method, 0);
		}
	};
	exports.NotificationType0 = NotificationType0;
	var NotificationType1 = class extends AbstractMessageSignature {
		constructor(method, _parameterStructures = ParameterStructures.auto) {
			super(method, 1);
			this._parameterStructures = _parameterStructures;
		}
		get parameterStructures() {
			return this._parameterStructures;
		}
	};
	exports.NotificationType1 = NotificationType1;
	var NotificationType2 = class extends AbstractMessageSignature {
		constructor(method) {
			super(method, 2);
		}
	};
	exports.NotificationType2 = NotificationType2;
	var NotificationType3 = class extends AbstractMessageSignature {
		constructor(method) {
			super(method, 3);
		}
	};
	exports.NotificationType3 = NotificationType3;
	var NotificationType4 = class extends AbstractMessageSignature {
		constructor(method) {
			super(method, 4);
		}
	};
	exports.NotificationType4 = NotificationType4;
	var NotificationType5 = class extends AbstractMessageSignature {
		constructor(method) {
			super(method, 5);
		}
	};
	exports.NotificationType5 = NotificationType5;
	var NotificationType6 = class extends AbstractMessageSignature {
		constructor(method) {
			super(method, 6);
		}
	};
	exports.NotificationType6 = NotificationType6;
	var NotificationType7 = class extends AbstractMessageSignature {
		constructor(method) {
			super(method, 7);
		}
	};
	exports.NotificationType7 = NotificationType7;
	var NotificationType8 = class extends AbstractMessageSignature {
		constructor(method) {
			super(method, 8);
		}
	};
	exports.NotificationType8 = NotificationType8;
	var NotificationType9 = class extends AbstractMessageSignature {
		constructor(method) {
			super(method, 9);
		}
	};
	exports.NotificationType9 = NotificationType9;
	var Message;
	(function(Message$1) {
		/**
		* Tests if the given message is a request message
		*/
		function isRequest(message) {
			const candidate = message;
			return candidate && is.string(candidate.method) && (is.string(candidate.id) || is.number(candidate.id));
		}
		Message$1.isRequest = isRequest;
		/**
		* Tests if the given message is a notification message
		*/
		function isNotification(message) {
			const candidate = message;
			return candidate && is.string(candidate.method) && message.id === void 0;
		}
		Message$1.isNotification = isNotification;
		/**
		* Tests if the given message is a response message
		*/
		function isResponse(message) {
			const candidate = message;
			return candidate && (candidate.result !== void 0 || !!candidate.error) && (is.string(candidate.id) || is.number(candidate.id) || candidate.id === null);
		}
		Message$1.isResponse = isResponse;
	})(Message || (exports.Message = Message = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/linkedMap.js
var require_linkedMap = __commonJS({ "node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/linkedMap.js"(exports) {
	var _a;
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.LRUCache = exports.LinkedMap = exports.Touch = void 0;
	var Touch;
	(function(Touch$1) {
		Touch$1.None = 0;
		Touch$1.First = 1;
		Touch$1.AsOld = Touch$1.First;
		Touch$1.Last = 2;
		Touch$1.AsNew = Touch$1.Last;
	})(Touch || (exports.Touch = Touch = {}));
	var LinkedMap = class {
		constructor() {
			this[_a] = "LinkedMap";
			this._map = /* @__PURE__ */ new Map();
			this._head = void 0;
			this._tail = void 0;
			this._size = 0;
			this._state = 0;
		}
		clear() {
			this._map.clear();
			this._head = void 0;
			this._tail = void 0;
			this._size = 0;
			this._state++;
		}
		isEmpty() {
			return !this._head && !this._tail;
		}
		get size() {
			return this._size;
		}
		get first() {
			return this._head?.value;
		}
		get last() {
			return this._tail?.value;
		}
		has(key) {
			return this._map.has(key);
		}
		get(key, touch = Touch.None) {
			const item = this._map.get(key);
			if (!item) return void 0;
			if (touch !== Touch.None) this.touch(item, touch);
			return item.value;
		}
		set(key, value, touch = Touch.None) {
			let item = this._map.get(key);
			if (item) {
				item.value = value;
				if (touch !== Touch.None) this.touch(item, touch);
			} else {
				item = {
					key,
					value,
					next: void 0,
					previous: void 0
				};
				switch (touch) {
					case Touch.None:
						this.addItemLast(item);
						break;
					case Touch.First:
						this.addItemFirst(item);
						break;
					case Touch.Last:
						this.addItemLast(item);
						break;
					default:
						this.addItemLast(item);
						break;
				}
				this._map.set(key, item);
				this._size++;
			}
			return this;
		}
		delete(key) {
			return !!this.remove(key);
		}
		remove(key) {
			const item = this._map.get(key);
			if (!item) return void 0;
			this._map.delete(key);
			this.removeItem(item);
			this._size--;
			return item.value;
		}
		shift() {
			if (!this._head && !this._tail) return void 0;
			if (!this._head || !this._tail) throw new Error("Invalid list");
			const item = this._head;
			this._map.delete(item.key);
			this.removeItem(item);
			this._size--;
			return item.value;
		}
		forEach(callbackfn, thisArg) {
			const state = this._state;
			let current = this._head;
			while (current) {
				if (thisArg) callbackfn.bind(thisArg)(current.value, current.key, this);
				else callbackfn(current.value, current.key, this);
				if (this._state !== state) throw new Error(`LinkedMap got modified during iteration.`);
				current = current.next;
			}
		}
		keys() {
			const state = this._state;
			let current = this._head;
			const iterator = {
				[Symbol.iterator]: () => {
					return iterator;
				},
				next: () => {
					if (this._state !== state) throw new Error(`LinkedMap got modified during iteration.`);
					if (current) {
						const result = {
							value: current.key,
							done: false
						};
						current = current.next;
						return result;
					} else return {
						value: void 0,
						done: true
					};
				}
			};
			return iterator;
		}
		values() {
			const state = this._state;
			let current = this._head;
			const iterator = {
				[Symbol.iterator]: () => {
					return iterator;
				},
				next: () => {
					if (this._state !== state) throw new Error(`LinkedMap got modified during iteration.`);
					if (current) {
						const result = {
							value: current.value,
							done: false
						};
						current = current.next;
						return result;
					} else return {
						value: void 0,
						done: true
					};
				}
			};
			return iterator;
		}
		entries() {
			const state = this._state;
			let current = this._head;
			const iterator = {
				[Symbol.iterator]: () => {
					return iterator;
				},
				next: () => {
					if (this._state !== state) throw new Error(`LinkedMap got modified during iteration.`);
					if (current) {
						const result = {
							value: [current.key, current.value],
							done: false
						};
						current = current.next;
						return result;
					} else return {
						value: void 0,
						done: true
					};
				}
			};
			return iterator;
		}
		[(_a = Symbol.toStringTag, Symbol.iterator)]() {
			return this.entries();
		}
		trimOld(newSize) {
			if (newSize >= this.size) return;
			if (newSize === 0) {
				this.clear();
				return;
			}
			let current = this._head;
			let currentSize = this.size;
			while (current && currentSize > newSize) {
				this._map.delete(current.key);
				current = current.next;
				currentSize--;
			}
			this._head = current;
			this._size = currentSize;
			if (current) current.previous = void 0;
			this._state++;
		}
		addItemFirst(item) {
			if (!this._head && !this._tail) this._tail = item;
			else if (!this._head) throw new Error("Invalid list");
			else {
				item.next = this._head;
				this._head.previous = item;
			}
			this._head = item;
			this._state++;
		}
		addItemLast(item) {
			if (!this._head && !this._tail) this._head = item;
			else if (!this._tail) throw new Error("Invalid list");
			else {
				item.previous = this._tail;
				this._tail.next = item;
			}
			this._tail = item;
			this._state++;
		}
		removeItem(item) {
			if (item === this._head && item === this._tail) {
				this._head = void 0;
				this._tail = void 0;
			} else if (item === this._head) {
				if (!item.next) throw new Error("Invalid list");
				item.next.previous = void 0;
				this._head = item.next;
			} else if (item === this._tail) {
				if (!item.previous) throw new Error("Invalid list");
				item.previous.next = void 0;
				this._tail = item.previous;
			} else {
				const next = item.next;
				const previous = item.previous;
				if (!next || !previous) throw new Error("Invalid list");
				next.previous = previous;
				previous.next = next;
			}
			item.next = void 0;
			item.previous = void 0;
			this._state++;
		}
		touch(item, touch) {
			if (!this._head || !this._tail) throw new Error("Invalid list");
			if (touch !== Touch.First && touch !== Touch.Last) return;
			if (touch === Touch.First) {
				if (item === this._head) return;
				const next = item.next;
				const previous = item.previous;
				if (item === this._tail) {
					previous.next = void 0;
					this._tail = previous;
				} else {
					next.previous = previous;
					previous.next = next;
				}
				item.previous = void 0;
				item.next = this._head;
				this._head.previous = item;
				this._head = item;
				this._state++;
			} else if (touch === Touch.Last) {
				if (item === this._tail) return;
				const next = item.next;
				const previous = item.previous;
				if (item === this._head) {
					next.previous = void 0;
					this._head = next;
				} else {
					next.previous = previous;
					previous.next = next;
				}
				item.next = void 0;
				item.previous = this._tail;
				this._tail.next = item;
				this._tail = item;
				this._state++;
			}
		}
		toJSON() {
			const data = [];
			this.forEach((value, key) => {
				data.push([key, value]);
			});
			return data;
		}
		fromJSON(data) {
			this.clear();
			for (const [key, value] of data) this.set(key, value);
		}
	};
	exports.LinkedMap = LinkedMap;
	var LRUCache = class extends LinkedMap {
		constructor(limit, ratio = 1) {
			super();
			this._limit = limit;
			this._ratio = Math.min(Math.max(0, ratio), 1);
		}
		get limit() {
			return this._limit;
		}
		set limit(limit) {
			this._limit = limit;
			this.checkTrim();
		}
		get ratio() {
			return this._ratio;
		}
		set ratio(ratio) {
			this._ratio = Math.min(Math.max(0, ratio), 1);
			this.checkTrim();
		}
		get(key, touch = Touch.AsNew) {
			return super.get(key, touch);
		}
		peek(key) {
			return super.get(key, Touch.None);
		}
		set(key, value) {
			super.set(key, value, Touch.Last);
			this.checkTrim();
			return this;
		}
		checkTrim() {
			if (this.size > this._limit) this.trimOld(Math.round(this._limit * this._ratio));
		}
	};
	exports.LRUCache = LRUCache;
} });

//#endregion
//#region node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/disposable.js
var require_disposable = __commonJS({ "node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/disposable.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Disposable = void 0;
	var Disposable;
	(function(Disposable$1) {
		function create(func$2) {
			return { dispose: func$2 };
		}
		Disposable$1.create = create;
	})(Disposable || (exports.Disposable = Disposable = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/ral.js
var require_ral = __commonJS({ "node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/ral.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	let _ral;
	function RAL() {
		if (_ral === void 0) throw new Error(`No runtime abstraction layer installed`);
		return _ral;
	}
	(function(RAL$1) {
		function install(ral) {
			if (ral === void 0) throw new Error(`No runtime abstraction layer provided`);
			_ral = ral;
		}
		RAL$1.install = install;
	})(RAL || (RAL = {}));
	exports.default = RAL;
} });

//#endregion
//#region node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/events.js
var require_events = __commonJS({ "node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/events.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Emitter = exports.Event = void 0;
	const ral_1$6 = require_ral();
	var Event;
	(function(Event$1) {
		const _disposable = { dispose() {} };
		Event$1.None = function() {
			return _disposable;
		};
	})(Event || (exports.Event = Event = {}));
	var CallbackList = class {
		add(callback, context = null, bucket) {
			if (!this._callbacks) {
				this._callbacks = [];
				this._contexts = [];
			}
			this._callbacks.push(callback);
			this._contexts.push(context);
			if (Array.isArray(bucket)) bucket.push({ dispose: () => this.remove(callback, context) });
		}
		remove(callback, context = null) {
			if (!this._callbacks) return;
			let foundCallbackWithDifferentContext = false;
			for (let i = 0, len = this._callbacks.length; i < len; i++) if (this._callbacks[i] === callback) if (this._contexts[i] === context) {
				this._callbacks.splice(i, 1);
				this._contexts.splice(i, 1);
				return;
			} else foundCallbackWithDifferentContext = true;
			if (foundCallbackWithDifferentContext) throw new Error("When adding a listener with a context, you should remove it with the same context");
		}
		invoke(...args) {
			if (!this._callbacks) return [];
			const ret = [], callbacks = this._callbacks.slice(0), contexts = this._contexts.slice(0);
			for (let i = 0, len = callbacks.length; i < len; i++) try {
				ret.push(callbacks[i].apply(contexts[i], args));
			} catch (e) {
				(0, ral_1$6.default)().console.error(e);
			}
			return ret;
		}
		isEmpty() {
			return !this._callbacks || this._callbacks.length === 0;
		}
		dispose() {
			this._callbacks = void 0;
			this._contexts = void 0;
		}
	};
	var Emitter = class Emitter {
		constructor(_options) {
			this._options = _options;
		}
		/**
		* For the public to allow to subscribe
		* to events from this Emitter
		*/
		get event() {
			if (!this._event) this._event = (listener, thisArgs, disposables) => {
				if (!this._callbacks) this._callbacks = new CallbackList();
				if (this._options && this._options.onFirstListenerAdd && this._callbacks.isEmpty()) this._options.onFirstListenerAdd(this);
				this._callbacks.add(listener, thisArgs);
				const result = { dispose: () => {
					if (!this._callbacks) return;
					this._callbacks.remove(listener, thisArgs);
					result.dispose = Emitter._noop;
					if (this._options && this._options.onLastListenerRemove && this._callbacks.isEmpty()) this._options.onLastListenerRemove(this);
				} };
				if (Array.isArray(disposables)) disposables.push(result);
				return result;
			};
			return this._event;
		}
		/**
		* To be kept private to fire an event to
		* subscribers
		*/
		fire(event) {
			if (this._callbacks) this._callbacks.invoke.call(this._callbacks, event);
		}
		dispose() {
			if (this._callbacks) {
				this._callbacks.dispose();
				this._callbacks = void 0;
			}
		}
	};
	exports.Emitter = Emitter;
	Emitter._noop = function() {};
} });

//#endregion
//#region node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/cancellation.js
var require_cancellation = __commonJS({ "node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/cancellation.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.CancellationTokenSource = exports.CancellationToken = void 0;
	const ral_1$5 = require_ral();
	const Is$6 = require_is$1();
	const events_1$4 = require_events();
	var CancellationToken;
	(function(CancellationToken$1) {
		CancellationToken$1.None = Object.freeze({
			isCancellationRequested: false,
			onCancellationRequested: events_1$4.Event.None
		});
		CancellationToken$1.Cancelled = Object.freeze({
			isCancellationRequested: true,
			onCancellationRequested: events_1$4.Event.None
		});
		function is$1(value) {
			const candidate = value;
			return candidate && (candidate === CancellationToken$1.None || candidate === CancellationToken$1.Cancelled || Is$6.boolean(candidate.isCancellationRequested) && !!candidate.onCancellationRequested);
		}
		CancellationToken$1.is = is$1;
	})(CancellationToken || (exports.CancellationToken = CancellationToken = {}));
	const shortcutEvent = Object.freeze(function(callback, context) {
		const handle = (0, ral_1$5.default)().timer.setTimeout(callback.bind(context), 0);
		return { dispose() {
			handle.dispose();
		} };
	});
	var MutableToken = class {
		constructor() {
			this._isCancelled = false;
		}
		cancel() {
			if (!this._isCancelled) {
				this._isCancelled = true;
				if (this._emitter) {
					this._emitter.fire(void 0);
					this.dispose();
				}
			}
		}
		get isCancellationRequested() {
			return this._isCancelled;
		}
		get onCancellationRequested() {
			if (this._isCancelled) return shortcutEvent;
			if (!this._emitter) this._emitter = new events_1$4.Emitter();
			return this._emitter.event;
		}
		dispose() {
			if (this._emitter) {
				this._emitter.dispose();
				this._emitter = void 0;
			}
		}
	};
	var CancellationTokenSource = class {
		get token() {
			if (!this._token) this._token = new MutableToken();
			return this._token;
		}
		cancel() {
			if (!this._token) this._token = CancellationToken.Cancelled;
			else this._token.cancel();
		}
		dispose() {
			if (!this._token) this._token = CancellationToken.None;
			else if (this._token instanceof MutableToken) this._token.dispose();
		}
	};
	exports.CancellationTokenSource = CancellationTokenSource;
} });

//#endregion
//#region node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/sharedArrayCancellation.js
var require_sharedArrayCancellation = __commonJS({ "node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/sharedArrayCancellation.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.SharedArrayReceiverStrategy = exports.SharedArraySenderStrategy = void 0;
	const cancellation_1$2 = require_cancellation();
	var CancellationState;
	(function(CancellationState$1) {
		CancellationState$1.Continue = 0;
		CancellationState$1.Cancelled = 1;
	})(CancellationState || (CancellationState = {}));
	var SharedArraySenderStrategy = class {
		constructor() {
			this.buffers = /* @__PURE__ */ new Map();
		}
		enableCancellation(request) {
			if (request.id === null) return;
			const buffer = new SharedArrayBuffer(4);
			const data = new Int32Array(buffer, 0, 1);
			data[0] = CancellationState.Continue;
			this.buffers.set(request.id, buffer);
			request.$cancellationData = buffer;
		}
		async sendCancellation(_conn, id) {
			const buffer = this.buffers.get(id);
			if (buffer === void 0) return;
			const data = new Int32Array(buffer, 0, 1);
			Atomics.store(data, 0, CancellationState.Cancelled);
		}
		cleanup(id) {
			this.buffers.delete(id);
		}
		dispose() {
			this.buffers.clear();
		}
	};
	exports.SharedArraySenderStrategy = SharedArraySenderStrategy;
	var SharedArrayBufferCancellationToken = class {
		constructor(buffer) {
			this.data = new Int32Array(buffer, 0, 1);
		}
		get isCancellationRequested() {
			return Atomics.load(this.data, 0) === CancellationState.Cancelled;
		}
		get onCancellationRequested() {
			throw new Error(`Cancellation over SharedArrayBuffer doesn't support cancellation events`);
		}
	};
	var SharedArrayBufferCancellationTokenSource = class {
		constructor(buffer) {
			this.token = new SharedArrayBufferCancellationToken(buffer);
		}
		cancel() {}
		dispose() {}
	};
	var SharedArrayReceiverStrategy = class {
		constructor() {
			this.kind = "request";
		}
		createCancellationTokenSource(request) {
			const buffer = request.$cancellationData;
			if (buffer === void 0) return new cancellation_1$2.CancellationTokenSource();
			return new SharedArrayBufferCancellationTokenSource(buffer);
		}
	};
	exports.SharedArrayReceiverStrategy = SharedArrayReceiverStrategy;
} });

//#endregion
//#region node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/semaphore.js
var require_semaphore = __commonJS({ "node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/semaphore.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Semaphore = void 0;
	const ral_1$4 = require_ral();
	var Semaphore = class {
		constructor(capacity = 1) {
			if (capacity <= 0) throw new Error("Capacity must be greater than 0");
			this._capacity = capacity;
			this._active = 0;
			this._waiting = [];
		}
		lock(thunk) {
			return new Promise((resolve$1, reject) => {
				this._waiting.push({
					thunk,
					resolve: resolve$1,
					reject
				});
				this.runNext();
			});
		}
		get active() {
			return this._active;
		}
		runNext() {
			if (this._waiting.length === 0 || this._active === this._capacity) return;
			(0, ral_1$4.default)().timer.setImmediate(() => this.doRunNext());
		}
		doRunNext() {
			if (this._waiting.length === 0 || this._active === this._capacity) return;
			const next = this._waiting.shift();
			this._active++;
			if (this._active > this._capacity) throw new Error(`To many thunks active`);
			try {
				const result = next.thunk();
				if (result instanceof Promise) result.then((value) => {
					this._active--;
					next.resolve(value);
					this.runNext();
				}, (err) => {
					this._active--;
					next.reject(err);
					this.runNext();
				});
				else {
					this._active--;
					next.resolve(result);
					this.runNext();
				}
			} catch (err) {
				this._active--;
				next.reject(err);
				this.runNext();
			}
		}
	};
	exports.Semaphore = Semaphore;
} });

//#endregion
//#region node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/messageReader.js
var require_messageReader = __commonJS({ "node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/messageReader.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ReadableStreamMessageReader = exports.AbstractMessageReader = exports.MessageReader = void 0;
	const ral_1$3 = require_ral();
	const Is$5 = require_is$1();
	const events_1$3 = require_events();
	const semaphore_1$1 = require_semaphore();
	var MessageReader;
	(function(MessageReader$1) {
		function is$1(value) {
			let candidate = value;
			return candidate && Is$5.func(candidate.listen) && Is$5.func(candidate.dispose) && Is$5.func(candidate.onError) && Is$5.func(candidate.onClose) && Is$5.func(candidate.onPartialMessage);
		}
		MessageReader$1.is = is$1;
	})(MessageReader || (exports.MessageReader = MessageReader = {}));
	var AbstractMessageReader = class {
		constructor() {
			this.errorEmitter = new events_1$3.Emitter();
			this.closeEmitter = new events_1$3.Emitter();
			this.partialMessageEmitter = new events_1$3.Emitter();
		}
		dispose() {
			this.errorEmitter.dispose();
			this.closeEmitter.dispose();
		}
		get onError() {
			return this.errorEmitter.event;
		}
		fireError(error$2) {
			this.errorEmitter.fire(this.asError(error$2));
		}
		get onClose() {
			return this.closeEmitter.event;
		}
		fireClose() {
			this.closeEmitter.fire(void 0);
		}
		get onPartialMessage() {
			return this.partialMessageEmitter.event;
		}
		firePartialMessage(info) {
			this.partialMessageEmitter.fire(info);
		}
		asError(error$2) {
			if (error$2 instanceof Error) return error$2;
			else return new Error(`Reader received error. Reason: ${Is$5.string(error$2.message) ? error$2.message : "unknown"}`);
		}
	};
	exports.AbstractMessageReader = AbstractMessageReader;
	var ResolvedMessageReaderOptions;
	(function(ResolvedMessageReaderOptions$1) {
		function fromOptions(options) {
			let charset;
			let result;
			let contentDecoder;
			const contentDecoders = /* @__PURE__ */ new Map();
			let contentTypeDecoder;
			const contentTypeDecoders = /* @__PURE__ */ new Map();
			if (options === void 0 || typeof options === "string") charset = options ?? "utf-8";
			else {
				charset = options.charset ?? "utf-8";
				if (options.contentDecoder !== void 0) {
					contentDecoder = options.contentDecoder;
					contentDecoders.set(contentDecoder.name, contentDecoder);
				}
				if (options.contentDecoders !== void 0) for (const decoder of options.contentDecoders) contentDecoders.set(decoder.name, decoder);
				if (options.contentTypeDecoder !== void 0) {
					contentTypeDecoder = options.contentTypeDecoder;
					contentTypeDecoders.set(contentTypeDecoder.name, contentTypeDecoder);
				}
				if (options.contentTypeDecoders !== void 0) for (const decoder of options.contentTypeDecoders) contentTypeDecoders.set(decoder.name, decoder);
			}
			if (contentTypeDecoder === void 0) {
				contentTypeDecoder = (0, ral_1$3.default)().applicationJson.decoder;
				contentTypeDecoders.set(contentTypeDecoder.name, contentTypeDecoder);
			}
			return {
				charset,
				contentDecoder,
				contentDecoders,
				contentTypeDecoder,
				contentTypeDecoders
			};
		}
		ResolvedMessageReaderOptions$1.fromOptions = fromOptions;
	})(ResolvedMessageReaderOptions || (ResolvedMessageReaderOptions = {}));
	var ReadableStreamMessageReader = class extends AbstractMessageReader {
		constructor(readable, options) {
			super();
			this.readable = readable;
			this.options = ResolvedMessageReaderOptions.fromOptions(options);
			this.buffer = (0, ral_1$3.default)().messageBuffer.create(this.options.charset);
			this._partialMessageTimeout = 1e4;
			this.nextMessageLength = -1;
			this.messageToken = 0;
			this.readSemaphore = new semaphore_1$1.Semaphore(1);
		}
		set partialMessageTimeout(timeout) {
			this._partialMessageTimeout = timeout;
		}
		get partialMessageTimeout() {
			return this._partialMessageTimeout;
		}
		listen(callback) {
			this.nextMessageLength = -1;
			this.messageToken = 0;
			this.partialMessageTimer = void 0;
			this.callback = callback;
			const result = this.readable.onData((data) => {
				this.onData(data);
			});
			this.readable.onError((error$2) => this.fireError(error$2));
			this.readable.onClose(() => this.fireClose());
			return result;
		}
		onData(data) {
			try {
				this.buffer.append(data);
				while (true) {
					if (this.nextMessageLength === -1) {
						const headers = this.buffer.tryReadHeaders(true);
						if (!headers) return;
						const contentLength = headers.get("content-length");
						if (!contentLength) {
							this.fireError(new Error(`Header must provide a Content-Length property.\n${JSON.stringify(Object.fromEntries(headers))}`));
							return;
						}
						const length = parseInt(contentLength);
						if (isNaN(length)) {
							this.fireError(new Error(`Content-Length value must be a number. Got ${contentLength}`));
							return;
						}
						this.nextMessageLength = length;
					}
					const body = this.buffer.tryReadBody(this.nextMessageLength);
					if (body === void 0) {
						/** We haven't received the full message yet. */
						this.setPartialMessageTimer();
						return;
					}
					this.clearPartialMessageTimer();
					this.nextMessageLength = -1;
					this.readSemaphore.lock(async () => {
						const bytes = this.options.contentDecoder !== void 0 ? await this.options.contentDecoder.decode(body) : body;
						const message = await this.options.contentTypeDecoder.decode(bytes, this.options);
						this.callback(message);
					}).catch((error$2) => {
						this.fireError(error$2);
					});
				}
			} catch (error$2) {
				this.fireError(error$2);
			}
		}
		clearPartialMessageTimer() {
			if (this.partialMessageTimer) {
				this.partialMessageTimer.dispose();
				this.partialMessageTimer = void 0;
			}
		}
		setPartialMessageTimer() {
			this.clearPartialMessageTimer();
			if (this._partialMessageTimeout <= 0) return;
			this.partialMessageTimer = (0, ral_1$3.default)().timer.setTimeout((token, timeout) => {
				this.partialMessageTimer = void 0;
				if (token === this.messageToken) {
					this.firePartialMessage({
						messageToken: token,
						waitingTime: timeout
					});
					this.setPartialMessageTimer();
				}
			}, this._partialMessageTimeout, this.messageToken, this._partialMessageTimeout);
		}
	};
	exports.ReadableStreamMessageReader = ReadableStreamMessageReader;
} });

//#endregion
//#region node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/messageWriter.js
var require_messageWriter = __commonJS({ "node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/messageWriter.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.WriteableStreamMessageWriter = exports.AbstractMessageWriter = exports.MessageWriter = void 0;
	const ral_1$2 = require_ral();
	const Is$4 = require_is$1();
	const semaphore_1 = require_semaphore();
	const events_1$2 = require_events();
	const ContentLength = "Content-Length: ";
	const CRLF$1 = "\r\n";
	var MessageWriter;
	(function(MessageWriter$1) {
		function is$1(value) {
			let candidate = value;
			return candidate && Is$4.func(candidate.dispose) && Is$4.func(candidate.onClose) && Is$4.func(candidate.onError) && Is$4.func(candidate.write);
		}
		MessageWriter$1.is = is$1;
	})(MessageWriter || (exports.MessageWriter = MessageWriter = {}));
	var AbstractMessageWriter = class {
		constructor() {
			this.errorEmitter = new events_1$2.Emitter();
			this.closeEmitter = new events_1$2.Emitter();
		}
		dispose() {
			this.errorEmitter.dispose();
			this.closeEmitter.dispose();
		}
		get onError() {
			return this.errorEmitter.event;
		}
		fireError(error$2, message, count) {
			this.errorEmitter.fire([
				this.asError(error$2),
				message,
				count
			]);
		}
		get onClose() {
			return this.closeEmitter.event;
		}
		fireClose() {
			this.closeEmitter.fire(void 0);
		}
		asError(error$2) {
			if (error$2 instanceof Error) return error$2;
			else return new Error(`Writer received error. Reason: ${Is$4.string(error$2.message) ? error$2.message : "unknown"}`);
		}
	};
	exports.AbstractMessageWriter = AbstractMessageWriter;
	var ResolvedMessageWriterOptions;
	(function(ResolvedMessageWriterOptions$1) {
		function fromOptions(options) {
			if (options === void 0 || typeof options === "string") return {
				charset: options ?? "utf-8",
				contentTypeEncoder: (0, ral_1$2.default)().applicationJson.encoder
			};
			else return {
				charset: options.charset ?? "utf-8",
				contentEncoder: options.contentEncoder,
				contentTypeEncoder: options.contentTypeEncoder ?? (0, ral_1$2.default)().applicationJson.encoder
			};
		}
		ResolvedMessageWriterOptions$1.fromOptions = fromOptions;
	})(ResolvedMessageWriterOptions || (ResolvedMessageWriterOptions = {}));
	var WriteableStreamMessageWriter = class extends AbstractMessageWriter {
		constructor(writable, options) {
			super();
			this.writable = writable;
			this.options = ResolvedMessageWriterOptions.fromOptions(options);
			this.errorCount = 0;
			this.writeSemaphore = new semaphore_1.Semaphore(1);
			this.writable.onError((error$2) => this.fireError(error$2));
			this.writable.onClose(() => this.fireClose());
		}
		async write(msg) {
			return this.writeSemaphore.lock(async () => {
				const payload = this.options.contentTypeEncoder.encode(msg, this.options).then((buffer) => {
					if (this.options.contentEncoder !== void 0) return this.options.contentEncoder.encode(buffer);
					else return buffer;
				});
				return payload.then((buffer) => {
					const headers = [];
					headers.push(ContentLength, buffer.byteLength.toString(), CRLF$1);
					headers.push(CRLF$1);
					return this.doWrite(msg, headers, buffer);
				}, (error$2) => {
					this.fireError(error$2);
					throw error$2;
				});
			});
		}
		async doWrite(msg, headers, data) {
			try {
				await this.writable.write(headers.join(""), "ascii");
				return this.writable.write(data);
			} catch (error$2) {
				this.handleError(error$2, msg);
				return Promise.reject(error$2);
			}
		}
		handleError(error$2, msg) {
			this.errorCount++;
			this.fireError(error$2, msg, this.errorCount);
		}
		end() {
			this.writable.end();
		}
	};
	exports.WriteableStreamMessageWriter = WriteableStreamMessageWriter;
} });

//#endregion
//#region node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/messageBuffer.js
var require_messageBuffer = __commonJS({ "node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/messageBuffer.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.AbstractMessageBuffer = void 0;
	const CR = 13;
	const LF = 10;
	const CRLF = "\r\n";
	var AbstractMessageBuffer = class {
		constructor(encoding = "utf-8") {
			this._encoding = encoding;
			this._chunks = [];
			this._totalLength = 0;
		}
		get encoding() {
			return this._encoding;
		}
		append(chunk) {
			const toAppend = typeof chunk === "string" ? this.fromString(chunk, this._encoding) : chunk;
			this._chunks.push(toAppend);
			this._totalLength += toAppend.byteLength;
		}
		tryReadHeaders(lowerCaseKeys = false) {
			if (this._chunks.length === 0) return void 0;
			let state = 0;
			let chunkIndex = 0;
			let offset = 0;
			let chunkBytesRead = 0;
			row: while (chunkIndex < this._chunks.length) {
				const chunk = this._chunks[chunkIndex];
				offset = 0;
				column: while (offset < chunk.length) {
					const value = chunk[offset];
					switch (value) {
						case CR:
							switch (state) {
								case 0:
									state = 1;
									break;
								case 2:
									state = 3;
									break;
								default: state = 0;
							}
							break;
						case LF:
							switch (state) {
								case 1:
									state = 2;
									break;
								case 3:
									state = 4;
									offset++;
									break row;
								default: state = 0;
							}
							break;
						default: state = 0;
					}
					offset++;
				}
				chunkBytesRead += chunk.byteLength;
				chunkIndex++;
			}
			if (state !== 4) return void 0;
			const buffer = this._read(chunkBytesRead + offset);
			const result = /* @__PURE__ */ new Map();
			const headers = this.toString(buffer, "ascii").split(CRLF);
			if (headers.length < 2) return result;
			for (let i = 0; i < headers.length - 2; i++) {
				const header = headers[i];
				const index = header.indexOf(":");
				if (index === -1) throw new Error(`Message header must separate key and value using ':'\n${header}`);
				const key = header.substr(0, index);
				const value = header.substr(index + 1).trim();
				result.set(lowerCaseKeys ? key.toLowerCase() : key, value);
			}
			return result;
		}
		tryReadBody(length) {
			if (this._totalLength < length) return void 0;
			return this._read(length);
		}
		get numberOfBytes() {
			return this._totalLength;
		}
		_read(byteCount) {
			if (byteCount === 0) return this.emptyBuffer();
			if (byteCount > this._totalLength) throw new Error(`Cannot read so many bytes!`);
			if (this._chunks[0].byteLength === byteCount) {
				const chunk = this._chunks[0];
				this._chunks.shift();
				this._totalLength -= byteCount;
				return this.asNative(chunk);
			}
			if (this._chunks[0].byteLength > byteCount) {
				const chunk = this._chunks[0];
				const result$1 = this.asNative(chunk, byteCount);
				this._chunks[0] = chunk.slice(byteCount);
				this._totalLength -= byteCount;
				return result$1;
			}
			const result = this.allocNative(byteCount);
			let resultOffset = 0;
			let chunkIndex = 0;
			while (byteCount > 0) {
				const chunk = this._chunks[chunkIndex];
				if (chunk.byteLength > byteCount) {
					const chunkPart = chunk.slice(0, byteCount);
					result.set(chunkPart, resultOffset);
					resultOffset += byteCount;
					this._chunks[chunkIndex] = chunk.slice(byteCount);
					this._totalLength -= byteCount;
					byteCount -= byteCount;
				} else {
					result.set(chunk, resultOffset);
					resultOffset += chunk.byteLength;
					this._chunks.shift();
					this._totalLength -= chunk.byteLength;
					byteCount -= chunk.byteLength;
				}
			}
			return result;
		}
	};
	exports.AbstractMessageBuffer = AbstractMessageBuffer;
} });

//#endregion
//#region node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/connection.js
var require_connection$1 = __commonJS({ "node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/connection.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.createMessageConnection = exports.ConnectionOptions = exports.MessageStrategy = exports.CancellationStrategy = exports.CancellationSenderStrategy = exports.CancellationReceiverStrategy = exports.RequestCancellationReceiverStrategy = exports.IdCancellationReceiverStrategy = exports.ConnectionStrategy = exports.ConnectionError = exports.ConnectionErrors = exports.LogTraceNotification = exports.SetTraceNotification = exports.TraceFormat = exports.TraceValues = exports.Trace = exports.NullLogger = exports.ProgressType = exports.ProgressToken = void 0;
	const ral_1$1 = require_ral();
	const Is$3 = require_is$1();
	const messages_1$23 = require_messages$1();
	const linkedMap_1$1 = require_linkedMap();
	const events_1$1 = require_events();
	const cancellation_1$1 = require_cancellation();
	var CancelNotification;
	(function(CancelNotification$1) {
		CancelNotification$1.type = new messages_1$23.NotificationType("$/cancelRequest");
	})(CancelNotification || (CancelNotification = {}));
	var ProgressToken;
	(function(ProgressToken$1) {
		function is$1(value) {
			return typeof value === "string" || typeof value === "number";
		}
		ProgressToken$1.is = is$1;
	})(ProgressToken || (exports.ProgressToken = ProgressToken = {}));
	var ProgressNotification;
	(function(ProgressNotification$1) {
		ProgressNotification$1.type = new messages_1$23.NotificationType("$/progress");
	})(ProgressNotification || (ProgressNotification = {}));
	var ProgressType = class {
		constructor() {}
	};
	exports.ProgressType = ProgressType;
	var StarRequestHandler;
	(function(StarRequestHandler$1) {
		function is$1(value) {
			return Is$3.func(value);
		}
		StarRequestHandler$1.is = is$1;
	})(StarRequestHandler || (StarRequestHandler = {}));
	exports.NullLogger = Object.freeze({
		error: () => {},
		warn: () => {},
		info: () => {},
		log: () => {}
	});
	var Trace;
	(function(Trace$1) {
		Trace$1[Trace$1["Off"] = 0] = "Off";
		Trace$1[Trace$1["Messages"] = 1] = "Messages";
		Trace$1[Trace$1["Compact"] = 2] = "Compact";
		Trace$1[Trace$1["Verbose"] = 3] = "Verbose";
	})(Trace || (exports.Trace = Trace = {}));
	var TraceValues;
	(function(TraceValues$1) {
		/**
		* Turn tracing off.
		*/
		TraceValues$1.Off = "off";
		/**
		* Trace messages only.
		*/
		TraceValues$1.Messages = "messages";
		/**
		* Compact message tracing.
		*/
		TraceValues$1.Compact = "compact";
		/**
		* Verbose message tracing.
		*/
		TraceValues$1.Verbose = "verbose";
	})(TraceValues || (exports.TraceValues = TraceValues = {}));
	(function(Trace$1) {
		function fromString(value) {
			if (!Is$3.string(value)) return Trace$1.Off;
			value = value.toLowerCase();
			switch (value) {
				case "off": return Trace$1.Off;
				case "messages": return Trace$1.Messages;
				case "compact": return Trace$1.Compact;
				case "verbose": return Trace$1.Verbose;
				default: return Trace$1.Off;
			}
		}
		Trace$1.fromString = fromString;
		function toString(value) {
			switch (value) {
				case Trace$1.Off: return "off";
				case Trace$1.Messages: return "messages";
				case Trace$1.Compact: return "compact";
				case Trace$1.Verbose: return "verbose";
				default: return "off";
			}
		}
		Trace$1.toString = toString;
	})(Trace || (exports.Trace = Trace = {}));
	var TraceFormat;
	(function(TraceFormat$1) {
		TraceFormat$1["Text"] = "text";
		TraceFormat$1["JSON"] = "json";
	})(TraceFormat || (exports.TraceFormat = TraceFormat = {}));
	(function(TraceFormat$1) {
		function fromString(value) {
			if (!Is$3.string(value)) return TraceFormat$1.Text;
			value = value.toLowerCase();
			if (value === "json") return TraceFormat$1.JSON;
			else return TraceFormat$1.Text;
		}
		TraceFormat$1.fromString = fromString;
	})(TraceFormat || (exports.TraceFormat = TraceFormat = {}));
	var SetTraceNotification;
	(function(SetTraceNotification$1) {
		SetTraceNotification$1.type = new messages_1$23.NotificationType("$/setTrace");
	})(SetTraceNotification || (exports.SetTraceNotification = SetTraceNotification = {}));
	var LogTraceNotification;
	(function(LogTraceNotification$1) {
		LogTraceNotification$1.type = new messages_1$23.NotificationType("$/logTrace");
	})(LogTraceNotification || (exports.LogTraceNotification = LogTraceNotification = {}));
	var ConnectionErrors;
	(function(ConnectionErrors$1) {
		/**
		* The connection is closed.
		*/
		ConnectionErrors$1[ConnectionErrors$1["Closed"] = 1] = "Closed";
		/**
		* The connection got disposed.
		*/
		ConnectionErrors$1[ConnectionErrors$1["Disposed"] = 2] = "Disposed";
		/**
		* The connection is already in listening mode.
		*/
		ConnectionErrors$1[ConnectionErrors$1["AlreadyListening"] = 3] = "AlreadyListening";
	})(ConnectionErrors || (exports.ConnectionErrors = ConnectionErrors = {}));
	var ConnectionError = class ConnectionError extends Error {
		constructor(code, message) {
			super(message);
			this.code = code;
			Object.setPrototypeOf(this, ConnectionError.prototype);
		}
	};
	exports.ConnectionError = ConnectionError;
	var ConnectionStrategy;
	(function(ConnectionStrategy$1) {
		function is$1(value) {
			const candidate = value;
			return candidate && Is$3.func(candidate.cancelUndispatched);
		}
		ConnectionStrategy$1.is = is$1;
	})(ConnectionStrategy || (exports.ConnectionStrategy = ConnectionStrategy = {}));
	var IdCancellationReceiverStrategy;
	(function(IdCancellationReceiverStrategy$1) {
		function is$1(value) {
			const candidate = value;
			return candidate && (candidate.kind === void 0 || candidate.kind === "id") && Is$3.func(candidate.createCancellationTokenSource) && (candidate.dispose === void 0 || Is$3.func(candidate.dispose));
		}
		IdCancellationReceiverStrategy$1.is = is$1;
	})(IdCancellationReceiverStrategy || (exports.IdCancellationReceiverStrategy = IdCancellationReceiverStrategy = {}));
	var RequestCancellationReceiverStrategy;
	(function(RequestCancellationReceiverStrategy$1) {
		function is$1(value) {
			const candidate = value;
			return candidate && candidate.kind === "request" && Is$3.func(candidate.createCancellationTokenSource) && (candidate.dispose === void 0 || Is$3.func(candidate.dispose));
		}
		RequestCancellationReceiverStrategy$1.is = is$1;
	})(RequestCancellationReceiverStrategy || (exports.RequestCancellationReceiverStrategy = RequestCancellationReceiverStrategy = {}));
	var CancellationReceiverStrategy;
	(function(CancellationReceiverStrategy$1) {
		CancellationReceiverStrategy$1.Message = Object.freeze({ createCancellationTokenSource(_) {
			return new cancellation_1$1.CancellationTokenSource();
		} });
		function is$1(value) {
			return IdCancellationReceiverStrategy.is(value) || RequestCancellationReceiverStrategy.is(value);
		}
		CancellationReceiverStrategy$1.is = is$1;
	})(CancellationReceiverStrategy || (exports.CancellationReceiverStrategy = CancellationReceiverStrategy = {}));
	var CancellationSenderStrategy;
	(function(CancellationSenderStrategy$1) {
		CancellationSenderStrategy$1.Message = Object.freeze({
			sendCancellation(conn, id) {
				return conn.sendNotification(CancelNotification.type, { id });
			},
			cleanup(_) {}
		});
		function is$1(value) {
			const candidate = value;
			return candidate && Is$3.func(candidate.sendCancellation) && Is$3.func(candidate.cleanup);
		}
		CancellationSenderStrategy$1.is = is$1;
	})(CancellationSenderStrategy || (exports.CancellationSenderStrategy = CancellationSenderStrategy = {}));
	var CancellationStrategy;
	(function(CancellationStrategy$1) {
		CancellationStrategy$1.Message = Object.freeze({
			receiver: CancellationReceiverStrategy.Message,
			sender: CancellationSenderStrategy.Message
		});
		function is$1(value) {
			const candidate = value;
			return candidate && CancellationReceiverStrategy.is(candidate.receiver) && CancellationSenderStrategy.is(candidate.sender);
		}
		CancellationStrategy$1.is = is$1;
	})(CancellationStrategy || (exports.CancellationStrategy = CancellationStrategy = {}));
	var MessageStrategy;
	(function(MessageStrategy$1) {
		function is$1(value) {
			const candidate = value;
			return candidate && Is$3.func(candidate.handleMessage);
		}
		MessageStrategy$1.is = is$1;
	})(MessageStrategy || (exports.MessageStrategy = MessageStrategy = {}));
	var ConnectionOptions;
	(function(ConnectionOptions$1) {
		function is$1(value) {
			const candidate = value;
			return candidate && (CancellationStrategy.is(candidate.cancellationStrategy) || ConnectionStrategy.is(candidate.connectionStrategy) || MessageStrategy.is(candidate.messageStrategy));
		}
		ConnectionOptions$1.is = is$1;
	})(ConnectionOptions || (exports.ConnectionOptions = ConnectionOptions = {}));
	var ConnectionState;
	(function(ConnectionState$1) {
		ConnectionState$1[ConnectionState$1["New"] = 1] = "New";
		ConnectionState$1[ConnectionState$1["Listening"] = 2] = "Listening";
		ConnectionState$1[ConnectionState$1["Closed"] = 3] = "Closed";
		ConnectionState$1[ConnectionState$1["Disposed"] = 4] = "Disposed";
	})(ConnectionState || (ConnectionState = {}));
	function createMessageConnection$1(messageReader, messageWriter, _logger, options) {
		const logger = _logger !== void 0 ? _logger : exports.NullLogger;
		let sequenceNumber = 0;
		let notificationSequenceNumber = 0;
		let unknownResponseSequenceNumber = 0;
		const version = "2.0";
		let starRequestHandler = void 0;
		const requestHandlers = /* @__PURE__ */ new Map();
		let starNotificationHandler = void 0;
		const notificationHandlers = /* @__PURE__ */ new Map();
		const progressHandlers = /* @__PURE__ */ new Map();
		let timer;
		let messageQueue = new linkedMap_1$1.LinkedMap();
		let responsePromises = /* @__PURE__ */ new Map();
		let knownCanceledRequests = /* @__PURE__ */ new Set();
		let requestTokens = /* @__PURE__ */ new Map();
		let trace = Trace.Off;
		let traceFormat = TraceFormat.Text;
		let tracer;
		let state = ConnectionState.New;
		const errorEmitter = new events_1$1.Emitter();
		const closeEmitter = new events_1$1.Emitter();
		const unhandledNotificationEmitter = new events_1$1.Emitter();
		const unhandledProgressEmitter = new events_1$1.Emitter();
		const disposeEmitter = new events_1$1.Emitter();
		const cancellationStrategy = options && options.cancellationStrategy ? options.cancellationStrategy : CancellationStrategy.Message;
		function createRequestQueueKey(id) {
			if (id === null) throw new Error(`Can't send requests with id null since the response can't be correlated.`);
			return "req-" + id.toString();
		}
		function createResponseQueueKey(id) {
			if (id === null) return "res-unknown-" + (++unknownResponseSequenceNumber).toString();
			else return "res-" + id.toString();
		}
		function createNotificationQueueKey() {
			return "not-" + (++notificationSequenceNumber).toString();
		}
		function addMessageToQueue(queue, message) {
			if (messages_1$23.Message.isRequest(message)) queue.set(createRequestQueueKey(message.id), message);
			else if (messages_1$23.Message.isResponse(message)) queue.set(createResponseQueueKey(message.id), message);
			else queue.set(createNotificationQueueKey(), message);
		}
		function cancelUndispatched(_message) {
			return void 0;
		}
		function isListening() {
			return state === ConnectionState.Listening;
		}
		function isClosed() {
			return state === ConnectionState.Closed;
		}
		function isDisposed() {
			return state === ConnectionState.Disposed;
		}
		function closeHandler() {
			if (state === ConnectionState.New || state === ConnectionState.Listening) {
				state = ConnectionState.Closed;
				closeEmitter.fire(void 0);
			}
		}
		function readErrorHandler(error$2) {
			errorEmitter.fire([
				error$2,
				void 0,
				void 0
			]);
		}
		function writeErrorHandler(data) {
			errorEmitter.fire(data);
		}
		messageReader.onClose(closeHandler);
		messageReader.onError(readErrorHandler);
		messageWriter.onClose(closeHandler);
		messageWriter.onError(writeErrorHandler);
		function triggerMessageQueue() {
			if (timer || messageQueue.size === 0) return;
			timer = (0, ral_1$1.default)().timer.setImmediate(() => {
				timer = void 0;
				processMessageQueue();
			});
		}
		function handleMessage(message) {
			if (messages_1$23.Message.isRequest(message)) handleRequest(message);
			else if (messages_1$23.Message.isNotification(message)) handleNotification(message);
			else if (messages_1$23.Message.isResponse(message)) handleResponse(message);
			else handleInvalidMessage(message);
		}
		function processMessageQueue() {
			if (messageQueue.size === 0) return;
			const message = messageQueue.shift();
			try {
				const messageStrategy = options?.messageStrategy;
				if (MessageStrategy.is(messageStrategy)) messageStrategy.handleMessage(message, handleMessage);
				else handleMessage(message);
			} finally {
				triggerMessageQueue();
			}
		}
		const callback = (message) => {
			try {
				if (messages_1$23.Message.isNotification(message) && message.method === CancelNotification.type.method) {
					const cancelId = message.params.id;
					const key = createRequestQueueKey(cancelId);
					const toCancel = messageQueue.get(key);
					if (messages_1$23.Message.isRequest(toCancel)) {
						const strategy = options?.connectionStrategy;
						const response = strategy && strategy.cancelUndispatched ? strategy.cancelUndispatched(toCancel, cancelUndispatched) : cancelUndispatched(toCancel);
						if (response && (response.error !== void 0 || response.result !== void 0)) {
							messageQueue.delete(key);
							requestTokens.delete(cancelId);
							response.id = toCancel.id;
							traceSendingResponse(response, message.method, Date.now());
							messageWriter.write(response).catch(() => logger.error(`Sending response for canceled message failed.`));
							return;
						}
					}
					const cancellationToken = requestTokens.get(cancelId);
					if (cancellationToken !== void 0) {
						cancellationToken.cancel();
						traceReceivedNotification(message);
						return;
					} else knownCanceledRequests.add(cancelId);
				}
				addMessageToQueue(messageQueue, message);
			} finally {
				triggerMessageQueue();
			}
		};
		function handleRequest(requestMessage) {
			if (isDisposed()) return;
			function reply(resultOrError, method, startTime$1) {
				const message = {
					jsonrpc: version,
					id: requestMessage.id
				};
				if (resultOrError instanceof messages_1$23.ResponseError) message.error = resultOrError.toJson();
				else message.result = resultOrError === void 0 ? null : resultOrError;
				traceSendingResponse(message, method, startTime$1);
				messageWriter.write(message).catch(() => logger.error(`Sending response failed.`));
			}
			function replyError(error$2, method, startTime$1) {
				const message = {
					jsonrpc: version,
					id: requestMessage.id,
					error: error$2.toJson()
				};
				traceSendingResponse(message, method, startTime$1);
				messageWriter.write(message).catch(() => logger.error(`Sending response failed.`));
			}
			function replySuccess(result, method, startTime$1) {
				if (result === void 0) result = null;
				const message = {
					jsonrpc: version,
					id: requestMessage.id,
					result
				};
				traceSendingResponse(message, method, startTime$1);
				messageWriter.write(message).catch(() => logger.error(`Sending response failed.`));
			}
			traceReceivedRequest(requestMessage);
			const element = requestHandlers.get(requestMessage.method);
			let type;
			let requestHandler;
			if (element) {
				type = element.type;
				requestHandler = element.handler;
			}
			const startTime = Date.now();
			if (requestHandler || starRequestHandler) {
				const tokenKey = requestMessage.id ?? String(Date.now());
				const cancellationSource = IdCancellationReceiverStrategy.is(cancellationStrategy.receiver) ? cancellationStrategy.receiver.createCancellationTokenSource(tokenKey) : cancellationStrategy.receiver.createCancellationTokenSource(requestMessage);
				if (requestMessage.id !== null && knownCanceledRequests.has(requestMessage.id)) cancellationSource.cancel();
				if (requestMessage.id !== null) requestTokens.set(tokenKey, cancellationSource);
				try {
					let handlerResult;
					if (requestHandler) if (requestMessage.params === void 0) {
						if (type !== void 0 && type.numberOfParams !== 0) {
							replyError(new messages_1$23.ResponseError(messages_1$23.ErrorCodes.InvalidParams, `Request ${requestMessage.method} defines ${type.numberOfParams} params but received none.`), requestMessage.method, startTime);
							return;
						}
						handlerResult = requestHandler(cancellationSource.token);
					} else if (Array.isArray(requestMessage.params)) {
						if (type !== void 0 && type.parameterStructures === messages_1$23.ParameterStructures.byName) {
							replyError(new messages_1$23.ResponseError(messages_1$23.ErrorCodes.InvalidParams, `Request ${requestMessage.method} defines parameters by name but received parameters by position`), requestMessage.method, startTime);
							return;
						}
						handlerResult = requestHandler(...requestMessage.params, cancellationSource.token);
					} else {
						if (type !== void 0 && type.parameterStructures === messages_1$23.ParameterStructures.byPosition) {
							replyError(new messages_1$23.ResponseError(messages_1$23.ErrorCodes.InvalidParams, `Request ${requestMessage.method} defines parameters by position but received parameters by name`), requestMessage.method, startTime);
							return;
						}
						handlerResult = requestHandler(requestMessage.params, cancellationSource.token);
					}
					else if (starRequestHandler) handlerResult = starRequestHandler(requestMessage.method, requestMessage.params, cancellationSource.token);
					const promise = handlerResult;
					if (!handlerResult) {
						requestTokens.delete(tokenKey);
						replySuccess(handlerResult, requestMessage.method, startTime);
					} else if (promise.then) promise.then((resultOrError) => {
						requestTokens.delete(tokenKey);
						reply(resultOrError, requestMessage.method, startTime);
					}, (error$2) => {
						requestTokens.delete(tokenKey);
						if (error$2 instanceof messages_1$23.ResponseError) replyError(error$2, requestMessage.method, startTime);
						else if (error$2 && Is$3.string(error$2.message)) replyError(new messages_1$23.ResponseError(messages_1$23.ErrorCodes.InternalError, `Request ${requestMessage.method} failed with message: ${error$2.message}`), requestMessage.method, startTime);
						else replyError(new messages_1$23.ResponseError(messages_1$23.ErrorCodes.InternalError, `Request ${requestMessage.method} failed unexpectedly without providing any details.`), requestMessage.method, startTime);
					});
					else {
						requestTokens.delete(tokenKey);
						reply(handlerResult, requestMessage.method, startTime);
					}
				} catch (error$2) {
					requestTokens.delete(tokenKey);
					if (error$2 instanceof messages_1$23.ResponseError) reply(error$2, requestMessage.method, startTime);
					else if (error$2 && Is$3.string(error$2.message)) replyError(new messages_1$23.ResponseError(messages_1$23.ErrorCodes.InternalError, `Request ${requestMessage.method} failed with message: ${error$2.message}`), requestMessage.method, startTime);
					else replyError(new messages_1$23.ResponseError(messages_1$23.ErrorCodes.InternalError, `Request ${requestMessage.method} failed unexpectedly without providing any details.`), requestMessage.method, startTime);
				}
			} else replyError(new messages_1$23.ResponseError(messages_1$23.ErrorCodes.MethodNotFound, `Unhandled method ${requestMessage.method}`), requestMessage.method, startTime);
		}
		function handleResponse(responseMessage) {
			if (isDisposed()) return;
			if (responseMessage.id === null) if (responseMessage.error) logger.error(`Received response message without id: Error is: \n${JSON.stringify(responseMessage.error, void 0, 4)}`);
			else logger.error(`Received response message without id. No further error information provided.`);
			else {
				const key = responseMessage.id;
				const responsePromise = responsePromises.get(key);
				traceReceivedResponse(responseMessage, responsePromise);
				if (responsePromise !== void 0) {
					responsePromises.delete(key);
					try {
						if (responseMessage.error) {
							const error$2 = responseMessage.error;
							responsePromise.reject(new messages_1$23.ResponseError(error$2.code, error$2.message, error$2.data));
						} else if (responseMessage.result !== void 0) responsePromise.resolve(responseMessage.result);
						else throw new Error("Should never happen.");
					} catch (error$2) {
						if (error$2.message) logger.error(`Response handler '${responsePromise.method}' failed with message: ${error$2.message}`);
						else logger.error(`Response handler '${responsePromise.method}' failed unexpectedly.`);
					}
				}
			}
		}
		function handleNotification(message) {
			if (isDisposed()) return;
			let type = void 0;
			let notificationHandler;
			if (message.method === CancelNotification.type.method) {
				const cancelId = message.params.id;
				knownCanceledRequests.delete(cancelId);
				traceReceivedNotification(message);
				return;
			} else {
				const element = notificationHandlers.get(message.method);
				if (element) {
					notificationHandler = element.handler;
					type = element.type;
				}
			}
			if (notificationHandler || starNotificationHandler) try {
				traceReceivedNotification(message);
				if (notificationHandler) if (message.params === void 0) {
					if (type !== void 0) {
						if (type.numberOfParams !== 0 && type.parameterStructures !== messages_1$23.ParameterStructures.byName) logger.error(`Notification ${message.method} defines ${type.numberOfParams} params but received none.`);
					}
					notificationHandler();
				} else if (Array.isArray(message.params)) {
					const params = message.params;
					if (message.method === ProgressNotification.type.method && params.length === 2 && ProgressToken.is(params[0])) notificationHandler({
						token: params[0],
						value: params[1]
					});
					else {
						if (type !== void 0) {
							if (type.parameterStructures === messages_1$23.ParameterStructures.byName) logger.error(`Notification ${message.method} defines parameters by name but received parameters by position`);
							if (type.numberOfParams !== message.params.length) logger.error(`Notification ${message.method} defines ${type.numberOfParams} params but received ${params.length} arguments`);
						}
						notificationHandler(...params);
					}
				} else {
					if (type !== void 0 && type.parameterStructures === messages_1$23.ParameterStructures.byPosition) logger.error(`Notification ${message.method} defines parameters by position but received parameters by name`);
					notificationHandler(message.params);
				}
				else if (starNotificationHandler) starNotificationHandler(message.method, message.params);
			} catch (error$2) {
				if (error$2.message) logger.error(`Notification handler '${message.method}' failed with message: ${error$2.message}`);
				else logger.error(`Notification handler '${message.method}' failed unexpectedly.`);
			}
			else unhandledNotificationEmitter.fire(message);
		}
		function handleInvalidMessage(message) {
			if (!message) {
				logger.error("Received empty message.");
				return;
			}
			logger.error(`Received message which is neither a response nor a notification message:\n${JSON.stringify(message, null, 4)}`);
			const responseMessage = message;
			if (Is$3.string(responseMessage.id) || Is$3.number(responseMessage.id)) {
				const key = responseMessage.id;
				const responseHandler = responsePromises.get(key);
				if (responseHandler) responseHandler.reject(new Error("The received response has neither a result nor an error property."));
			}
		}
		function stringifyTrace(params) {
			if (params === void 0 || params === null) return void 0;
			switch (trace) {
				case Trace.Verbose: return JSON.stringify(params, null, 4);
				case Trace.Compact: return JSON.stringify(params);
				default: return void 0;
			}
		}
		function traceSendingRequest(message) {
			if (trace === Trace.Off || !tracer) return;
			if (traceFormat === TraceFormat.Text) {
				let data = void 0;
				if ((trace === Trace.Verbose || trace === Trace.Compact) && message.params) data = `Params: ${stringifyTrace(message.params)}\n\n`;
				tracer.log(`Sending request '${message.method} - (${message.id})'.`, data);
			} else logLSPMessage("send-request", message);
		}
		function traceSendingNotification(message) {
			if (trace === Trace.Off || !tracer) return;
			if (traceFormat === TraceFormat.Text) {
				let data = void 0;
				if (trace === Trace.Verbose || trace === Trace.Compact) if (message.params) data = `Params: ${stringifyTrace(message.params)}\n\n`;
				else data = "No parameters provided.\n\n";
				tracer.log(`Sending notification '${message.method}'.`, data);
			} else logLSPMessage("send-notification", message);
		}
		function traceSendingResponse(message, method, startTime) {
			if (trace === Trace.Off || !tracer) return;
			if (traceFormat === TraceFormat.Text) {
				let data = void 0;
				if (trace === Trace.Verbose || trace === Trace.Compact) {
					if (message.error && message.error.data) data = `Error data: ${stringifyTrace(message.error.data)}\n\n`;
					else if (message.result) data = `Result: ${stringifyTrace(message.result)}\n\n`;
					else if (message.error === void 0) data = "No result returned.\n\n";
				}
				tracer.log(`Sending response '${method} - (${message.id})'. Processing request took ${Date.now() - startTime}ms`, data);
			} else logLSPMessage("send-response", message);
		}
		function traceReceivedRequest(message) {
			if (trace === Trace.Off || !tracer) return;
			if (traceFormat === TraceFormat.Text) {
				let data = void 0;
				if ((trace === Trace.Verbose || trace === Trace.Compact) && message.params) data = `Params: ${stringifyTrace(message.params)}\n\n`;
				tracer.log(`Received request '${message.method} - (${message.id})'.`, data);
			} else logLSPMessage("receive-request", message);
		}
		function traceReceivedNotification(message) {
			if (trace === Trace.Off || !tracer || message.method === LogTraceNotification.type.method) return;
			if (traceFormat === TraceFormat.Text) {
				let data = void 0;
				if (trace === Trace.Verbose || trace === Trace.Compact) if (message.params) data = `Params: ${stringifyTrace(message.params)}\n\n`;
				else data = "No parameters provided.\n\n";
				tracer.log(`Received notification '${message.method}'.`, data);
			} else logLSPMessage("receive-notification", message);
		}
		function traceReceivedResponse(message, responsePromise) {
			if (trace === Trace.Off || !tracer) return;
			if (traceFormat === TraceFormat.Text) {
				let data = void 0;
				if (trace === Trace.Verbose || trace === Trace.Compact) {
					if (message.error && message.error.data) data = `Error data: ${stringifyTrace(message.error.data)}\n\n`;
					else if (message.result) data = `Result: ${stringifyTrace(message.result)}\n\n`;
					else if (message.error === void 0) data = "No result returned.\n\n";
				}
				if (responsePromise) {
					const error$2 = message.error ? ` Request failed: ${message.error.message} (${message.error.code}).` : "";
					tracer.log(`Received response '${responsePromise.method} - (${message.id})' in ${Date.now() - responsePromise.timerStart}ms.${error$2}`, data);
				} else tracer.log(`Received response ${message.id} without active response promise.`, data);
			} else logLSPMessage("receive-response", message);
		}
		function logLSPMessage(type, message) {
			if (!tracer || trace === Trace.Off) return;
			const lspMessage = {
				isLSPMessage: true,
				type,
				message,
				timestamp: Date.now()
			};
			tracer.log(lspMessage);
		}
		function throwIfClosedOrDisposed() {
			if (isClosed()) throw new ConnectionError(ConnectionErrors.Closed, "Connection is closed.");
			if (isDisposed()) throw new ConnectionError(ConnectionErrors.Disposed, "Connection is disposed.");
		}
		function throwIfListening() {
			if (isListening()) throw new ConnectionError(ConnectionErrors.AlreadyListening, "Connection is already listening");
		}
		function throwIfNotListening() {
			if (!isListening()) throw new Error("Call listen() first.");
		}
		function undefinedToNull(param) {
			if (param === void 0) return null;
			else return param;
		}
		function nullToUndefined(param) {
			if (param === null) return void 0;
			else return param;
		}
		function isNamedParam(param) {
			return param !== void 0 && param !== null && !Array.isArray(param) && typeof param === "object";
		}
		function computeSingleParam(parameterStructures, param) {
			switch (parameterStructures) {
				case messages_1$23.ParameterStructures.auto: if (isNamedParam(param)) return nullToUndefined(param);
				else return [undefinedToNull(param)];
				case messages_1$23.ParameterStructures.byName:
					if (!isNamedParam(param)) throw new Error(`Received parameters by name but param is not an object literal.`);
					return nullToUndefined(param);
				case messages_1$23.ParameterStructures.byPosition: return [undefinedToNull(param)];
				default: throw new Error(`Unknown parameter structure ${parameterStructures.toString()}`);
			}
		}
		function computeMessageParams(type, params) {
			let result;
			const numberOfParams = type.numberOfParams;
			switch (numberOfParams) {
				case 0:
					result = void 0;
					break;
				case 1:
					result = computeSingleParam(type.parameterStructures, params[0]);
					break;
				default:
					result = [];
					for (let i = 0; i < params.length && i < numberOfParams; i++) result.push(undefinedToNull(params[i]));
					if (params.length < numberOfParams) for (let i = params.length; i < numberOfParams; i++) result.push(null);
					break;
			}
			return result;
		}
		const connection = {
			sendNotification: (type, ...args) => {
				throwIfClosedOrDisposed();
				let method;
				let messageParams;
				if (Is$3.string(type)) {
					method = type;
					const first = args[0];
					let paramStart = 0;
					let parameterStructures = messages_1$23.ParameterStructures.auto;
					if (messages_1$23.ParameterStructures.is(first)) {
						paramStart = 1;
						parameterStructures = first;
					}
					let paramEnd = args.length;
					const numberOfParams = paramEnd - paramStart;
					switch (numberOfParams) {
						case 0:
							messageParams = void 0;
							break;
						case 1:
							messageParams = computeSingleParam(parameterStructures, args[paramStart]);
							break;
						default:
							if (parameterStructures === messages_1$23.ParameterStructures.byName) throw new Error(`Received ${numberOfParams} parameters for 'by Name' notification parameter structure.`);
							messageParams = args.slice(paramStart, paramEnd).map((value) => undefinedToNull(value));
							break;
					}
				} else {
					const params = args;
					method = type.method;
					messageParams = computeMessageParams(type, params);
				}
				const notificationMessage = {
					jsonrpc: version,
					method,
					params: messageParams
				};
				traceSendingNotification(notificationMessage);
				return messageWriter.write(notificationMessage).catch((error$2) => {
					logger.error(`Sending notification failed.`);
					throw error$2;
				});
			},
			onNotification: (type, handler) => {
				throwIfClosedOrDisposed();
				let method;
				if (Is$3.func(type)) starNotificationHandler = type;
				else if (handler) if (Is$3.string(type)) {
					method = type;
					notificationHandlers.set(type, {
						type: void 0,
						handler
					});
				} else {
					method = type.method;
					notificationHandlers.set(type.method, {
						type,
						handler
					});
				}
				return { dispose: () => {
					if (method !== void 0) notificationHandlers.delete(method);
					else starNotificationHandler = void 0;
				} };
			},
			onProgress: (_type, token, handler) => {
				if (progressHandlers.has(token)) throw new Error(`Progress handler for token ${token} already registered`);
				progressHandlers.set(token, handler);
				return { dispose: () => {
					progressHandlers.delete(token);
				} };
			},
			sendProgress: (_type, token, value) => {
				return connection.sendNotification(ProgressNotification.type, {
					token,
					value
				});
			},
			onUnhandledProgress: unhandledProgressEmitter.event,
			sendRequest: (type, ...args) => {
				throwIfClosedOrDisposed();
				throwIfNotListening();
				let method;
				let messageParams;
				let token = void 0;
				if (Is$3.string(type)) {
					method = type;
					const first = args[0];
					const last = args[args.length - 1];
					let paramStart = 0;
					let parameterStructures = messages_1$23.ParameterStructures.auto;
					if (messages_1$23.ParameterStructures.is(first)) {
						paramStart = 1;
						parameterStructures = first;
					}
					let paramEnd = args.length;
					if (cancellation_1$1.CancellationToken.is(last)) {
						paramEnd = paramEnd - 1;
						token = last;
					}
					const numberOfParams = paramEnd - paramStart;
					switch (numberOfParams) {
						case 0:
							messageParams = void 0;
							break;
						case 1:
							messageParams = computeSingleParam(parameterStructures, args[paramStart]);
							break;
						default:
							if (parameterStructures === messages_1$23.ParameterStructures.byName) throw new Error(`Received ${numberOfParams} parameters for 'by Name' request parameter structure.`);
							messageParams = args.slice(paramStart, paramEnd).map((value) => undefinedToNull(value));
							break;
					}
				} else {
					const params = args;
					method = type.method;
					messageParams = computeMessageParams(type, params);
					const numberOfParams = type.numberOfParams;
					token = cancellation_1$1.CancellationToken.is(params[numberOfParams]) ? params[numberOfParams] : void 0;
				}
				const id = sequenceNumber++;
				let disposable;
				if (token) disposable = token.onCancellationRequested(() => {
					const p = cancellationStrategy.sender.sendCancellation(connection, id);
					if (p === void 0) {
						logger.log(`Received no promise from cancellation strategy when cancelling id ${id}`);
						return Promise.resolve();
					} else return p.catch(() => {
						logger.log(`Sending cancellation messages for id ${id} failed`);
					});
				});
				const requestMessage = {
					jsonrpc: version,
					id,
					method,
					params: messageParams
				};
				traceSendingRequest(requestMessage);
				if (typeof cancellationStrategy.sender.enableCancellation === "function") cancellationStrategy.sender.enableCancellation(requestMessage);
				return new Promise(async (resolve$1, reject) => {
					const resolveWithCleanup = (r) => {
						resolve$1(r);
						cancellationStrategy.sender.cleanup(id);
						disposable?.dispose();
					};
					const rejectWithCleanup = (r) => {
						reject(r);
						cancellationStrategy.sender.cleanup(id);
						disposable?.dispose();
					};
					const responsePromise = {
						method,
						timerStart: Date.now(),
						resolve: resolveWithCleanup,
						reject: rejectWithCleanup
					};
					try {
						await messageWriter.write(requestMessage);
						responsePromises.set(id, responsePromise);
					} catch (error$2) {
						logger.error(`Sending request failed.`);
						responsePromise.reject(new messages_1$23.ResponseError(messages_1$23.ErrorCodes.MessageWriteError, error$2.message ? error$2.message : "Unknown reason"));
						throw error$2;
					}
				});
			},
			onRequest: (type, handler) => {
				throwIfClosedOrDisposed();
				let method = null;
				if (StarRequestHandler.is(type)) {
					method = void 0;
					starRequestHandler = type;
				} else if (Is$3.string(type)) {
					method = null;
					if (handler !== void 0) {
						method = type;
						requestHandlers.set(type, {
							handler,
							type: void 0
						});
					}
				} else if (handler !== void 0) {
					method = type.method;
					requestHandlers.set(type.method, {
						type,
						handler
					});
				}
				return { dispose: () => {
					if (method === null) return;
					if (method !== void 0) requestHandlers.delete(method);
					else starRequestHandler = void 0;
				} };
			},
			hasPendingResponse: () => {
				return responsePromises.size > 0;
			},
			trace: async (_value, _tracer, sendNotificationOrTraceOptions) => {
				let _sendNotification = false;
				let _traceFormat = TraceFormat.Text;
				if (sendNotificationOrTraceOptions !== void 0) if (Is$3.boolean(sendNotificationOrTraceOptions)) _sendNotification = sendNotificationOrTraceOptions;
				else {
					_sendNotification = sendNotificationOrTraceOptions.sendNotification || false;
					_traceFormat = sendNotificationOrTraceOptions.traceFormat || TraceFormat.Text;
				}
				trace = _value;
				traceFormat = _traceFormat;
				if (trace === Trace.Off) tracer = void 0;
				else tracer = _tracer;
				if (_sendNotification && !isClosed() && !isDisposed()) await connection.sendNotification(SetTraceNotification.type, { value: Trace.toString(_value) });
			},
			onError: errorEmitter.event,
			onClose: closeEmitter.event,
			onUnhandledNotification: unhandledNotificationEmitter.event,
			onDispose: disposeEmitter.event,
			end: () => {
				messageWriter.end();
			},
			dispose: () => {
				if (isDisposed()) return;
				state = ConnectionState.Disposed;
				disposeEmitter.fire(void 0);
				const error$2 = new messages_1$23.ResponseError(messages_1$23.ErrorCodes.PendingResponseRejected, "Pending response rejected since connection got disposed");
				for (const promise of responsePromises.values()) promise.reject(error$2);
				responsePromises = /* @__PURE__ */ new Map();
				requestTokens = /* @__PURE__ */ new Map();
				knownCanceledRequests = /* @__PURE__ */ new Set();
				messageQueue = new linkedMap_1$1.LinkedMap();
				if (Is$3.func(messageWriter.dispose)) messageWriter.dispose();
				if (Is$3.func(messageReader.dispose)) messageReader.dispose();
			},
			listen: () => {
				throwIfClosedOrDisposed();
				throwIfListening();
				state = ConnectionState.Listening;
				messageReader.listen(callback);
			},
			inspect: () => {
				(0, ral_1$1.default)().console.log("inspect");
			}
		};
		connection.onNotification(LogTraceNotification.type, (params) => {
			if (trace === Trace.Off || !tracer) return;
			const verbose = trace === Trace.Verbose || trace === Trace.Compact;
			tracer.log(params.message, verbose ? params.verbose : void 0);
		});
		connection.onNotification(ProgressNotification.type, (params) => {
			const handler = progressHandlers.get(params.token);
			if (handler) handler(params.value);
			else unhandledProgressEmitter.fire(params);
		});
		return connection;
	}
	exports.createMessageConnection = createMessageConnection$1;
} });

//#endregion
//#region node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/api.js
var require_api$1 = __commonJS({ "node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/common/api.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ProgressType = exports.ProgressToken = exports.createMessageConnection = exports.NullLogger = exports.ConnectionOptions = exports.ConnectionStrategy = exports.AbstractMessageBuffer = exports.WriteableStreamMessageWriter = exports.AbstractMessageWriter = exports.MessageWriter = exports.ReadableStreamMessageReader = exports.AbstractMessageReader = exports.MessageReader = exports.SharedArrayReceiverStrategy = exports.SharedArraySenderStrategy = exports.CancellationToken = exports.CancellationTokenSource = exports.Emitter = exports.Event = exports.Disposable = exports.LRUCache = exports.Touch = exports.LinkedMap = exports.ParameterStructures = exports.NotificationType9 = exports.NotificationType8 = exports.NotificationType7 = exports.NotificationType6 = exports.NotificationType5 = exports.NotificationType4 = exports.NotificationType3 = exports.NotificationType2 = exports.NotificationType1 = exports.NotificationType0 = exports.NotificationType = exports.ErrorCodes = exports.ResponseError = exports.RequestType9 = exports.RequestType8 = exports.RequestType7 = exports.RequestType6 = exports.RequestType5 = exports.RequestType4 = exports.RequestType3 = exports.RequestType2 = exports.RequestType1 = exports.RequestType0 = exports.RequestType = exports.Message = exports.RAL = void 0;
	exports.MessageStrategy = exports.CancellationStrategy = exports.CancellationSenderStrategy = exports.CancellationReceiverStrategy = exports.ConnectionError = exports.ConnectionErrors = exports.LogTraceNotification = exports.SetTraceNotification = exports.TraceFormat = exports.TraceValues = exports.Trace = void 0;
	const messages_1$22 = require_messages$1();
	Object.defineProperty(exports, "Message", {
		enumerable: true,
		get: function() {
			return messages_1$22.Message;
		}
	});
	Object.defineProperty(exports, "RequestType", {
		enumerable: true,
		get: function() {
			return messages_1$22.RequestType;
		}
	});
	Object.defineProperty(exports, "RequestType0", {
		enumerable: true,
		get: function() {
			return messages_1$22.RequestType0;
		}
	});
	Object.defineProperty(exports, "RequestType1", {
		enumerable: true,
		get: function() {
			return messages_1$22.RequestType1;
		}
	});
	Object.defineProperty(exports, "RequestType2", {
		enumerable: true,
		get: function() {
			return messages_1$22.RequestType2;
		}
	});
	Object.defineProperty(exports, "RequestType3", {
		enumerable: true,
		get: function() {
			return messages_1$22.RequestType3;
		}
	});
	Object.defineProperty(exports, "RequestType4", {
		enumerable: true,
		get: function() {
			return messages_1$22.RequestType4;
		}
	});
	Object.defineProperty(exports, "RequestType5", {
		enumerable: true,
		get: function() {
			return messages_1$22.RequestType5;
		}
	});
	Object.defineProperty(exports, "RequestType6", {
		enumerable: true,
		get: function() {
			return messages_1$22.RequestType6;
		}
	});
	Object.defineProperty(exports, "RequestType7", {
		enumerable: true,
		get: function() {
			return messages_1$22.RequestType7;
		}
	});
	Object.defineProperty(exports, "RequestType8", {
		enumerable: true,
		get: function() {
			return messages_1$22.RequestType8;
		}
	});
	Object.defineProperty(exports, "RequestType9", {
		enumerable: true,
		get: function() {
			return messages_1$22.RequestType9;
		}
	});
	Object.defineProperty(exports, "ResponseError", {
		enumerable: true,
		get: function() {
			return messages_1$22.ResponseError;
		}
	});
	Object.defineProperty(exports, "ErrorCodes", {
		enumerable: true,
		get: function() {
			return messages_1$22.ErrorCodes;
		}
	});
	Object.defineProperty(exports, "NotificationType", {
		enumerable: true,
		get: function() {
			return messages_1$22.NotificationType;
		}
	});
	Object.defineProperty(exports, "NotificationType0", {
		enumerable: true,
		get: function() {
			return messages_1$22.NotificationType0;
		}
	});
	Object.defineProperty(exports, "NotificationType1", {
		enumerable: true,
		get: function() {
			return messages_1$22.NotificationType1;
		}
	});
	Object.defineProperty(exports, "NotificationType2", {
		enumerable: true,
		get: function() {
			return messages_1$22.NotificationType2;
		}
	});
	Object.defineProperty(exports, "NotificationType3", {
		enumerable: true,
		get: function() {
			return messages_1$22.NotificationType3;
		}
	});
	Object.defineProperty(exports, "NotificationType4", {
		enumerable: true,
		get: function() {
			return messages_1$22.NotificationType4;
		}
	});
	Object.defineProperty(exports, "NotificationType5", {
		enumerable: true,
		get: function() {
			return messages_1$22.NotificationType5;
		}
	});
	Object.defineProperty(exports, "NotificationType6", {
		enumerable: true,
		get: function() {
			return messages_1$22.NotificationType6;
		}
	});
	Object.defineProperty(exports, "NotificationType7", {
		enumerable: true,
		get: function() {
			return messages_1$22.NotificationType7;
		}
	});
	Object.defineProperty(exports, "NotificationType8", {
		enumerable: true,
		get: function() {
			return messages_1$22.NotificationType8;
		}
	});
	Object.defineProperty(exports, "NotificationType9", {
		enumerable: true,
		get: function() {
			return messages_1$22.NotificationType9;
		}
	});
	Object.defineProperty(exports, "ParameterStructures", {
		enumerable: true,
		get: function() {
			return messages_1$22.ParameterStructures;
		}
	});
	const linkedMap_1 = require_linkedMap();
	Object.defineProperty(exports, "LinkedMap", {
		enumerable: true,
		get: function() {
			return linkedMap_1.LinkedMap;
		}
	});
	Object.defineProperty(exports, "LRUCache", {
		enumerable: true,
		get: function() {
			return linkedMap_1.LRUCache;
		}
	});
	Object.defineProperty(exports, "Touch", {
		enumerable: true,
		get: function() {
			return linkedMap_1.Touch;
		}
	});
	const disposable_1 = require_disposable();
	Object.defineProperty(exports, "Disposable", {
		enumerable: true,
		get: function() {
			return disposable_1.Disposable;
		}
	});
	const events_1 = require_events();
	Object.defineProperty(exports, "Event", {
		enumerable: true,
		get: function() {
			return events_1.Event;
		}
	});
	Object.defineProperty(exports, "Emitter", {
		enumerable: true,
		get: function() {
			return events_1.Emitter;
		}
	});
	const cancellation_1 = require_cancellation();
	Object.defineProperty(exports, "CancellationTokenSource", {
		enumerable: true,
		get: function() {
			return cancellation_1.CancellationTokenSource;
		}
	});
	Object.defineProperty(exports, "CancellationToken", {
		enumerable: true,
		get: function() {
			return cancellation_1.CancellationToken;
		}
	});
	const sharedArrayCancellation_1 = require_sharedArrayCancellation();
	Object.defineProperty(exports, "SharedArraySenderStrategy", {
		enumerable: true,
		get: function() {
			return sharedArrayCancellation_1.SharedArraySenderStrategy;
		}
	});
	Object.defineProperty(exports, "SharedArrayReceiverStrategy", {
		enumerable: true,
		get: function() {
			return sharedArrayCancellation_1.SharedArrayReceiverStrategy;
		}
	});
	const messageReader_1 = require_messageReader();
	Object.defineProperty(exports, "MessageReader", {
		enumerable: true,
		get: function() {
			return messageReader_1.MessageReader;
		}
	});
	Object.defineProperty(exports, "AbstractMessageReader", {
		enumerable: true,
		get: function() {
			return messageReader_1.AbstractMessageReader;
		}
	});
	Object.defineProperty(exports, "ReadableStreamMessageReader", {
		enumerable: true,
		get: function() {
			return messageReader_1.ReadableStreamMessageReader;
		}
	});
	const messageWriter_1 = require_messageWriter();
	Object.defineProperty(exports, "MessageWriter", {
		enumerable: true,
		get: function() {
			return messageWriter_1.MessageWriter;
		}
	});
	Object.defineProperty(exports, "AbstractMessageWriter", {
		enumerable: true,
		get: function() {
			return messageWriter_1.AbstractMessageWriter;
		}
	});
	Object.defineProperty(exports, "WriteableStreamMessageWriter", {
		enumerable: true,
		get: function() {
			return messageWriter_1.WriteableStreamMessageWriter;
		}
	});
	const messageBuffer_1 = require_messageBuffer();
	Object.defineProperty(exports, "AbstractMessageBuffer", {
		enumerable: true,
		get: function() {
			return messageBuffer_1.AbstractMessageBuffer;
		}
	});
	const connection_1$1 = require_connection$1();
	Object.defineProperty(exports, "ConnectionStrategy", {
		enumerable: true,
		get: function() {
			return connection_1$1.ConnectionStrategy;
		}
	});
	Object.defineProperty(exports, "ConnectionOptions", {
		enumerable: true,
		get: function() {
			return connection_1$1.ConnectionOptions;
		}
	});
	Object.defineProperty(exports, "NullLogger", {
		enumerable: true,
		get: function() {
			return connection_1$1.NullLogger;
		}
	});
	Object.defineProperty(exports, "createMessageConnection", {
		enumerable: true,
		get: function() {
			return connection_1$1.createMessageConnection;
		}
	});
	Object.defineProperty(exports, "ProgressToken", {
		enumerable: true,
		get: function() {
			return connection_1$1.ProgressToken;
		}
	});
	Object.defineProperty(exports, "ProgressType", {
		enumerable: true,
		get: function() {
			return connection_1$1.ProgressType;
		}
	});
	Object.defineProperty(exports, "Trace", {
		enumerable: true,
		get: function() {
			return connection_1$1.Trace;
		}
	});
	Object.defineProperty(exports, "TraceValues", {
		enumerable: true,
		get: function() {
			return connection_1$1.TraceValues;
		}
	});
	Object.defineProperty(exports, "TraceFormat", {
		enumerable: true,
		get: function() {
			return connection_1$1.TraceFormat;
		}
	});
	Object.defineProperty(exports, "SetTraceNotification", {
		enumerable: true,
		get: function() {
			return connection_1$1.SetTraceNotification;
		}
	});
	Object.defineProperty(exports, "LogTraceNotification", {
		enumerable: true,
		get: function() {
			return connection_1$1.LogTraceNotification;
		}
	});
	Object.defineProperty(exports, "ConnectionErrors", {
		enumerable: true,
		get: function() {
			return connection_1$1.ConnectionErrors;
		}
	});
	Object.defineProperty(exports, "ConnectionError", {
		enumerable: true,
		get: function() {
			return connection_1$1.ConnectionError;
		}
	});
	Object.defineProperty(exports, "CancellationReceiverStrategy", {
		enumerable: true,
		get: function() {
			return connection_1$1.CancellationReceiverStrategy;
		}
	});
	Object.defineProperty(exports, "CancellationSenderStrategy", {
		enumerable: true,
		get: function() {
			return connection_1$1.CancellationSenderStrategy;
		}
	});
	Object.defineProperty(exports, "CancellationStrategy", {
		enumerable: true,
		get: function() {
			return connection_1$1.CancellationStrategy;
		}
	});
	Object.defineProperty(exports, "MessageStrategy", {
		enumerable: true,
		get: function() {
			return connection_1$1.MessageStrategy;
		}
	});
	const ral_1 = require_ral();
	exports.RAL = ral_1.default;
} });

//#endregion
//#region node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/node/ril.js
var require_ril = __commonJS({ "node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/node/ril.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	const util_1 = __require("util");
	const api_1$1 = require_api$1();
	var MessageBuffer = class MessageBuffer extends api_1$1.AbstractMessageBuffer {
		constructor(encoding = "utf-8") {
			super(encoding);
		}
		emptyBuffer() {
			return MessageBuffer.emptyBuffer;
		}
		fromString(value, encoding) {
			return Buffer.from(value, encoding);
		}
		toString(value, encoding) {
			if (value instanceof Buffer) return value.toString(encoding);
			else return new util_1.TextDecoder(encoding).decode(value);
		}
		asNative(buffer, length) {
			if (length === void 0) return buffer instanceof Buffer ? buffer : Buffer.from(buffer);
			else return buffer instanceof Buffer ? buffer.slice(0, length) : Buffer.from(buffer, 0, length);
		}
		allocNative(length) {
			return Buffer.allocUnsafe(length);
		}
	};
	MessageBuffer.emptyBuffer = Buffer.allocUnsafe(0);
	var ReadableStreamWrapper = class {
		constructor(stream) {
			this.stream = stream;
		}
		onClose(listener) {
			this.stream.on("close", listener);
			return api_1$1.Disposable.create(() => this.stream.off("close", listener));
		}
		onError(listener) {
			this.stream.on("error", listener);
			return api_1$1.Disposable.create(() => this.stream.off("error", listener));
		}
		onEnd(listener) {
			this.stream.on("end", listener);
			return api_1$1.Disposable.create(() => this.stream.off("end", listener));
		}
		onData(listener) {
			this.stream.on("data", listener);
			return api_1$1.Disposable.create(() => this.stream.off("data", listener));
		}
	};
	var WritableStreamWrapper = class {
		constructor(stream) {
			this.stream = stream;
		}
		onClose(listener) {
			this.stream.on("close", listener);
			return api_1$1.Disposable.create(() => this.stream.off("close", listener));
		}
		onError(listener) {
			this.stream.on("error", listener);
			return api_1$1.Disposable.create(() => this.stream.off("error", listener));
		}
		onEnd(listener) {
			this.stream.on("end", listener);
			return api_1$1.Disposable.create(() => this.stream.off("end", listener));
		}
		write(data, encoding) {
			return new Promise((resolve$1, reject) => {
				const callback = (error$2) => {
					if (error$2 === void 0 || error$2 === null) resolve$1();
					else reject(error$2);
				};
				if (typeof data === "string") this.stream.write(data, encoding, callback);
				else this.stream.write(data, callback);
			});
		}
		end() {
			this.stream.end();
		}
	};
	const _ril = Object.freeze({
		messageBuffer: Object.freeze({ create: (encoding) => new MessageBuffer(encoding) }),
		applicationJson: Object.freeze({
			encoder: Object.freeze({
				name: "application/json",
				encode: (msg, options) => {
					try {
						return Promise.resolve(Buffer.from(JSON.stringify(msg, void 0, 0), options.charset));
					} catch (err) {
						return Promise.reject(err);
					}
				}
			}),
			decoder: Object.freeze({
				name: "application/json",
				decode: (buffer, options) => {
					try {
						if (buffer instanceof Buffer) return Promise.resolve(JSON.parse(buffer.toString(options.charset)));
						else return Promise.resolve(JSON.parse(new util_1.TextDecoder(options.charset).decode(buffer)));
					} catch (err) {
						return Promise.reject(err);
					}
				}
			})
		}),
		stream: Object.freeze({
			asReadableStream: (stream) => new ReadableStreamWrapper(stream),
			asWritableStream: (stream) => new WritableStreamWrapper(stream)
		}),
		console,
		timer: Object.freeze({
			setTimeout(callback, ms, ...args) {
				const handle = setTimeout(callback, ms, ...args);
				return { dispose: () => clearTimeout(handle) };
			},
			setImmediate(callback, ...args) {
				const handle = setImmediate(callback, ...args);
				return { dispose: () => clearImmediate(handle) };
			},
			setInterval(callback, ms, ...args) {
				const handle = setInterval(callback, ms, ...args);
				return { dispose: () => clearInterval(handle) };
			}
		})
	});
	function RIL() {
		return _ril;
	}
	(function(RIL$1) {
		function install() {
			api_1$1.RAL.install(_ril);
		}
		RIL$1.install = install;
	})(RIL || (RIL = {}));
	exports.default = RIL;
} });

//#endregion
//#region node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/node/main.js
var require_main$2 = __commonJS({ "node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/lib/node/main.js"(exports) {
	var __createBinding$2 = void 0 && (void 0).__createBinding || (Object.create ? function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	} : function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	});
	var __exportStar$2 = void 0 && (void 0).__exportStar || function(m, exports$1) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$1, p)) __createBinding$2(exports$1, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.createMessageConnection = exports.createServerSocketTransport = exports.createClientSocketTransport = exports.createServerPipeTransport = exports.createClientPipeTransport = exports.generateRandomPipeName = exports.StreamMessageWriter = exports.StreamMessageReader = exports.SocketMessageWriter = exports.SocketMessageReader = exports.PortMessageWriter = exports.PortMessageReader = exports.IPCMessageWriter = exports.IPCMessageReader = void 0;
	const ril_1 = require_ril();
	ril_1.default.install();
	const path$1 = __require("path");
	const os = __require("os");
	const crypto_1 = __require("crypto");
	const net_1 = __require("net");
	const api_1 = require_api$1();
	__exportStar$2(require_api$1(), exports);
	var IPCMessageReader = class extends api_1.AbstractMessageReader {
		constructor(process$1) {
			super();
			this.process = process$1;
			let eventEmitter = this.process;
			eventEmitter.on("error", (error$2) => this.fireError(error$2));
			eventEmitter.on("close", () => this.fireClose());
		}
		listen(callback) {
			this.process.on("message", callback);
			return api_1.Disposable.create(() => this.process.off("message", callback));
		}
	};
	exports.IPCMessageReader = IPCMessageReader;
	var IPCMessageWriter = class extends api_1.AbstractMessageWriter {
		constructor(process$1) {
			super();
			this.process = process$1;
			this.errorCount = 0;
			const eventEmitter = this.process;
			eventEmitter.on("error", (error$2) => this.fireError(error$2));
			eventEmitter.on("close", () => this.fireClose);
		}
		write(msg) {
			try {
				if (typeof this.process.send === "function") this.process.send(msg, void 0, void 0, (error$2) => {
					if (error$2) {
						this.errorCount++;
						this.handleError(error$2, msg);
					} else this.errorCount = 0;
				});
				return Promise.resolve();
			} catch (error$2) {
				this.handleError(error$2, msg);
				return Promise.reject(error$2);
			}
		}
		handleError(error$2, msg) {
			this.errorCount++;
			this.fireError(error$2, msg, this.errorCount);
		}
		end() {}
	};
	exports.IPCMessageWriter = IPCMessageWriter;
	var PortMessageReader = class extends api_1.AbstractMessageReader {
		constructor(port) {
			super();
			this.onData = new api_1.Emitter();
			port.on("close", () => this.fireClose);
			port.on("error", (error$2) => this.fireError(error$2));
			port.on("message", (message) => {
				this.onData.fire(message);
			});
		}
		listen(callback) {
			return this.onData.event(callback);
		}
	};
	exports.PortMessageReader = PortMessageReader;
	var PortMessageWriter = class extends api_1.AbstractMessageWriter {
		constructor(port) {
			super();
			this.port = port;
			this.errorCount = 0;
			port.on("close", () => this.fireClose());
			port.on("error", (error$2) => this.fireError(error$2));
		}
		write(msg) {
			try {
				this.port.postMessage(msg);
				return Promise.resolve();
			} catch (error$2) {
				this.handleError(error$2, msg);
				return Promise.reject(error$2);
			}
		}
		handleError(error$2, msg) {
			this.errorCount++;
			this.fireError(error$2, msg, this.errorCount);
		}
		end() {}
	};
	exports.PortMessageWriter = PortMessageWriter;
	var SocketMessageReader = class extends api_1.ReadableStreamMessageReader {
		constructor(socket, encoding = "utf-8") {
			super((0, ril_1.default)().stream.asReadableStream(socket), encoding);
		}
	};
	exports.SocketMessageReader = SocketMessageReader;
	var SocketMessageWriter = class extends api_1.WriteableStreamMessageWriter {
		constructor(socket, options) {
			super((0, ril_1.default)().stream.asWritableStream(socket), options);
			this.socket = socket;
		}
		dispose() {
			super.dispose();
			this.socket.destroy();
		}
	};
	exports.SocketMessageWriter = SocketMessageWriter;
	var StreamMessageReader = class extends api_1.ReadableStreamMessageReader {
		constructor(readable, encoding) {
			super((0, ril_1.default)().stream.asReadableStream(readable), encoding);
		}
	};
	exports.StreamMessageReader = StreamMessageReader;
	var StreamMessageWriter = class extends api_1.WriteableStreamMessageWriter {
		constructor(writable, options) {
			super((0, ril_1.default)().stream.asWritableStream(writable), options);
		}
	};
	exports.StreamMessageWriter = StreamMessageWriter;
	const XDG_RUNTIME_DIR = process.env["XDG_RUNTIME_DIR"];
	const safeIpcPathLengths = new Map([["linux", 107], ["darwin", 103]]);
	function generateRandomPipeName() {
		const randomSuffix = (0, crypto_1.randomBytes)(21).toString("hex");
		if (process.platform === "win32") return `\\\\.\\pipe\\vscode-jsonrpc-${randomSuffix}-sock`;
		let result;
		if (XDG_RUNTIME_DIR) result = path$1.join(XDG_RUNTIME_DIR, `vscode-ipc-${randomSuffix}.sock`);
		else result = path$1.join(os.tmpdir(), `vscode-${randomSuffix}.sock`);
		const limit = safeIpcPathLengths.get(process.platform);
		if (limit !== void 0 && result.length > limit) (0, ril_1.default)().console.warn(`WARNING: IPC handle "${result}" is longer than ${limit} characters.`);
		return result;
	}
	exports.generateRandomPipeName = generateRandomPipeName;
	function createClientPipeTransport(pipeName, encoding = "utf-8") {
		let connectResolve;
		const connected = new Promise((resolve$1, _reject) => {
			connectResolve = resolve$1;
		});
		return new Promise((resolve$1, reject) => {
			let server = (0, net_1.createServer)((socket) => {
				server.close();
				connectResolve([new SocketMessageReader(socket, encoding), new SocketMessageWriter(socket, encoding)]);
			});
			server.on("error", reject);
			server.listen(pipeName, () => {
				server.removeListener("error", reject);
				resolve$1({ onConnected: () => {
					return connected;
				} });
			});
		});
	}
	exports.createClientPipeTransport = createClientPipeTransport;
	function createServerPipeTransport(pipeName, encoding = "utf-8") {
		const socket = (0, net_1.createConnection)(pipeName);
		return [new SocketMessageReader(socket, encoding), new SocketMessageWriter(socket, encoding)];
	}
	exports.createServerPipeTransport = createServerPipeTransport;
	function createClientSocketTransport(port, encoding = "utf-8") {
		let connectResolve;
		const connected = new Promise((resolve$1, _reject) => {
			connectResolve = resolve$1;
		});
		return new Promise((resolve$1, reject) => {
			const server = (0, net_1.createServer)((socket) => {
				server.close();
				connectResolve([new SocketMessageReader(socket, encoding), new SocketMessageWriter(socket, encoding)]);
			});
			server.on("error", reject);
			server.listen(port, "127.0.0.1", () => {
				server.removeListener("error", reject);
				resolve$1({ onConnected: () => {
					return connected;
				} });
			});
		});
	}
	exports.createClientSocketTransport = createClientSocketTransport;
	function createServerSocketTransport(port, encoding = "utf-8") {
		const socket = (0, net_1.createConnection)(port, "127.0.0.1");
		return [new SocketMessageReader(socket, encoding), new SocketMessageWriter(socket, encoding)];
	}
	exports.createServerSocketTransport = createServerSocketTransport;
	function isReadableStream(value) {
		const candidate = value;
		return candidate.read !== void 0 && candidate.addListener !== void 0;
	}
	function isWritableStream(value) {
		const candidate = value;
		return candidate.write !== void 0 && candidate.addListener !== void 0;
	}
	function createMessageConnection(input, output, logger, options) {
		if (!logger) logger = api_1.NullLogger;
		const reader = isReadableStream(input) ? new StreamMessageReader(input) : input;
		const writer = isWritableStream(output) ? new StreamMessageWriter(output) : output;
		if (api_1.ConnectionStrategy.is(options)) options = { connectionStrategy: options };
		return (0, api_1.createMessageConnection)(reader, writer, logger, options);
	}
	exports.createMessageConnection = createMessageConnection;
} });

//#endregion
//#region node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/node.js
var require_node = __commonJS({ "node_modules/.pnpm/vscode-jsonrpc@8.2.0/node_modules/vscode-jsonrpc/node.js"(exports, module) {
	module.exports = require_main$2();
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-types@3.17.5/node_modules/vscode-languageserver-types/lib/umd/main.js
var require_main$1 = __commonJS({ "node_modules/.pnpm/vscode-languageserver-types@3.17.5/node_modules/vscode-languageserver-types/lib/umd/main.js"(exports, module) {
	(function(factory) {
		if (typeof module === "object" && typeof module.exports === "object") {
			var v = factory(__require, exports);
			if (v !== void 0) module.exports = v;
		} else if (typeof define === "function" && define.amd) define(["require", "exports"], factory);
	})(function(require$1, exports$1) {
		"use strict";
		Object.defineProperty(exports$1, "__esModule", { value: true });
		exports$1.TextDocument = exports$1.EOL = exports$1.WorkspaceFolder = exports$1.InlineCompletionContext = exports$1.SelectedCompletionInfo = exports$1.InlineCompletionTriggerKind = exports$1.InlineCompletionList = exports$1.InlineCompletionItem = exports$1.StringValue = exports$1.InlayHint = exports$1.InlayHintLabelPart = exports$1.InlayHintKind = exports$1.InlineValueContext = exports$1.InlineValueEvaluatableExpression = exports$1.InlineValueVariableLookup = exports$1.InlineValueText = exports$1.SemanticTokens = exports$1.SemanticTokenModifiers = exports$1.SemanticTokenTypes = exports$1.SelectionRange = exports$1.DocumentLink = exports$1.FormattingOptions = exports$1.CodeLens = exports$1.CodeAction = exports$1.CodeActionContext = exports$1.CodeActionTriggerKind = exports$1.CodeActionKind = exports$1.DocumentSymbol = exports$1.WorkspaceSymbol = exports$1.SymbolInformation = exports$1.SymbolTag = exports$1.SymbolKind = exports$1.DocumentHighlight = exports$1.DocumentHighlightKind = exports$1.SignatureInformation = exports$1.ParameterInformation = exports$1.Hover = exports$1.MarkedString = exports$1.CompletionList = exports$1.CompletionItem = exports$1.CompletionItemLabelDetails = exports$1.InsertTextMode = exports$1.InsertReplaceEdit = exports$1.CompletionItemTag = exports$1.InsertTextFormat = exports$1.CompletionItemKind = exports$1.MarkupContent = exports$1.MarkupKind = exports$1.TextDocumentItem = exports$1.OptionalVersionedTextDocumentIdentifier = exports$1.VersionedTextDocumentIdentifier = exports$1.TextDocumentIdentifier = exports$1.WorkspaceChange = exports$1.WorkspaceEdit = exports$1.DeleteFile = exports$1.RenameFile = exports$1.CreateFile = exports$1.TextDocumentEdit = exports$1.AnnotatedTextEdit = exports$1.ChangeAnnotationIdentifier = exports$1.ChangeAnnotation = exports$1.TextEdit = exports$1.Command = exports$1.Diagnostic = exports$1.CodeDescription = exports$1.DiagnosticTag = exports$1.DiagnosticSeverity = exports$1.DiagnosticRelatedInformation = exports$1.FoldingRange = exports$1.FoldingRangeKind = exports$1.ColorPresentation = exports$1.ColorInformation = exports$1.Color = exports$1.LocationLink = exports$1.Location = exports$1.Range = exports$1.Position = exports$1.uinteger = exports$1.integer = exports$1.URI = exports$1.DocumentUri = void 0;
		var DocumentUri$1;
		(function(DocumentUri$2) {
			function is$1(value) {
				return typeof value === "string";
			}
			DocumentUri$2.is = is$1;
		})(DocumentUri$1 || (exports$1.DocumentUri = DocumentUri$1 = {}));
		var URI$1;
		(function(URI$2) {
			function is$1(value) {
				return typeof value === "string";
			}
			URI$2.is = is$1;
		})(URI$1 || (exports$1.URI = URI$1 = {}));
		var integer$1;
		(function(integer$2) {
			integer$2.MIN_VALUE = -2147483648;
			integer$2.MAX_VALUE = 2147483647;
			function is$1(value) {
				return typeof value === "number" && integer$2.MIN_VALUE <= value && value <= integer$2.MAX_VALUE;
			}
			integer$2.is = is$1;
		})(integer$1 || (exports$1.integer = integer$1 = {}));
		var uinteger$1;
		(function(uinteger$2) {
			uinteger$2.MIN_VALUE = 0;
			uinteger$2.MAX_VALUE = 2147483647;
			function is$1(value) {
				return typeof value === "number" && uinteger$2.MIN_VALUE <= value && value <= uinteger$2.MAX_VALUE;
			}
			uinteger$2.is = is$1;
		})(uinteger$1 || (exports$1.uinteger = uinteger$1 = {}));
		/**
		* The Position namespace provides helper functions to work with
		* {@link Position} literals.
		*/
		var Position$1;
		(function(Position$2) {
			/**
			* Creates a new Position literal from the given line and character.
			* @param line The position's line.
			* @param character The position's character.
			*/
			function create(line, character) {
				if (line === Number.MAX_VALUE) line = uinteger$1.MAX_VALUE;
				if (character === Number.MAX_VALUE) character = uinteger$1.MAX_VALUE;
				return {
					line,
					character
				};
			}
			Position$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link Position} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.objectLiteral(candidate) && Is$8.uinteger(candidate.line) && Is$8.uinteger(candidate.character);
			}
			Position$2.is = is$1;
		})(Position$1 || (exports$1.Position = Position$1 = {}));
		/**
		* The Range namespace provides helper functions to work with
		* {@link Range} literals.
		*/
		var Range$1;
		(function(Range$2) {
			function create(one, two, three, four) {
				if (Is$8.uinteger(one) && Is$8.uinteger(two) && Is$8.uinteger(three) && Is$8.uinteger(four)) return {
					start: Position$1.create(one, two),
					end: Position$1.create(three, four)
				};
				else if (Position$1.is(one) && Position$1.is(two)) return {
					start: one,
					end: two
				};
				else throw new Error("Range#create called with invalid arguments[".concat(one, ", ").concat(two, ", ").concat(three, ", ").concat(four, "]"));
			}
			Range$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link Range} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.objectLiteral(candidate) && Position$1.is(candidate.start) && Position$1.is(candidate.end);
			}
			Range$2.is = is$1;
		})(Range$1 || (exports$1.Range = Range$1 = {}));
		/**
		* The Location namespace provides helper functions to work with
		* {@link Location} literals.
		*/
		var Location$1;
		(function(Location$2) {
			/**
			* Creates a Location literal.
			* @param uri The location's uri.
			* @param range The location's range.
			*/
			function create(uri, range) {
				return {
					uri,
					range
				};
			}
			Location$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link Location} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.objectLiteral(candidate) && Range$1.is(candidate.range) && (Is$8.string(candidate.uri) || Is$8.undefined(candidate.uri));
			}
			Location$2.is = is$1;
		})(Location$1 || (exports$1.Location = Location$1 = {}));
		/**
		* The LocationLink namespace provides helper functions to work with
		* {@link LocationLink} literals.
		*/
		var LocationLink$1;
		(function(LocationLink$2) {
			/**
			* Creates a LocationLink literal.
			* @param targetUri The definition's uri.
			* @param targetRange The full range of the definition.
			* @param targetSelectionRange The span of the symbol definition at the target.
			* @param originSelectionRange The span of the symbol being defined in the originating source file.
			*/
			function create(targetUri, targetRange, targetSelectionRange, originSelectionRange) {
				return {
					targetUri,
					targetRange,
					targetSelectionRange,
					originSelectionRange
				};
			}
			LocationLink$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link LocationLink} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.objectLiteral(candidate) && Range$1.is(candidate.targetRange) && Is$8.string(candidate.targetUri) && Range$1.is(candidate.targetSelectionRange) && (Range$1.is(candidate.originSelectionRange) || Is$8.undefined(candidate.originSelectionRange));
			}
			LocationLink$2.is = is$1;
		})(LocationLink$1 || (exports$1.LocationLink = LocationLink$1 = {}));
		/**
		* The Color namespace provides helper functions to work with
		* {@link Color} literals.
		*/
		var Color$1;
		(function(Color$2) {
			/**
			* Creates a new Color literal.
			*/
			function create(red, green, blue, alpha) {
				return {
					red,
					green,
					blue,
					alpha
				};
			}
			Color$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link Color} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.objectLiteral(candidate) && Is$8.numberRange(candidate.red, 0, 1) && Is$8.numberRange(candidate.green, 0, 1) && Is$8.numberRange(candidate.blue, 0, 1) && Is$8.numberRange(candidate.alpha, 0, 1);
			}
			Color$2.is = is$1;
		})(Color$1 || (exports$1.Color = Color$1 = {}));
		/**
		* The ColorInformation namespace provides helper functions to work with
		* {@link ColorInformation} literals.
		*/
		var ColorInformation$1;
		(function(ColorInformation$2) {
			/**
			* Creates a new ColorInformation literal.
			*/
			function create(range, color) {
				return {
					range,
					color
				};
			}
			ColorInformation$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link ColorInformation} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.objectLiteral(candidate) && Range$1.is(candidate.range) && Color$1.is(candidate.color);
			}
			ColorInformation$2.is = is$1;
		})(ColorInformation$1 || (exports$1.ColorInformation = ColorInformation$1 = {}));
		/**
		* The Color namespace provides helper functions to work with
		* {@link ColorPresentation} literals.
		*/
		var ColorPresentation$1;
		(function(ColorPresentation$2) {
			/**
			* Creates a new ColorInformation literal.
			*/
			function create(label, textEdit, additionalTextEdits) {
				return {
					label,
					textEdit,
					additionalTextEdits
				};
			}
			ColorPresentation$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link ColorInformation} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.objectLiteral(candidate) && Is$8.string(candidate.label) && (Is$8.undefined(candidate.textEdit) || TextEdit$1.is(candidate)) && (Is$8.undefined(candidate.additionalTextEdits) || Is$8.typedArray(candidate.additionalTextEdits, TextEdit$1.is));
			}
			ColorPresentation$2.is = is$1;
		})(ColorPresentation$1 || (exports$1.ColorPresentation = ColorPresentation$1 = {}));
		/**
		* A set of predefined range kinds.
		*/
		var FoldingRangeKind$1;
		(function(FoldingRangeKind$2) {
			/**
			* Folding range for a comment
			*/
			FoldingRangeKind$2.Comment = "comment";
			/**
			* Folding range for an import or include
			*/
			FoldingRangeKind$2.Imports = "imports";
			/**
			* Folding range for a region (e.g. `#region`)
			*/
			FoldingRangeKind$2.Region = "region";
		})(FoldingRangeKind$1 || (exports$1.FoldingRangeKind = FoldingRangeKind$1 = {}));
		/**
		* The folding range namespace provides helper functions to work with
		* {@link FoldingRange} literals.
		*/
		var FoldingRange$1;
		(function(FoldingRange$2) {
			/**
			* Creates a new FoldingRange literal.
			*/
			function create(startLine, endLine, startCharacter, endCharacter, kind, collapsedText) {
				var result = {
					startLine,
					endLine
				};
				if (Is$8.defined(startCharacter)) result.startCharacter = startCharacter;
				if (Is$8.defined(endCharacter)) result.endCharacter = endCharacter;
				if (Is$8.defined(kind)) result.kind = kind;
				if (Is$8.defined(collapsedText)) result.collapsedText = collapsedText;
				return result;
			}
			FoldingRange$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link FoldingRange} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.objectLiteral(candidate) && Is$8.uinteger(candidate.startLine) && Is$8.uinteger(candidate.startLine) && (Is$8.undefined(candidate.startCharacter) || Is$8.uinteger(candidate.startCharacter)) && (Is$8.undefined(candidate.endCharacter) || Is$8.uinteger(candidate.endCharacter)) && (Is$8.undefined(candidate.kind) || Is$8.string(candidate.kind));
			}
			FoldingRange$2.is = is$1;
		})(FoldingRange$1 || (exports$1.FoldingRange = FoldingRange$1 = {}));
		/**
		* The DiagnosticRelatedInformation namespace provides helper functions to work with
		* {@link DiagnosticRelatedInformation} literals.
		*/
		var DiagnosticRelatedInformation$1;
		(function(DiagnosticRelatedInformation$2) {
			/**
			* Creates a new DiagnosticRelatedInformation literal.
			*/
			function create(location, message) {
				return {
					location,
					message
				};
			}
			DiagnosticRelatedInformation$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link DiagnosticRelatedInformation} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.defined(candidate) && Location$1.is(candidate.location) && Is$8.string(candidate.message);
			}
			DiagnosticRelatedInformation$2.is = is$1;
		})(DiagnosticRelatedInformation$1 || (exports$1.DiagnosticRelatedInformation = DiagnosticRelatedInformation$1 = {}));
		/**
		* The diagnostic's severity.
		*/
		var DiagnosticSeverity$2;
		(function(DiagnosticSeverity$3) {
			/**
			* Reports an error.
			*/
			DiagnosticSeverity$3.Error = 1;
			/**
			* Reports a warning.
			*/
			DiagnosticSeverity$3.Warning = 2;
			/**
			* Reports an information.
			*/
			DiagnosticSeverity$3.Information = 3;
			/**
			* Reports a hint.
			*/
			DiagnosticSeverity$3.Hint = 4;
		})(DiagnosticSeverity$2 || (exports$1.DiagnosticSeverity = DiagnosticSeverity$2 = {}));
		/**
		* The diagnostic tags.
		*
		* @since 3.15.0
		*/
		var DiagnosticTag$1;
		(function(DiagnosticTag$2) {
			/**
			* Unused or unnecessary code.
			*
			* Clients are allowed to render diagnostics with this tag faded out instead of having
			* an error squiggle.
			*/
			DiagnosticTag$2.Unnecessary = 1;
			/**
			* Deprecated or obsolete code.
			*
			* Clients are allowed to rendered diagnostics with this tag strike through.
			*/
			DiagnosticTag$2.Deprecated = 2;
		})(DiagnosticTag$1 || (exports$1.DiagnosticTag = DiagnosticTag$1 = {}));
		/**
		* The CodeDescription namespace provides functions to deal with descriptions for diagnostic codes.
		*
		* @since 3.16.0
		*/
		var CodeDescription$1;
		(function(CodeDescription$2) {
			function is$1(value) {
				var candidate = value;
				return Is$8.objectLiteral(candidate) && Is$8.string(candidate.href);
			}
			CodeDescription$2.is = is$1;
		})(CodeDescription$1 || (exports$1.CodeDescription = CodeDescription$1 = {}));
		/**
		* The Diagnostic namespace provides helper functions to work with
		* {@link Diagnostic} literals.
		*/
		var Diagnostic$1;
		(function(Diagnostic$2) {
			/**
			* Creates a new Diagnostic literal.
			*/
			function create(range, message, severity, code, source, relatedInformation) {
				var result = {
					range,
					message
				};
				if (Is$8.defined(severity)) result.severity = severity;
				if (Is$8.defined(code)) result.code = code;
				if (Is$8.defined(source)) result.source = source;
				if (Is$8.defined(relatedInformation)) result.relatedInformation = relatedInformation;
				return result;
			}
			Diagnostic$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link Diagnostic} interface.
			*/
			function is$1(value) {
				var _a$1;
				var candidate = value;
				return Is$8.defined(candidate) && Range$1.is(candidate.range) && Is$8.string(candidate.message) && (Is$8.number(candidate.severity) || Is$8.undefined(candidate.severity)) && (Is$8.integer(candidate.code) || Is$8.string(candidate.code) || Is$8.undefined(candidate.code)) && (Is$8.undefined(candidate.codeDescription) || Is$8.string((_a$1 = candidate.codeDescription) === null || _a$1 === void 0 ? void 0 : _a$1.href)) && (Is$8.string(candidate.source) || Is$8.undefined(candidate.source)) && (Is$8.undefined(candidate.relatedInformation) || Is$8.typedArray(candidate.relatedInformation, DiagnosticRelatedInformation$1.is));
			}
			Diagnostic$2.is = is$1;
		})(Diagnostic$1 || (exports$1.Diagnostic = Diagnostic$1 = {}));
		/**
		* The Command namespace provides helper functions to work with
		* {@link Command} literals.
		*/
		var Command$1;
		(function(Command$2) {
			/**
			* Creates a new Command literal.
			*/
			function create(title, command) {
				var args = [];
				for (var _i = 2; _i < arguments.length; _i++) args[_i - 2] = arguments[_i];
				var result = {
					title,
					command
				};
				if (Is$8.defined(args) && args.length > 0) result.arguments = args;
				return result;
			}
			Command$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link Command} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.defined(candidate) && Is$8.string(candidate.title) && Is$8.string(candidate.command);
			}
			Command$2.is = is$1;
		})(Command$1 || (exports$1.Command = Command$1 = {}));
		/**
		* The TextEdit namespace provides helper function to create replace,
		* insert and delete edits more easily.
		*/
		var TextEdit$1;
		(function(TextEdit$2) {
			/**
			* Creates a replace text edit.
			* @param range The range of text to be replaced.
			* @param newText The new text.
			*/
			function replace(range, newText) {
				return {
					range,
					newText
				};
			}
			TextEdit$2.replace = replace;
			/**
			* Creates an insert text edit.
			* @param position The position to insert the text at.
			* @param newText The text to be inserted.
			*/
			function insert(position, newText) {
				return {
					range: {
						start: position,
						end: position
					},
					newText
				};
			}
			TextEdit$2.insert = insert;
			/**
			* Creates a delete text edit.
			* @param range The range of text to be deleted.
			*/
			function del(range) {
				return {
					range,
					newText: ""
				};
			}
			TextEdit$2.del = del;
			function is$1(value) {
				var candidate = value;
				return Is$8.objectLiteral(candidate) && Is$8.string(candidate.newText) && Range$1.is(candidate.range);
			}
			TextEdit$2.is = is$1;
		})(TextEdit$1 || (exports$1.TextEdit = TextEdit$1 = {}));
		var ChangeAnnotation$1;
		(function(ChangeAnnotation$2) {
			function create(label, needsConfirmation, description) {
				var result = { label };
				if (needsConfirmation !== void 0) result.needsConfirmation = needsConfirmation;
				if (description !== void 0) result.description = description;
				return result;
			}
			ChangeAnnotation$2.create = create;
			function is$1(value) {
				var candidate = value;
				return Is$8.objectLiteral(candidate) && Is$8.string(candidate.label) && (Is$8.boolean(candidate.needsConfirmation) || candidate.needsConfirmation === void 0) && (Is$8.string(candidate.description) || candidate.description === void 0);
			}
			ChangeAnnotation$2.is = is$1;
		})(ChangeAnnotation$1 || (exports$1.ChangeAnnotation = ChangeAnnotation$1 = {}));
		var ChangeAnnotationIdentifier$1;
		(function(ChangeAnnotationIdentifier$2) {
			function is$1(value) {
				var candidate = value;
				return Is$8.string(candidate);
			}
			ChangeAnnotationIdentifier$2.is = is$1;
		})(ChangeAnnotationIdentifier$1 || (exports$1.ChangeAnnotationIdentifier = ChangeAnnotationIdentifier$1 = {}));
		var AnnotatedTextEdit$1;
		(function(AnnotatedTextEdit$2) {
			/**
			* Creates an annotated replace text edit.
			*
			* @param range The range of text to be replaced.
			* @param newText The new text.
			* @param annotation The annotation.
			*/
			function replace(range, newText, annotation) {
				return {
					range,
					newText,
					annotationId: annotation
				};
			}
			AnnotatedTextEdit$2.replace = replace;
			/**
			* Creates an annotated insert text edit.
			*
			* @param position The position to insert the text at.
			* @param newText The text to be inserted.
			* @param annotation The annotation.
			*/
			function insert(position, newText, annotation) {
				return {
					range: {
						start: position,
						end: position
					},
					newText,
					annotationId: annotation
				};
			}
			AnnotatedTextEdit$2.insert = insert;
			/**
			* Creates an annotated delete text edit.
			*
			* @param range The range of text to be deleted.
			* @param annotation The annotation.
			*/
			function del(range, annotation) {
				return {
					range,
					newText: "",
					annotationId: annotation
				};
			}
			AnnotatedTextEdit$2.del = del;
			function is$1(value) {
				var candidate = value;
				return TextEdit$1.is(candidate) && (ChangeAnnotation$1.is(candidate.annotationId) || ChangeAnnotationIdentifier$1.is(candidate.annotationId));
			}
			AnnotatedTextEdit$2.is = is$1;
		})(AnnotatedTextEdit$1 || (exports$1.AnnotatedTextEdit = AnnotatedTextEdit$1 = {}));
		/**
		* The TextDocumentEdit namespace provides helper function to create
		* an edit that manipulates a text document.
		*/
		var TextDocumentEdit$1;
		(function(TextDocumentEdit$2) {
			/**
			* Creates a new `TextDocumentEdit`
			*/
			function create(textDocument, edits) {
				return {
					textDocument,
					edits
				};
			}
			TextDocumentEdit$2.create = create;
			function is$1(value) {
				var candidate = value;
				return Is$8.defined(candidate) && OptionalVersionedTextDocumentIdentifier$1.is(candidate.textDocument) && Array.isArray(candidate.edits);
			}
			TextDocumentEdit$2.is = is$1;
		})(TextDocumentEdit$1 || (exports$1.TextDocumentEdit = TextDocumentEdit$1 = {}));
		var CreateFile$1;
		(function(CreateFile$2) {
			function create(uri, options, annotation) {
				var result = {
					kind: "create",
					uri
				};
				if (options !== void 0 && (options.overwrite !== void 0 || options.ignoreIfExists !== void 0)) result.options = options;
				if (annotation !== void 0) result.annotationId = annotation;
				return result;
			}
			CreateFile$2.create = create;
			function is$1(value) {
				var candidate = value;
				return candidate && candidate.kind === "create" && Is$8.string(candidate.uri) && (candidate.options === void 0 || (candidate.options.overwrite === void 0 || Is$8.boolean(candidate.options.overwrite)) && (candidate.options.ignoreIfExists === void 0 || Is$8.boolean(candidate.options.ignoreIfExists))) && (candidate.annotationId === void 0 || ChangeAnnotationIdentifier$1.is(candidate.annotationId));
			}
			CreateFile$2.is = is$1;
		})(CreateFile$1 || (exports$1.CreateFile = CreateFile$1 = {}));
		var RenameFile$1;
		(function(RenameFile$2) {
			function create(oldUri, newUri, options, annotation) {
				var result = {
					kind: "rename",
					oldUri,
					newUri
				};
				if (options !== void 0 && (options.overwrite !== void 0 || options.ignoreIfExists !== void 0)) result.options = options;
				if (annotation !== void 0) result.annotationId = annotation;
				return result;
			}
			RenameFile$2.create = create;
			function is$1(value) {
				var candidate = value;
				return candidate && candidate.kind === "rename" && Is$8.string(candidate.oldUri) && Is$8.string(candidate.newUri) && (candidate.options === void 0 || (candidate.options.overwrite === void 0 || Is$8.boolean(candidate.options.overwrite)) && (candidate.options.ignoreIfExists === void 0 || Is$8.boolean(candidate.options.ignoreIfExists))) && (candidate.annotationId === void 0 || ChangeAnnotationIdentifier$1.is(candidate.annotationId));
			}
			RenameFile$2.is = is$1;
		})(RenameFile$1 || (exports$1.RenameFile = RenameFile$1 = {}));
		var DeleteFile$1;
		(function(DeleteFile$2) {
			function create(uri, options, annotation) {
				var result = {
					kind: "delete",
					uri
				};
				if (options !== void 0 && (options.recursive !== void 0 || options.ignoreIfNotExists !== void 0)) result.options = options;
				if (annotation !== void 0) result.annotationId = annotation;
				return result;
			}
			DeleteFile$2.create = create;
			function is$1(value) {
				var candidate = value;
				return candidate && candidate.kind === "delete" && Is$8.string(candidate.uri) && (candidate.options === void 0 || (candidate.options.recursive === void 0 || Is$8.boolean(candidate.options.recursive)) && (candidate.options.ignoreIfNotExists === void 0 || Is$8.boolean(candidate.options.ignoreIfNotExists))) && (candidate.annotationId === void 0 || ChangeAnnotationIdentifier$1.is(candidate.annotationId));
			}
			DeleteFile$2.is = is$1;
		})(DeleteFile$1 || (exports$1.DeleteFile = DeleteFile$1 = {}));
		var WorkspaceEdit$1;
		(function(WorkspaceEdit$2) {
			function is$1(value) {
				var candidate = value;
				return candidate && (candidate.changes !== void 0 || candidate.documentChanges !== void 0) && (candidate.documentChanges === void 0 || candidate.documentChanges.every(function(change) {
					if (Is$8.string(change.kind)) return CreateFile$1.is(change) || RenameFile$1.is(change) || DeleteFile$1.is(change);
					else return TextDocumentEdit$1.is(change);
				}));
			}
			WorkspaceEdit$2.is = is$1;
		})(WorkspaceEdit$1 || (exports$1.WorkspaceEdit = WorkspaceEdit$1 = {}));
		var TextEditChangeImpl = function() {
			function TextEditChangeImpl$1(edits, changeAnnotations) {
				this.edits = edits;
				this.changeAnnotations = changeAnnotations;
			}
			TextEditChangeImpl$1.prototype.insert = function(position, newText, annotation) {
				var edit;
				var id;
				if (annotation === void 0) edit = TextEdit$1.insert(position, newText);
				else if (ChangeAnnotationIdentifier$1.is(annotation)) {
					id = annotation;
					edit = AnnotatedTextEdit$1.insert(position, newText, annotation);
				} else {
					this.assertChangeAnnotations(this.changeAnnotations);
					id = this.changeAnnotations.manage(annotation);
					edit = AnnotatedTextEdit$1.insert(position, newText, id);
				}
				this.edits.push(edit);
				if (id !== void 0) return id;
			};
			TextEditChangeImpl$1.prototype.replace = function(range, newText, annotation) {
				var edit;
				var id;
				if (annotation === void 0) edit = TextEdit$1.replace(range, newText);
				else if (ChangeAnnotationIdentifier$1.is(annotation)) {
					id = annotation;
					edit = AnnotatedTextEdit$1.replace(range, newText, annotation);
				} else {
					this.assertChangeAnnotations(this.changeAnnotations);
					id = this.changeAnnotations.manage(annotation);
					edit = AnnotatedTextEdit$1.replace(range, newText, id);
				}
				this.edits.push(edit);
				if (id !== void 0) return id;
			};
			TextEditChangeImpl$1.prototype.delete = function(range, annotation) {
				var edit;
				var id;
				if (annotation === void 0) edit = TextEdit$1.del(range);
				else if (ChangeAnnotationIdentifier$1.is(annotation)) {
					id = annotation;
					edit = AnnotatedTextEdit$1.del(range, annotation);
				} else {
					this.assertChangeAnnotations(this.changeAnnotations);
					id = this.changeAnnotations.manage(annotation);
					edit = AnnotatedTextEdit$1.del(range, id);
				}
				this.edits.push(edit);
				if (id !== void 0) return id;
			};
			TextEditChangeImpl$1.prototype.add = function(edit) {
				this.edits.push(edit);
			};
			TextEditChangeImpl$1.prototype.all = function() {
				return this.edits;
			};
			TextEditChangeImpl$1.prototype.clear = function() {
				this.edits.splice(0, this.edits.length);
			};
			TextEditChangeImpl$1.prototype.assertChangeAnnotations = function(value) {
				if (value === void 0) throw new Error("Text edit change is not configured to manage change annotations.");
			};
			return TextEditChangeImpl$1;
		}();
		/**
		* A helper class
		*/
		var ChangeAnnotations = function() {
			function ChangeAnnotations$1(annotations) {
				this._annotations = annotations === void 0 ? Object.create(null) : annotations;
				this._counter = 0;
				this._size = 0;
			}
			ChangeAnnotations$1.prototype.all = function() {
				return this._annotations;
			};
			Object.defineProperty(ChangeAnnotations$1.prototype, "size", {
				get: function() {
					return this._size;
				},
				enumerable: false,
				configurable: true
			});
			ChangeAnnotations$1.prototype.manage = function(idOrAnnotation, annotation) {
				var id;
				if (ChangeAnnotationIdentifier$1.is(idOrAnnotation)) id = idOrAnnotation;
				else {
					id = this.nextId();
					annotation = idOrAnnotation;
				}
				if (this._annotations[id] !== void 0) throw new Error("Id ".concat(id, " is already in use."));
				if (annotation === void 0) throw new Error("No annotation provided for id ".concat(id));
				this._annotations[id] = annotation;
				this._size++;
				return id;
			};
			ChangeAnnotations$1.prototype.nextId = function() {
				this._counter++;
				return this._counter.toString();
			};
			return ChangeAnnotations$1;
		}();
		/**
		* A workspace change helps constructing changes to a workspace.
		*/
		var WorkspaceChange = function() {
			function WorkspaceChange$1(workspaceEdit) {
				var _this = this;
				this._textEditChanges = Object.create(null);
				if (workspaceEdit !== void 0) {
					this._workspaceEdit = workspaceEdit;
					if (workspaceEdit.documentChanges) {
						this._changeAnnotations = new ChangeAnnotations(workspaceEdit.changeAnnotations);
						workspaceEdit.changeAnnotations = this._changeAnnotations.all();
						workspaceEdit.documentChanges.forEach(function(change) {
							if (TextDocumentEdit$1.is(change)) {
								var textEditChange = new TextEditChangeImpl(change.edits, _this._changeAnnotations);
								_this._textEditChanges[change.textDocument.uri] = textEditChange;
							}
						});
					} else if (workspaceEdit.changes) Object.keys(workspaceEdit.changes).forEach(function(key) {
						var textEditChange = new TextEditChangeImpl(workspaceEdit.changes[key]);
						_this._textEditChanges[key] = textEditChange;
					});
				} else this._workspaceEdit = {};
			}
			Object.defineProperty(WorkspaceChange$1.prototype, "edit", {
				get: function() {
					this.initDocumentChanges();
					if (this._changeAnnotations !== void 0) if (this._changeAnnotations.size === 0) this._workspaceEdit.changeAnnotations = void 0;
					else this._workspaceEdit.changeAnnotations = this._changeAnnotations.all();
					return this._workspaceEdit;
				},
				enumerable: false,
				configurable: true
			});
			WorkspaceChange$1.prototype.getTextEditChange = function(key) {
				if (OptionalVersionedTextDocumentIdentifier$1.is(key)) {
					this.initDocumentChanges();
					if (this._workspaceEdit.documentChanges === void 0) throw new Error("Workspace edit is not configured for document changes.");
					var textDocument = {
						uri: key.uri,
						version: key.version
					};
					var result = this._textEditChanges[textDocument.uri];
					if (!result) {
						var edits = [];
						var textDocumentEdit = {
							textDocument,
							edits
						};
						this._workspaceEdit.documentChanges.push(textDocumentEdit);
						result = new TextEditChangeImpl(edits, this._changeAnnotations);
						this._textEditChanges[textDocument.uri] = result;
					}
					return result;
				} else {
					this.initChanges();
					if (this._workspaceEdit.changes === void 0) throw new Error("Workspace edit is not configured for normal text edit changes.");
					var result = this._textEditChanges[key];
					if (!result) {
						var edits = [];
						this._workspaceEdit.changes[key] = edits;
						result = new TextEditChangeImpl(edits);
						this._textEditChanges[key] = result;
					}
					return result;
				}
			};
			WorkspaceChange$1.prototype.initDocumentChanges = function() {
				if (this._workspaceEdit.documentChanges === void 0 && this._workspaceEdit.changes === void 0) {
					this._changeAnnotations = new ChangeAnnotations();
					this._workspaceEdit.documentChanges = [];
					this._workspaceEdit.changeAnnotations = this._changeAnnotations.all();
				}
			};
			WorkspaceChange$1.prototype.initChanges = function() {
				if (this._workspaceEdit.documentChanges === void 0 && this._workspaceEdit.changes === void 0) this._workspaceEdit.changes = Object.create(null);
			};
			WorkspaceChange$1.prototype.createFile = function(uri, optionsOrAnnotation, options) {
				this.initDocumentChanges();
				if (this._workspaceEdit.documentChanges === void 0) throw new Error("Workspace edit is not configured for document changes.");
				var annotation;
				if (ChangeAnnotation$1.is(optionsOrAnnotation) || ChangeAnnotationIdentifier$1.is(optionsOrAnnotation)) annotation = optionsOrAnnotation;
				else options = optionsOrAnnotation;
				var operation;
				var id;
				if (annotation === void 0) operation = CreateFile$1.create(uri, options);
				else {
					id = ChangeAnnotationIdentifier$1.is(annotation) ? annotation : this._changeAnnotations.manage(annotation);
					operation = CreateFile$1.create(uri, options, id);
				}
				this._workspaceEdit.documentChanges.push(operation);
				if (id !== void 0) return id;
			};
			WorkspaceChange$1.prototype.renameFile = function(oldUri, newUri, optionsOrAnnotation, options) {
				this.initDocumentChanges();
				if (this._workspaceEdit.documentChanges === void 0) throw new Error("Workspace edit is not configured for document changes.");
				var annotation;
				if (ChangeAnnotation$1.is(optionsOrAnnotation) || ChangeAnnotationIdentifier$1.is(optionsOrAnnotation)) annotation = optionsOrAnnotation;
				else options = optionsOrAnnotation;
				var operation;
				var id;
				if (annotation === void 0) operation = RenameFile$1.create(oldUri, newUri, options);
				else {
					id = ChangeAnnotationIdentifier$1.is(annotation) ? annotation : this._changeAnnotations.manage(annotation);
					operation = RenameFile$1.create(oldUri, newUri, options, id);
				}
				this._workspaceEdit.documentChanges.push(operation);
				if (id !== void 0) return id;
			};
			WorkspaceChange$1.prototype.deleteFile = function(uri, optionsOrAnnotation, options) {
				this.initDocumentChanges();
				if (this._workspaceEdit.documentChanges === void 0) throw new Error("Workspace edit is not configured for document changes.");
				var annotation;
				if (ChangeAnnotation$1.is(optionsOrAnnotation) || ChangeAnnotationIdentifier$1.is(optionsOrAnnotation)) annotation = optionsOrAnnotation;
				else options = optionsOrAnnotation;
				var operation;
				var id;
				if (annotation === void 0) operation = DeleteFile$1.create(uri, options);
				else {
					id = ChangeAnnotationIdentifier$1.is(annotation) ? annotation : this._changeAnnotations.manage(annotation);
					operation = DeleteFile$1.create(uri, options, id);
				}
				this._workspaceEdit.documentChanges.push(operation);
				if (id !== void 0) return id;
			};
			return WorkspaceChange$1;
		}();
		exports$1.WorkspaceChange = WorkspaceChange;
		/**
		* The TextDocumentIdentifier namespace provides helper functions to work with
		* {@link TextDocumentIdentifier} literals.
		*/
		var TextDocumentIdentifier$1;
		(function(TextDocumentIdentifier$2) {
			/**
			* Creates a new TextDocumentIdentifier literal.
			* @param uri The document's uri.
			*/
			function create(uri) {
				return { uri };
			}
			TextDocumentIdentifier$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link TextDocumentIdentifier} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.defined(candidate) && Is$8.string(candidate.uri);
			}
			TextDocumentIdentifier$2.is = is$1;
		})(TextDocumentIdentifier$1 || (exports$1.TextDocumentIdentifier = TextDocumentIdentifier$1 = {}));
		/**
		* The VersionedTextDocumentIdentifier namespace provides helper functions to work with
		* {@link VersionedTextDocumentIdentifier} literals.
		*/
		var VersionedTextDocumentIdentifier$1;
		(function(VersionedTextDocumentIdentifier$2) {
			/**
			* Creates a new VersionedTextDocumentIdentifier literal.
			* @param uri The document's uri.
			* @param version The document's version.
			*/
			function create(uri, version) {
				return {
					uri,
					version
				};
			}
			VersionedTextDocumentIdentifier$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link VersionedTextDocumentIdentifier} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.defined(candidate) && Is$8.string(candidate.uri) && Is$8.integer(candidate.version);
			}
			VersionedTextDocumentIdentifier$2.is = is$1;
		})(VersionedTextDocumentIdentifier$1 || (exports$1.VersionedTextDocumentIdentifier = VersionedTextDocumentIdentifier$1 = {}));
		/**
		* The OptionalVersionedTextDocumentIdentifier namespace provides helper functions to work with
		* {@link OptionalVersionedTextDocumentIdentifier} literals.
		*/
		var OptionalVersionedTextDocumentIdentifier$1;
		(function(OptionalVersionedTextDocumentIdentifier$2) {
			/**
			* Creates a new OptionalVersionedTextDocumentIdentifier literal.
			* @param uri The document's uri.
			* @param version The document's version.
			*/
			function create(uri, version) {
				return {
					uri,
					version
				};
			}
			OptionalVersionedTextDocumentIdentifier$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link OptionalVersionedTextDocumentIdentifier} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.defined(candidate) && Is$8.string(candidate.uri) && (candidate.version === null || Is$8.integer(candidate.version));
			}
			OptionalVersionedTextDocumentIdentifier$2.is = is$1;
		})(OptionalVersionedTextDocumentIdentifier$1 || (exports$1.OptionalVersionedTextDocumentIdentifier = OptionalVersionedTextDocumentIdentifier$1 = {}));
		/**
		* The TextDocumentItem namespace provides helper functions to work with
		* {@link TextDocumentItem} literals.
		*/
		var TextDocumentItem$1;
		(function(TextDocumentItem$2) {
			/**
			* Creates a new TextDocumentItem literal.
			* @param uri The document's uri.
			* @param languageId The document's language identifier.
			* @param version The document's version number.
			* @param text The document's text.
			*/
			function create(uri, languageId, version, text) {
				return {
					uri,
					languageId,
					version,
					text
				};
			}
			TextDocumentItem$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link TextDocumentItem} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.defined(candidate) && Is$8.string(candidate.uri) && Is$8.string(candidate.languageId) && Is$8.integer(candidate.version) && Is$8.string(candidate.text);
			}
			TextDocumentItem$2.is = is$1;
		})(TextDocumentItem$1 || (exports$1.TextDocumentItem = TextDocumentItem$1 = {}));
		/**
		* Describes the content type that a client supports in various
		* result literals like `Hover`, `ParameterInfo` or `CompletionItem`.
		*
		* Please note that `MarkupKinds` must not start with a `$`. This kinds
		* are reserved for internal usage.
		*/
		var MarkupKind$2;
		(function(MarkupKind$3) {
			/**
			* Plain text is supported as a content format
			*/
			MarkupKind$3.PlainText = "plaintext";
			/**
			* Markdown is supported as a content format
			*/
			MarkupKind$3.Markdown = "markdown";
			/**
			* Checks whether the given value is a value of the {@link MarkupKind} type.
			*/
			function is$1(value) {
				var candidate = value;
				return candidate === MarkupKind$3.PlainText || candidate === MarkupKind$3.Markdown;
			}
			MarkupKind$3.is = is$1;
		})(MarkupKind$2 || (exports$1.MarkupKind = MarkupKind$2 = {}));
		var MarkupContent$1;
		(function(MarkupContent$2) {
			/**
			* Checks whether the given value conforms to the {@link MarkupContent} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.objectLiteral(value) && MarkupKind$2.is(candidate.kind) && Is$8.string(candidate.value);
			}
			MarkupContent$2.is = is$1;
		})(MarkupContent$1 || (exports$1.MarkupContent = MarkupContent$1 = {}));
		/**
		* The kind of a completion entry.
		*/
		var CompletionItemKind$2;
		(function(CompletionItemKind$3) {
			CompletionItemKind$3.Text = 1;
			CompletionItemKind$3.Method = 2;
			CompletionItemKind$3.Function = 3;
			CompletionItemKind$3.Constructor = 4;
			CompletionItemKind$3.Field = 5;
			CompletionItemKind$3.Variable = 6;
			CompletionItemKind$3.Class = 7;
			CompletionItemKind$3.Interface = 8;
			CompletionItemKind$3.Module = 9;
			CompletionItemKind$3.Property = 10;
			CompletionItemKind$3.Unit = 11;
			CompletionItemKind$3.Value = 12;
			CompletionItemKind$3.Enum = 13;
			CompletionItemKind$3.Keyword = 14;
			CompletionItemKind$3.Snippet = 15;
			CompletionItemKind$3.Color = 16;
			CompletionItemKind$3.File = 17;
			CompletionItemKind$3.Reference = 18;
			CompletionItemKind$3.Folder = 19;
			CompletionItemKind$3.EnumMember = 20;
			CompletionItemKind$3.Constant = 21;
			CompletionItemKind$3.Struct = 22;
			CompletionItemKind$3.Event = 23;
			CompletionItemKind$3.Operator = 24;
			CompletionItemKind$3.TypeParameter = 25;
		})(CompletionItemKind$2 || (exports$1.CompletionItemKind = CompletionItemKind$2 = {}));
		/**
		* Defines whether the insert text in a completion item should be interpreted as
		* plain text or a snippet.
		*/
		var InsertTextFormat$1;
		(function(InsertTextFormat$2) {
			/**
			* The primary text to be inserted is treated as a plain string.
			*/
			InsertTextFormat$2.PlainText = 1;
			/**
			* The primary text to be inserted is treated as a snippet.
			*
			* A snippet can define tab stops and placeholders with `$1`, `$2`
			* and `${3:foo}`. `$0` defines the final tab stop, it defaults to
			* the end of the snippet. Placeholders with equal identifiers are linked,
			* that is typing in one will update others too.
			*
			* See also: https://microsoft.github.io/language-server-protocol/specifications/specification-current/#snippet_syntax
			*/
			InsertTextFormat$2.Snippet = 2;
		})(InsertTextFormat$1 || (exports$1.InsertTextFormat = InsertTextFormat$1 = {}));
		/**
		* Completion item tags are extra annotations that tweak the rendering of a completion
		* item.
		*
		* @since 3.15.0
		*/
		var CompletionItemTag$1;
		(function(CompletionItemTag$2) {
			/**
			* Render a completion as obsolete, usually using a strike-out.
			*/
			CompletionItemTag$2.Deprecated = 1;
		})(CompletionItemTag$1 || (exports$1.CompletionItemTag = CompletionItemTag$1 = {}));
		/**
		* The InsertReplaceEdit namespace provides functions to deal with insert / replace edits.
		*
		* @since 3.16.0
		*/
		var InsertReplaceEdit$1;
		(function(InsertReplaceEdit$2) {
			/**
			* Creates a new insert / replace edit
			*/
			function create(newText, insert, replace) {
				return {
					newText,
					insert,
					replace
				};
			}
			InsertReplaceEdit$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link InsertReplaceEdit} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return candidate && Is$8.string(candidate.newText) && Range$1.is(candidate.insert) && Range$1.is(candidate.replace);
			}
			InsertReplaceEdit$2.is = is$1;
		})(InsertReplaceEdit$1 || (exports$1.InsertReplaceEdit = InsertReplaceEdit$1 = {}));
		/**
		* How whitespace and indentation is handled during completion
		* item insertion.
		*
		* @since 3.16.0
		*/
		var InsertTextMode$1;
		(function(InsertTextMode$2) {
			/**
			* The insertion or replace strings is taken as it is. If the
			* value is multi line the lines below the cursor will be
			* inserted using the indentation defined in the string value.
			* The client will not apply any kind of adjustments to the
			* string.
			*/
			InsertTextMode$2.asIs = 1;
			/**
			* The editor adjusts leading whitespace of new lines so that
			* they match the indentation up to the cursor of the line for
			* which the item is accepted.
			*
			* Consider a line like this: <2tabs><cursor><3tabs>foo. Accepting a
			* multi line completion item is indented using 2 tabs and all
			* following lines inserted will be indented using 2 tabs as well.
			*/
			InsertTextMode$2.adjustIndentation = 2;
		})(InsertTextMode$1 || (exports$1.InsertTextMode = InsertTextMode$1 = {}));
		var CompletionItemLabelDetails$1;
		(function(CompletionItemLabelDetails$2) {
			function is$1(value) {
				var candidate = value;
				return candidate && (Is$8.string(candidate.detail) || candidate.detail === void 0) && (Is$8.string(candidate.description) || candidate.description === void 0);
			}
			CompletionItemLabelDetails$2.is = is$1;
		})(CompletionItemLabelDetails$1 || (exports$1.CompletionItemLabelDetails = CompletionItemLabelDetails$1 = {}));
		/**
		* The CompletionItem namespace provides functions to deal with
		* completion items.
		*/
		var CompletionItem$1;
		(function(CompletionItem$2) {
			/**
			* Create a completion item and seed it with a label.
			* @param label The completion item's label
			*/
			function create(label) {
				return { label };
			}
			CompletionItem$2.create = create;
		})(CompletionItem$1 || (exports$1.CompletionItem = CompletionItem$1 = {}));
		/**
		* The CompletionList namespace provides functions to deal with
		* completion lists.
		*/
		var CompletionList$1;
		(function(CompletionList$2) {
			/**
			* Creates a new completion list.
			*
			* @param items The completion items.
			* @param isIncomplete The list is not complete.
			*/
			function create(items, isIncomplete) {
				return {
					items: items ? items : [],
					isIncomplete: !!isIncomplete
				};
			}
			CompletionList$2.create = create;
		})(CompletionList$1 || (exports$1.CompletionList = CompletionList$1 = {}));
		var MarkedString$1;
		(function(MarkedString$2) {
			/**
			* Creates a marked string from plain text.
			*
			* @param plainText The plain text.
			*/
			function fromPlainText(plainText) {
				return plainText.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&");
			}
			MarkedString$2.fromPlainText = fromPlainText;
			/**
			* Checks whether the given value conforms to the {@link MarkedString} type.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.string(candidate) || Is$8.objectLiteral(candidate) && Is$8.string(candidate.language) && Is$8.string(candidate.value);
			}
			MarkedString$2.is = is$1;
		})(MarkedString$1 || (exports$1.MarkedString = MarkedString$1 = {}));
		var Hover$1;
		(function(Hover$2) {
			/**
			* Checks whether the given value conforms to the {@link Hover} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return !!candidate && Is$8.objectLiteral(candidate) && (MarkupContent$1.is(candidate.contents) || MarkedString$1.is(candidate.contents) || Is$8.typedArray(candidate.contents, MarkedString$1.is)) && (value.range === void 0 || Range$1.is(value.range));
			}
			Hover$2.is = is$1;
		})(Hover$1 || (exports$1.Hover = Hover$1 = {}));
		/**
		* The ParameterInformation namespace provides helper functions to work with
		* {@link ParameterInformation} literals.
		*/
		var ParameterInformation$1;
		(function(ParameterInformation$2) {
			/**
			* Creates a new parameter information literal.
			*
			* @param label A label string.
			* @param documentation A doc string.
			*/
			function create(label, documentation) {
				return documentation ? {
					label,
					documentation
				} : { label };
			}
			ParameterInformation$2.create = create;
		})(ParameterInformation$1 || (exports$1.ParameterInformation = ParameterInformation$1 = {}));
		/**
		* The SignatureInformation namespace provides helper functions to work with
		* {@link SignatureInformation} literals.
		*/
		var SignatureInformation$1;
		(function(SignatureInformation$2) {
			function create(label, documentation) {
				var parameters = [];
				for (var _i = 2; _i < arguments.length; _i++) parameters[_i - 2] = arguments[_i];
				var result = { label };
				if (Is$8.defined(documentation)) result.documentation = documentation;
				if (Is$8.defined(parameters)) result.parameters = parameters;
				else result.parameters = [];
				return result;
			}
			SignatureInformation$2.create = create;
		})(SignatureInformation$1 || (exports$1.SignatureInformation = SignatureInformation$1 = {}));
		/**
		* A document highlight kind.
		*/
		var DocumentHighlightKind$1;
		(function(DocumentHighlightKind$2) {
			/**
			* A textual occurrence.
			*/
			DocumentHighlightKind$2.Text = 1;
			/**
			* Read-access of a symbol, like reading a variable.
			*/
			DocumentHighlightKind$2.Read = 2;
			/**
			* Write-access of a symbol, like writing to a variable.
			*/
			DocumentHighlightKind$2.Write = 3;
		})(DocumentHighlightKind$1 || (exports$1.DocumentHighlightKind = DocumentHighlightKind$1 = {}));
		/**
		* DocumentHighlight namespace to provide helper functions to work with
		* {@link DocumentHighlight} literals.
		*/
		var DocumentHighlight$1;
		(function(DocumentHighlight$2) {
			/**
			* Create a DocumentHighlight object.
			* @param range The range the highlight applies to.
			* @param kind The highlight kind
			*/
			function create(range, kind) {
				var result = { range };
				if (Is$8.number(kind)) result.kind = kind;
				return result;
			}
			DocumentHighlight$2.create = create;
		})(DocumentHighlight$1 || (exports$1.DocumentHighlight = DocumentHighlight$1 = {}));
		/**
		* A symbol kind.
		*/
		var SymbolKind$2;
		(function(SymbolKind$3) {
			SymbolKind$3.File = 1;
			SymbolKind$3.Module = 2;
			SymbolKind$3.Namespace = 3;
			SymbolKind$3.Package = 4;
			SymbolKind$3.Class = 5;
			SymbolKind$3.Method = 6;
			SymbolKind$3.Property = 7;
			SymbolKind$3.Field = 8;
			SymbolKind$3.Constructor = 9;
			SymbolKind$3.Enum = 10;
			SymbolKind$3.Interface = 11;
			SymbolKind$3.Function = 12;
			SymbolKind$3.Variable = 13;
			SymbolKind$3.Constant = 14;
			SymbolKind$3.String = 15;
			SymbolKind$3.Number = 16;
			SymbolKind$3.Boolean = 17;
			SymbolKind$3.Array = 18;
			SymbolKind$3.Object = 19;
			SymbolKind$3.Key = 20;
			SymbolKind$3.Null = 21;
			SymbolKind$3.EnumMember = 22;
			SymbolKind$3.Struct = 23;
			SymbolKind$3.Event = 24;
			SymbolKind$3.Operator = 25;
			SymbolKind$3.TypeParameter = 26;
		})(SymbolKind$2 || (exports$1.SymbolKind = SymbolKind$2 = {}));
		/**
		* Symbol tags are extra annotations that tweak the rendering of a symbol.
		*
		* @since 3.16
		*/
		var SymbolTag$1;
		(function(SymbolTag$2) {
			/**
			* Render a symbol as obsolete, usually using a strike-out.
			*/
			SymbolTag$2.Deprecated = 1;
		})(SymbolTag$1 || (exports$1.SymbolTag = SymbolTag$1 = {}));
		var SymbolInformation$1;
		(function(SymbolInformation$2) {
			/**
			* Creates a new symbol information literal.
			*
			* @param name The name of the symbol.
			* @param kind The kind of the symbol.
			* @param range The range of the location of the symbol.
			* @param uri The resource of the location of symbol.
			* @param containerName The name of the symbol containing the symbol.
			*/
			function create(name, kind, range, uri, containerName) {
				var result = {
					name,
					kind,
					location: {
						uri,
						range
					}
				};
				if (containerName) result.containerName = containerName;
				return result;
			}
			SymbolInformation$2.create = create;
		})(SymbolInformation$1 || (exports$1.SymbolInformation = SymbolInformation$1 = {}));
		var WorkspaceSymbol$1;
		(function(WorkspaceSymbol$2) {
			/**
			* Create a new workspace symbol.
			*
			* @param name The name of the symbol.
			* @param kind The kind of the symbol.
			* @param uri The resource of the location of the symbol.
			* @param range An options range of the location.
			* @returns A WorkspaceSymbol.
			*/
			function create(name, kind, uri, range) {
				return range !== void 0 ? {
					name,
					kind,
					location: {
						uri,
						range
					}
				} : {
					name,
					kind,
					location: { uri }
				};
			}
			WorkspaceSymbol$2.create = create;
		})(WorkspaceSymbol$1 || (exports$1.WorkspaceSymbol = WorkspaceSymbol$1 = {}));
		var DocumentSymbol$1;
		(function(DocumentSymbol$2) {
			/**
			* Creates a new symbol information literal.
			*
			* @param name The name of the symbol.
			* @param detail The detail of the symbol.
			* @param kind The kind of the symbol.
			* @param range The range of the symbol.
			* @param selectionRange The selectionRange of the symbol.
			* @param children Children of the symbol.
			*/
			function create(name, detail, kind, range, selectionRange, children) {
				var result = {
					name,
					detail,
					kind,
					range,
					selectionRange
				};
				if (children !== void 0) result.children = children;
				return result;
			}
			DocumentSymbol$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link DocumentSymbol} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return candidate && Is$8.string(candidate.name) && Is$8.number(candidate.kind) && Range$1.is(candidate.range) && Range$1.is(candidate.selectionRange) && (candidate.detail === void 0 || Is$8.string(candidate.detail)) && (candidate.deprecated === void 0 || Is$8.boolean(candidate.deprecated)) && (candidate.children === void 0 || Array.isArray(candidate.children)) && (candidate.tags === void 0 || Array.isArray(candidate.tags));
			}
			DocumentSymbol$2.is = is$1;
		})(DocumentSymbol$1 || (exports$1.DocumentSymbol = DocumentSymbol$1 = {}));
		/**
		* A set of predefined code action kinds
		*/
		var CodeActionKind$2;
		(function(CodeActionKind$3) {
			/**
			* Empty kind.
			*/
			CodeActionKind$3.Empty = "";
			/**
			* Base kind for quickfix actions: 'quickfix'
			*/
			CodeActionKind$3.QuickFix = "quickfix";
			/**
			* Base kind for refactoring actions: 'refactor'
			*/
			CodeActionKind$3.Refactor = "refactor";
			/**
			* Base kind for refactoring extraction actions: 'refactor.extract'
			*
			* Example extract actions:
			*
			* - Extract method
			* - Extract function
			* - Extract variable
			* - Extract interface from class
			* - ...
			*/
			CodeActionKind$3.RefactorExtract = "refactor.extract";
			/**
			* Base kind for refactoring inline actions: 'refactor.inline'
			*
			* Example inline actions:
			*
			* - Inline function
			* - Inline variable
			* - Inline constant
			* - ...
			*/
			CodeActionKind$3.RefactorInline = "refactor.inline";
			/**
			* Base kind for refactoring rewrite actions: 'refactor.rewrite'
			*
			* Example rewrite actions:
			*
			* - Convert JavaScript function to class
			* - Add or remove parameter
			* - Encapsulate field
			* - Make method static
			* - Move method to base class
			* - ...
			*/
			CodeActionKind$3.RefactorRewrite = "refactor.rewrite";
			/**
			* Base kind for source actions: `source`
			*
			* Source code actions apply to the entire file.
			*/
			CodeActionKind$3.Source = "source";
			/**
			* Base kind for an organize imports source action: `source.organizeImports`
			*/
			CodeActionKind$3.SourceOrganizeImports = "source.organizeImports";
			/**
			* Base kind for auto-fix source actions: `source.fixAll`.
			*
			* Fix all actions automatically fix errors that have a clear fix that do not require user input.
			* They should not suppress errors or perform unsafe fixes such as generating new types or classes.
			*
			* @since 3.15.0
			*/
			CodeActionKind$3.SourceFixAll = "source.fixAll";
		})(CodeActionKind$2 || (exports$1.CodeActionKind = CodeActionKind$2 = {}));
		/**
		* The reason why code actions were requested.
		*
		* @since 3.17.0
		*/
		var CodeActionTriggerKind$1;
		(function(CodeActionTriggerKind$2) {
			/**
			* Code actions were explicitly requested by the user or by an extension.
			*/
			CodeActionTriggerKind$2.Invoked = 1;
			/**
			* Code actions were requested automatically.
			*
			* This typically happens when current selection in a file changes, but can
			* also be triggered when file content changes.
			*/
			CodeActionTriggerKind$2.Automatic = 2;
		})(CodeActionTriggerKind$1 || (exports$1.CodeActionTriggerKind = CodeActionTriggerKind$1 = {}));
		/**
		* The CodeActionContext namespace provides helper functions to work with
		* {@link CodeActionContext} literals.
		*/
		var CodeActionContext$1;
		(function(CodeActionContext$2) {
			/**
			* Creates a new CodeActionContext literal.
			*/
			function create(diagnostics, only, triggerKind) {
				var result = { diagnostics };
				if (only !== void 0 && only !== null) result.only = only;
				if (triggerKind !== void 0 && triggerKind !== null) result.triggerKind = triggerKind;
				return result;
			}
			CodeActionContext$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link CodeActionContext} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.defined(candidate) && Is$8.typedArray(candidate.diagnostics, Diagnostic$1.is) && (candidate.only === void 0 || Is$8.typedArray(candidate.only, Is$8.string)) && (candidate.triggerKind === void 0 || candidate.triggerKind === CodeActionTriggerKind$1.Invoked || candidate.triggerKind === CodeActionTriggerKind$1.Automatic);
			}
			CodeActionContext$2.is = is$1;
		})(CodeActionContext$1 || (exports$1.CodeActionContext = CodeActionContext$1 = {}));
		var CodeAction$1;
		(function(CodeAction$2) {
			function create(title, kindOrCommandOrEdit, kind) {
				var result = { title };
				var checkKind = true;
				if (typeof kindOrCommandOrEdit === "string") {
					checkKind = false;
					result.kind = kindOrCommandOrEdit;
				} else if (Command$1.is(kindOrCommandOrEdit)) result.command = kindOrCommandOrEdit;
				else result.edit = kindOrCommandOrEdit;
				if (checkKind && kind !== void 0) result.kind = kind;
				return result;
			}
			CodeAction$2.create = create;
			function is$1(value) {
				var candidate = value;
				return candidate && Is$8.string(candidate.title) && (candidate.diagnostics === void 0 || Is$8.typedArray(candidate.diagnostics, Diagnostic$1.is)) && (candidate.kind === void 0 || Is$8.string(candidate.kind)) && (candidate.edit !== void 0 || candidate.command !== void 0) && (candidate.command === void 0 || Command$1.is(candidate.command)) && (candidate.isPreferred === void 0 || Is$8.boolean(candidate.isPreferred)) && (candidate.edit === void 0 || WorkspaceEdit$1.is(candidate.edit));
			}
			CodeAction$2.is = is$1;
		})(CodeAction$1 || (exports$1.CodeAction = CodeAction$1 = {}));
		/**
		* The CodeLens namespace provides helper functions to work with
		* {@link CodeLens} literals.
		*/
		var CodeLens$1;
		(function(CodeLens$2) {
			/**
			* Creates a new CodeLens literal.
			*/
			function create(range, data) {
				var result = { range };
				if (Is$8.defined(data)) result.data = data;
				return result;
			}
			CodeLens$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link CodeLens} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.defined(candidate) && Range$1.is(candidate.range) && (Is$8.undefined(candidate.command) || Command$1.is(candidate.command));
			}
			CodeLens$2.is = is$1;
		})(CodeLens$1 || (exports$1.CodeLens = CodeLens$1 = {}));
		/**
		* The FormattingOptions namespace provides helper functions to work with
		* {@link FormattingOptions} literals.
		*/
		var FormattingOptions$1;
		(function(FormattingOptions$2) {
			/**
			* Creates a new FormattingOptions literal.
			*/
			function create(tabSize, insertSpaces) {
				return {
					tabSize,
					insertSpaces
				};
			}
			FormattingOptions$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link FormattingOptions} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.defined(candidate) && Is$8.uinteger(candidate.tabSize) && Is$8.boolean(candidate.insertSpaces);
			}
			FormattingOptions$2.is = is$1;
		})(FormattingOptions$1 || (exports$1.FormattingOptions = FormattingOptions$1 = {}));
		/**
		* The DocumentLink namespace provides helper functions to work with
		* {@link DocumentLink} literals.
		*/
		var DocumentLink$1;
		(function(DocumentLink$2) {
			/**
			* Creates a new DocumentLink literal.
			*/
			function create(range, target, data) {
				return {
					range,
					target,
					data
				};
			}
			DocumentLink$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link DocumentLink} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.defined(candidate) && Range$1.is(candidate.range) && (Is$8.undefined(candidate.target) || Is$8.string(candidate.target));
			}
			DocumentLink$2.is = is$1;
		})(DocumentLink$1 || (exports$1.DocumentLink = DocumentLink$1 = {}));
		/**
		* The SelectionRange namespace provides helper function to work with
		* SelectionRange literals.
		*/
		var SelectionRange$1;
		(function(SelectionRange$2) {
			/**
			* Creates a new SelectionRange
			* @param range the range.
			* @param parent an optional parent.
			*/
			function create(range, parent) {
				return {
					range,
					parent
				};
			}
			SelectionRange$2.create = create;
			function is$1(value) {
				var candidate = value;
				return Is$8.objectLiteral(candidate) && Range$1.is(candidate.range) && (candidate.parent === void 0 || SelectionRange$2.is(candidate.parent));
			}
			SelectionRange$2.is = is$1;
		})(SelectionRange$1 || (exports$1.SelectionRange = SelectionRange$1 = {}));
		/**
		* A set of predefined token types. This set is not fixed
		* an clients can specify additional token types via the
		* corresponding client capabilities.
		*
		* @since 3.16.0
		*/
		var SemanticTokenTypes$1;
		(function(SemanticTokenTypes$2) {
			SemanticTokenTypes$2["namespace"] = "namespace";
			/**
			* Represents a generic type. Acts as a fallback for types which can't be mapped to
			* a specific type like class or enum.
			*/
			SemanticTokenTypes$2["type"] = "type";
			SemanticTokenTypes$2["class"] = "class";
			SemanticTokenTypes$2["enum"] = "enum";
			SemanticTokenTypes$2["interface"] = "interface";
			SemanticTokenTypes$2["struct"] = "struct";
			SemanticTokenTypes$2["typeParameter"] = "typeParameter";
			SemanticTokenTypes$2["parameter"] = "parameter";
			SemanticTokenTypes$2["variable"] = "variable";
			SemanticTokenTypes$2["property"] = "property";
			SemanticTokenTypes$2["enumMember"] = "enumMember";
			SemanticTokenTypes$2["event"] = "event";
			SemanticTokenTypes$2["function"] = "function";
			SemanticTokenTypes$2["method"] = "method";
			SemanticTokenTypes$2["macro"] = "macro";
			SemanticTokenTypes$2["keyword"] = "keyword";
			SemanticTokenTypes$2["modifier"] = "modifier";
			SemanticTokenTypes$2["comment"] = "comment";
			SemanticTokenTypes$2["string"] = "string";
			SemanticTokenTypes$2["number"] = "number";
			SemanticTokenTypes$2["regexp"] = "regexp";
			SemanticTokenTypes$2["operator"] = "operator";
			/**
			* @since 3.17.0
			*/
			SemanticTokenTypes$2["decorator"] = "decorator";
		})(SemanticTokenTypes$1 || (exports$1.SemanticTokenTypes = SemanticTokenTypes$1 = {}));
		/**
		* A set of predefined token modifiers. This set is not fixed
		* an clients can specify additional token types via the
		* corresponding client capabilities.
		*
		* @since 3.16.0
		*/
		var SemanticTokenModifiers$1;
		(function(SemanticTokenModifiers$2) {
			SemanticTokenModifiers$2["declaration"] = "declaration";
			SemanticTokenModifiers$2["definition"] = "definition";
			SemanticTokenModifiers$2["readonly"] = "readonly";
			SemanticTokenModifiers$2["static"] = "static";
			SemanticTokenModifiers$2["deprecated"] = "deprecated";
			SemanticTokenModifiers$2["abstract"] = "abstract";
			SemanticTokenModifiers$2["async"] = "async";
			SemanticTokenModifiers$2["modification"] = "modification";
			SemanticTokenModifiers$2["documentation"] = "documentation";
			SemanticTokenModifiers$2["defaultLibrary"] = "defaultLibrary";
		})(SemanticTokenModifiers$1 || (exports$1.SemanticTokenModifiers = SemanticTokenModifiers$1 = {}));
		/**
		* @since 3.16.0
		*/
		var SemanticTokens$1;
		(function(SemanticTokens$2) {
			function is$1(value) {
				var candidate = value;
				return Is$8.objectLiteral(candidate) && (candidate.resultId === void 0 || typeof candidate.resultId === "string") && Array.isArray(candidate.data) && (candidate.data.length === 0 || typeof candidate.data[0] === "number");
			}
			SemanticTokens$2.is = is$1;
		})(SemanticTokens$1 || (exports$1.SemanticTokens = SemanticTokens$1 = {}));
		/**
		* The InlineValueText namespace provides functions to deal with InlineValueTexts.
		*
		* @since 3.17.0
		*/
		var InlineValueText$1;
		(function(InlineValueText$2) {
			/**
			* Creates a new InlineValueText literal.
			*/
			function create(range, text) {
				return {
					range,
					text
				};
			}
			InlineValueText$2.create = create;
			function is$1(value) {
				var candidate = value;
				return candidate !== void 0 && candidate !== null && Range$1.is(candidate.range) && Is$8.string(candidate.text);
			}
			InlineValueText$2.is = is$1;
		})(InlineValueText$1 || (exports$1.InlineValueText = InlineValueText$1 = {}));
		/**
		* The InlineValueVariableLookup namespace provides functions to deal with InlineValueVariableLookups.
		*
		* @since 3.17.0
		*/
		var InlineValueVariableLookup$1;
		(function(InlineValueVariableLookup$2) {
			/**
			* Creates a new InlineValueText literal.
			*/
			function create(range, variableName, caseSensitiveLookup) {
				return {
					range,
					variableName,
					caseSensitiveLookup
				};
			}
			InlineValueVariableLookup$2.create = create;
			function is$1(value) {
				var candidate = value;
				return candidate !== void 0 && candidate !== null && Range$1.is(candidate.range) && Is$8.boolean(candidate.caseSensitiveLookup) && (Is$8.string(candidate.variableName) || candidate.variableName === void 0);
			}
			InlineValueVariableLookup$2.is = is$1;
		})(InlineValueVariableLookup$1 || (exports$1.InlineValueVariableLookup = InlineValueVariableLookup$1 = {}));
		/**
		* The InlineValueEvaluatableExpression namespace provides functions to deal with InlineValueEvaluatableExpression.
		*
		* @since 3.17.0
		*/
		var InlineValueEvaluatableExpression$1;
		(function(InlineValueEvaluatableExpression$2) {
			/**
			* Creates a new InlineValueEvaluatableExpression literal.
			*/
			function create(range, expression) {
				return {
					range,
					expression
				};
			}
			InlineValueEvaluatableExpression$2.create = create;
			function is$1(value) {
				var candidate = value;
				return candidate !== void 0 && candidate !== null && Range$1.is(candidate.range) && (Is$8.string(candidate.expression) || candidate.expression === void 0);
			}
			InlineValueEvaluatableExpression$2.is = is$1;
		})(InlineValueEvaluatableExpression$1 || (exports$1.InlineValueEvaluatableExpression = InlineValueEvaluatableExpression$1 = {}));
		/**
		* The InlineValueContext namespace provides helper functions to work with
		* {@link InlineValueContext} literals.
		*
		* @since 3.17.0
		*/
		var InlineValueContext$1;
		(function(InlineValueContext$2) {
			/**
			* Creates a new InlineValueContext literal.
			*/
			function create(frameId, stoppedLocation) {
				return {
					frameId,
					stoppedLocation
				};
			}
			InlineValueContext$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link InlineValueContext} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.defined(candidate) && Range$1.is(value.stoppedLocation);
			}
			InlineValueContext$2.is = is$1;
		})(InlineValueContext$1 || (exports$1.InlineValueContext = InlineValueContext$1 = {}));
		/**
		* Inlay hint kinds.
		*
		* @since 3.17.0
		*/
		var InlayHintKind$1;
		(function(InlayHintKind$2) {
			/**
			* An inlay hint that for a type annotation.
			*/
			InlayHintKind$2.Type = 1;
			/**
			* An inlay hint that is for a parameter.
			*/
			InlayHintKind$2.Parameter = 2;
			function is$1(value) {
				return value === 1 || value === 2;
			}
			InlayHintKind$2.is = is$1;
		})(InlayHintKind$1 || (exports$1.InlayHintKind = InlayHintKind$1 = {}));
		var InlayHintLabelPart$1;
		(function(InlayHintLabelPart$2) {
			function create(value) {
				return { value };
			}
			InlayHintLabelPart$2.create = create;
			function is$1(value) {
				var candidate = value;
				return Is$8.objectLiteral(candidate) && (candidate.tooltip === void 0 || Is$8.string(candidate.tooltip) || MarkupContent$1.is(candidate.tooltip)) && (candidate.location === void 0 || Location$1.is(candidate.location)) && (candidate.command === void 0 || Command$1.is(candidate.command));
			}
			InlayHintLabelPart$2.is = is$1;
		})(InlayHintLabelPart$1 || (exports$1.InlayHintLabelPart = InlayHintLabelPart$1 = {}));
		var InlayHint$1;
		(function(InlayHint$2) {
			function create(position, label, kind) {
				var result = {
					position,
					label
				};
				if (kind !== void 0) result.kind = kind;
				return result;
			}
			InlayHint$2.create = create;
			function is$1(value) {
				var candidate = value;
				return Is$8.objectLiteral(candidate) && Position$1.is(candidate.position) && (Is$8.string(candidate.label) || Is$8.typedArray(candidate.label, InlayHintLabelPart$1.is)) && (candidate.kind === void 0 || InlayHintKind$1.is(candidate.kind)) && candidate.textEdits === void 0 || Is$8.typedArray(candidate.textEdits, TextEdit$1.is) && (candidate.tooltip === void 0 || Is$8.string(candidate.tooltip) || MarkupContent$1.is(candidate.tooltip)) && (candidate.paddingLeft === void 0 || Is$8.boolean(candidate.paddingLeft)) && (candidate.paddingRight === void 0 || Is$8.boolean(candidate.paddingRight));
			}
			InlayHint$2.is = is$1;
		})(InlayHint$1 || (exports$1.InlayHint = InlayHint$1 = {}));
		var StringValue$1;
		(function(StringValue$2) {
			function createSnippet(value) {
				return {
					kind: "snippet",
					value
				};
			}
			StringValue$2.createSnippet = createSnippet;
		})(StringValue$1 || (exports$1.StringValue = StringValue$1 = {}));
		var InlineCompletionItem$1;
		(function(InlineCompletionItem$2) {
			function create(insertText, filterText, range, command) {
				return {
					insertText,
					filterText,
					range,
					command
				};
			}
			InlineCompletionItem$2.create = create;
		})(InlineCompletionItem$1 || (exports$1.InlineCompletionItem = InlineCompletionItem$1 = {}));
		var InlineCompletionList$1;
		(function(InlineCompletionList$2) {
			function create(items) {
				return { items };
			}
			InlineCompletionList$2.create = create;
		})(InlineCompletionList$1 || (exports$1.InlineCompletionList = InlineCompletionList$1 = {}));
		/**
		* Describes how an {@link InlineCompletionItemProvider inline completion provider} was triggered.
		*
		* @since 3.18.0
		* @proposed
		*/
		var InlineCompletionTriggerKind$1;
		(function(InlineCompletionTriggerKind$2) {
			/**
			* Completion was triggered explicitly by a user gesture.
			*/
			InlineCompletionTriggerKind$2.Invoked = 0;
			/**
			* Completion was triggered automatically while editing.
			*/
			InlineCompletionTriggerKind$2.Automatic = 1;
		})(InlineCompletionTriggerKind$1 || (exports$1.InlineCompletionTriggerKind = InlineCompletionTriggerKind$1 = {}));
		var SelectedCompletionInfo$1;
		(function(SelectedCompletionInfo$2) {
			function create(range, text) {
				return {
					range,
					text
				};
			}
			SelectedCompletionInfo$2.create = create;
		})(SelectedCompletionInfo$1 || (exports$1.SelectedCompletionInfo = SelectedCompletionInfo$1 = {}));
		var InlineCompletionContext$1;
		(function(InlineCompletionContext$2) {
			function create(triggerKind, selectedCompletionInfo) {
				return {
					triggerKind,
					selectedCompletionInfo
				};
			}
			InlineCompletionContext$2.create = create;
		})(InlineCompletionContext$1 || (exports$1.InlineCompletionContext = InlineCompletionContext$1 = {}));
		var WorkspaceFolder$1;
		(function(WorkspaceFolder$2) {
			function is$1(value) {
				var candidate = value;
				return Is$8.objectLiteral(candidate) && URI$1.is(candidate.uri) && Is$8.string(candidate.name);
			}
			WorkspaceFolder$2.is = is$1;
		})(WorkspaceFolder$1 || (exports$1.WorkspaceFolder = WorkspaceFolder$1 = {}));
		exports$1.EOL = [
			"\n",
			"\r\n",
			"\r"
		];
		/**
		* @deprecated Use the text document from the new vscode-languageserver-textdocument package.
		*/
		var TextDocument$1;
		(function(TextDocument$2) {
			/**
			* Creates a new ITextDocument literal from the given uri and content.
			* @param uri The document's uri.
			* @param languageId The document's language Id.
			* @param version The document's version.
			* @param content The document's content.
			*/
			function create(uri, languageId, version, content) {
				return new FullTextDocument$1(uri, languageId, version, content);
			}
			TextDocument$2.create = create;
			/**
			* Checks whether the given literal conforms to the {@link ITextDocument} interface.
			*/
			function is$1(value) {
				var candidate = value;
				return Is$8.defined(candidate) && Is$8.string(candidate.uri) && (Is$8.undefined(candidate.languageId) || Is$8.string(candidate.languageId)) && Is$8.uinteger(candidate.lineCount) && Is$8.func(candidate.getText) && Is$8.func(candidate.positionAt) && Is$8.func(candidate.offsetAt) ? true : false;
			}
			TextDocument$2.is = is$1;
			function applyEdits(document, edits) {
				var text = document.getText();
				var sortedEdits = mergeSort(edits, function(a, b) {
					var diff = a.range.start.line - b.range.start.line;
					if (diff === 0) return a.range.start.character - b.range.start.character;
					return diff;
				});
				var lastModifiedOffset = text.length;
				for (var i = sortedEdits.length - 1; i >= 0; i--) {
					var e = sortedEdits[i];
					var startOffset = document.offsetAt(e.range.start);
					var endOffset = document.offsetAt(e.range.end);
					if (endOffset <= lastModifiedOffset) text = text.substring(0, startOffset) + e.newText + text.substring(endOffset, text.length);
					else throw new Error("Overlapping edit");
					lastModifiedOffset = startOffset;
				}
				return text;
			}
			TextDocument$2.applyEdits = applyEdits;
			function mergeSort(data, compare) {
				if (data.length <= 1) return data;
				var p = data.length / 2 | 0;
				var left = data.slice(0, p);
				var right = data.slice(p);
				mergeSort(left, compare);
				mergeSort(right, compare);
				var leftIdx = 0;
				var rightIdx = 0;
				var i = 0;
				while (leftIdx < left.length && rightIdx < right.length) {
					var ret = compare(left[leftIdx], right[rightIdx]);
					if (ret <= 0) data[i++] = left[leftIdx++];
					else data[i++] = right[rightIdx++];
				}
				while (leftIdx < left.length) data[i++] = left[leftIdx++];
				while (rightIdx < right.length) data[i++] = right[rightIdx++];
				return data;
			}
		})(TextDocument$1 || (exports$1.TextDocument = TextDocument$1 = {}));
		/**
		* @deprecated Use the text document from the new vscode-languageserver-textdocument package.
		*/
		var FullTextDocument$1 = function() {
			function FullTextDocument$2(uri, languageId, version, content) {
				this._uri = uri;
				this._languageId = languageId;
				this._version = version;
				this._content = content;
				this._lineOffsets = void 0;
			}
			Object.defineProperty(FullTextDocument$2.prototype, "uri", {
				get: function() {
					return this._uri;
				},
				enumerable: false,
				configurable: true
			});
			Object.defineProperty(FullTextDocument$2.prototype, "languageId", {
				get: function() {
					return this._languageId;
				},
				enumerable: false,
				configurable: true
			});
			Object.defineProperty(FullTextDocument$2.prototype, "version", {
				get: function() {
					return this._version;
				},
				enumerable: false,
				configurable: true
			});
			FullTextDocument$2.prototype.getText = function(range) {
				if (range) {
					var start = this.offsetAt(range.start);
					var end = this.offsetAt(range.end);
					return this._content.substring(start, end);
				}
				return this._content;
			};
			FullTextDocument$2.prototype.update = function(event, version) {
				this._content = event.text;
				this._version = version;
				this._lineOffsets = void 0;
			};
			FullTextDocument$2.prototype.getLineOffsets = function() {
				if (this._lineOffsets === void 0) {
					var lineOffsets = [];
					var text = this._content;
					var isLineStart = true;
					for (var i = 0; i < text.length; i++) {
						if (isLineStart) {
							lineOffsets.push(i);
							isLineStart = false;
						}
						var ch = text.charAt(i);
						isLineStart = ch === "\r" || ch === "\n";
						if (ch === "\r" && i + 1 < text.length && text.charAt(i + 1) === "\n") i++;
					}
					if (isLineStart && text.length > 0) lineOffsets.push(text.length);
					this._lineOffsets = lineOffsets;
				}
				return this._lineOffsets;
			};
			FullTextDocument$2.prototype.positionAt = function(offset) {
				offset = Math.max(Math.min(offset, this._content.length), 0);
				var lineOffsets = this.getLineOffsets();
				var low = 0, high = lineOffsets.length;
				if (high === 0) return Position$1.create(0, offset);
				while (low < high) {
					var mid = Math.floor((low + high) / 2);
					if (lineOffsets[mid] > offset) high = mid;
					else low = mid + 1;
				}
				var line = low - 1;
				return Position$1.create(line, offset - lineOffsets[line]);
			};
			FullTextDocument$2.prototype.offsetAt = function(position) {
				var lineOffsets = this.getLineOffsets();
				if (position.line >= lineOffsets.length) return this._content.length;
				else if (position.line < 0) return 0;
				var lineOffset = lineOffsets[position.line];
				var nextLineOffset = position.line + 1 < lineOffsets.length ? lineOffsets[position.line + 1] : this._content.length;
				return Math.max(Math.min(lineOffset + position.character, nextLineOffset), lineOffset);
			};
			Object.defineProperty(FullTextDocument$2.prototype, "lineCount", {
				get: function() {
					return this.getLineOffsets().length;
				},
				enumerable: false,
				configurable: true
			});
			return FullTextDocument$2;
		}();
		var Is$8;
		(function(Is$9) {
			var toString = Object.prototype.toString;
			function defined(value) {
				return typeof value !== "undefined";
			}
			Is$9.defined = defined;
			function undefined$1(value) {
				return typeof value === "undefined";
			}
			Is$9.undefined = undefined$1;
			function boolean$2(value) {
				return value === true || value === false;
			}
			Is$9.boolean = boolean$2;
			function string$2(value) {
				return toString.call(value) === "[object String]";
			}
			Is$9.string = string$2;
			function number$2(value) {
				return toString.call(value) === "[object Number]";
			}
			Is$9.number = number$2;
			function numberRange(value, min, max) {
				return toString.call(value) === "[object Number]" && min <= value && value <= max;
			}
			Is$9.numberRange = numberRange;
			function integer$2(value) {
				return toString.call(value) === "[object Number]" && -2147483648 <= value && value <= 2147483647;
			}
			Is$9.integer = integer$2;
			function uinteger$2(value) {
				return toString.call(value) === "[object Number]" && 0 <= value && value <= 2147483647;
			}
			Is$9.uinteger = uinteger$2;
			function func$2(value) {
				return toString.call(value) === "[object Function]";
			}
			Is$9.func = func$2;
			function objectLiteral$1(value) {
				return value !== null && typeof value === "object";
			}
			Is$9.objectLiteral = objectLiteral$1;
			function typedArray$1(value, check) {
				return Array.isArray(value) && value.every(check);
			}
			Is$9.typedArray = typedArray$1;
		})(Is$8 || (Is$8 = {}));
	});
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/messages.js
var require_messages = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/messages.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ProtocolNotificationType = exports.ProtocolNotificationType0 = exports.ProtocolRequestType = exports.ProtocolRequestType0 = exports.RegistrationType = exports.MessageDirection = void 0;
	const vscode_jsonrpc_1$3 = require_main$2();
	var MessageDirection;
	(function(MessageDirection$1) {
		MessageDirection$1["clientToServer"] = "clientToServer";
		MessageDirection$1["serverToClient"] = "serverToClient";
		MessageDirection$1["both"] = "both";
	})(MessageDirection || (exports.MessageDirection = MessageDirection = {}));
	var RegistrationType = class {
		constructor(method) {
			this.method = method;
		}
	};
	exports.RegistrationType = RegistrationType;
	var ProtocolRequestType0 = class extends vscode_jsonrpc_1$3.RequestType0 {
		constructor(method) {
			super(method);
		}
	};
	exports.ProtocolRequestType0 = ProtocolRequestType0;
	var ProtocolRequestType = class extends vscode_jsonrpc_1$3.RequestType {
		constructor(method) {
			super(method, vscode_jsonrpc_1$3.ParameterStructures.byName);
		}
	};
	exports.ProtocolRequestType = ProtocolRequestType;
	var ProtocolNotificationType0 = class extends vscode_jsonrpc_1$3.NotificationType0 {
		constructor(method) {
			super(method);
		}
	};
	exports.ProtocolNotificationType0 = ProtocolNotificationType0;
	var ProtocolNotificationType = class extends vscode_jsonrpc_1$3.NotificationType {
		constructor(method) {
			super(method, vscode_jsonrpc_1$3.ParameterStructures.byName);
		}
	};
	exports.ProtocolNotificationType = ProtocolNotificationType;
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/utils/is.js
var require_is = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/utils/is.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.objectLiteral = exports.typedArray = exports.stringArray = exports.array = exports.func = exports.error = exports.number = exports.string = exports.boolean = void 0;
	function boolean(value) {
		return value === true || value === false;
	}
	exports.boolean = boolean;
	function string(value) {
		return typeof value === "string" || value instanceof String;
	}
	exports.string = string;
	function number(value) {
		return typeof value === "number" || value instanceof Number;
	}
	exports.number = number;
	function error(value) {
		return value instanceof Error;
	}
	exports.error = error;
	function func(value) {
		return typeof value === "function";
	}
	exports.func = func;
	function array(value) {
		return Array.isArray(value);
	}
	exports.array = array;
	function stringArray(value) {
		return array(value) && value.every((elem) => string(elem));
	}
	exports.stringArray = stringArray;
	function typedArray(value, check) {
		return Array.isArray(value) && value.every(check);
	}
	exports.typedArray = typedArray;
	function objectLiteral(value) {
		return value !== null && typeof value === "object";
	}
	exports.objectLiteral = objectLiteral;
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.implementation.js
var require_protocol_implementation = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.implementation.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ImplementationRequest = void 0;
	const messages_1$21 = require_messages();
	/**
	* A request to resolve the implementation locations of a symbol at a given text
	* document position. The request's parameter is of type {@link TextDocumentPositionParams}
	* the response is of type {@link Definition} or a Thenable that resolves to such.
	*/
	var ImplementationRequest;
	(function(ImplementationRequest$1) {
		ImplementationRequest$1.method = "textDocument/implementation";
		ImplementationRequest$1.messageDirection = messages_1$21.MessageDirection.clientToServer;
		ImplementationRequest$1.type = new messages_1$21.ProtocolRequestType(ImplementationRequest$1.method);
	})(ImplementationRequest || (exports.ImplementationRequest = ImplementationRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.typeDefinition.js
var require_protocol_typeDefinition = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.typeDefinition.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.TypeDefinitionRequest = void 0;
	const messages_1$20 = require_messages();
	/**
	* A request to resolve the type definition locations of a symbol at a given text
	* document position. The request's parameter is of type {@link TextDocumentPositionParams}
	* the response is of type {@link Definition} or a Thenable that resolves to such.
	*/
	var TypeDefinitionRequest;
	(function(TypeDefinitionRequest$1) {
		TypeDefinitionRequest$1.method = "textDocument/typeDefinition";
		TypeDefinitionRequest$1.messageDirection = messages_1$20.MessageDirection.clientToServer;
		TypeDefinitionRequest$1.type = new messages_1$20.ProtocolRequestType(TypeDefinitionRequest$1.method);
	})(TypeDefinitionRequest || (exports.TypeDefinitionRequest = TypeDefinitionRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.workspaceFolder.js
var require_protocol_workspaceFolder = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.workspaceFolder.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.DidChangeWorkspaceFoldersNotification = exports.WorkspaceFoldersRequest = void 0;
	const messages_1$19 = require_messages();
	/**
	* The `workspace/workspaceFolders` is sent from the server to the client to fetch the open workspace folders.
	*/
	var WorkspaceFoldersRequest;
	(function(WorkspaceFoldersRequest$1) {
		WorkspaceFoldersRequest$1.method = "workspace/workspaceFolders";
		WorkspaceFoldersRequest$1.messageDirection = messages_1$19.MessageDirection.serverToClient;
		WorkspaceFoldersRequest$1.type = new messages_1$19.ProtocolRequestType0(WorkspaceFoldersRequest$1.method);
	})(WorkspaceFoldersRequest || (exports.WorkspaceFoldersRequest = WorkspaceFoldersRequest = {}));
	/**
	* The `workspace/didChangeWorkspaceFolders` notification is sent from the client to the server when the workspace
	* folder configuration changes.
	*/
	var DidChangeWorkspaceFoldersNotification;
	(function(DidChangeWorkspaceFoldersNotification$1) {
		DidChangeWorkspaceFoldersNotification$1.method = "workspace/didChangeWorkspaceFolders";
		DidChangeWorkspaceFoldersNotification$1.messageDirection = messages_1$19.MessageDirection.clientToServer;
		DidChangeWorkspaceFoldersNotification$1.type = new messages_1$19.ProtocolNotificationType(DidChangeWorkspaceFoldersNotification$1.method);
	})(DidChangeWorkspaceFoldersNotification || (exports.DidChangeWorkspaceFoldersNotification = DidChangeWorkspaceFoldersNotification = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.configuration.js
var require_protocol_configuration = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.configuration.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ConfigurationRequest = void 0;
	const messages_1$18 = require_messages();
	/**
	* The 'workspace/configuration' request is sent from the server to the client to fetch a certain
	* configuration setting.
	*
	* This pull model replaces the old push model were the client signaled configuration change via an
	* event. If the server still needs to react to configuration changes (since the server caches the
	* result of `workspace/configuration` requests) the server should register for an empty configuration
	* change event and empty the cache if such an event is received.
	*/
	var ConfigurationRequest;
	(function(ConfigurationRequest$1) {
		ConfigurationRequest$1.method = "workspace/configuration";
		ConfigurationRequest$1.messageDirection = messages_1$18.MessageDirection.serverToClient;
		ConfigurationRequest$1.type = new messages_1$18.ProtocolRequestType(ConfigurationRequest$1.method);
	})(ConfigurationRequest || (exports.ConfigurationRequest = ConfigurationRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.colorProvider.js
var require_protocol_colorProvider = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.colorProvider.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ColorPresentationRequest = exports.DocumentColorRequest = void 0;
	const messages_1$17 = require_messages();
	/**
	* A request to list all color symbols found in a given text document. The request's
	* parameter is of type {@link DocumentColorParams} the
	* response is of type {@link ColorInformation ColorInformation[]} or a Thenable
	* that resolves to such.
	*/
	var DocumentColorRequest;
	(function(DocumentColorRequest$1) {
		DocumentColorRequest$1.method = "textDocument/documentColor";
		DocumentColorRequest$1.messageDirection = messages_1$17.MessageDirection.clientToServer;
		DocumentColorRequest$1.type = new messages_1$17.ProtocolRequestType(DocumentColorRequest$1.method);
	})(DocumentColorRequest || (exports.DocumentColorRequest = DocumentColorRequest = {}));
	/**
	* A request to list all presentation for a color. The request's
	* parameter is of type {@link ColorPresentationParams} the
	* response is of type {@link ColorInformation ColorInformation[]} or a Thenable
	* that resolves to such.
	*/
	var ColorPresentationRequest;
	(function(ColorPresentationRequest$1) {
		ColorPresentationRequest$1.method = "textDocument/colorPresentation";
		ColorPresentationRequest$1.messageDirection = messages_1$17.MessageDirection.clientToServer;
		ColorPresentationRequest$1.type = new messages_1$17.ProtocolRequestType(ColorPresentationRequest$1.method);
	})(ColorPresentationRequest || (exports.ColorPresentationRequest = ColorPresentationRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.foldingRange.js
var require_protocol_foldingRange = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.foldingRange.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.FoldingRangeRefreshRequest = exports.FoldingRangeRequest = void 0;
	const messages_1$16 = require_messages();
	/**
	* A request to provide folding ranges in a document. The request's
	* parameter is of type {@link FoldingRangeParams}, the
	* response is of type {@link FoldingRangeList} or a Thenable
	* that resolves to such.
	*/
	var FoldingRangeRequest;
	(function(FoldingRangeRequest$1) {
		FoldingRangeRequest$1.method = "textDocument/foldingRange";
		FoldingRangeRequest$1.messageDirection = messages_1$16.MessageDirection.clientToServer;
		FoldingRangeRequest$1.type = new messages_1$16.ProtocolRequestType(FoldingRangeRequest$1.method);
	})(FoldingRangeRequest || (exports.FoldingRangeRequest = FoldingRangeRequest = {}));
	/**
	* @since 3.18.0
	* @proposed
	*/
	var FoldingRangeRefreshRequest;
	(function(FoldingRangeRefreshRequest$1) {
		FoldingRangeRefreshRequest$1.method = `workspace/foldingRange/refresh`;
		FoldingRangeRefreshRequest$1.messageDirection = messages_1$16.MessageDirection.serverToClient;
		FoldingRangeRefreshRequest$1.type = new messages_1$16.ProtocolRequestType0(FoldingRangeRefreshRequest$1.method);
	})(FoldingRangeRefreshRequest || (exports.FoldingRangeRefreshRequest = FoldingRangeRefreshRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.declaration.js
var require_protocol_declaration = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.declaration.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.DeclarationRequest = void 0;
	const messages_1$15 = require_messages();
	/**
	* A request to resolve the type definition locations of a symbol at a given text
	* document position. The request's parameter is of type {@link TextDocumentPositionParams}
	* the response is of type {@link Declaration} or a typed array of {@link DeclarationLink}
	* or a Thenable that resolves to such.
	*/
	var DeclarationRequest;
	(function(DeclarationRequest$1) {
		DeclarationRequest$1.method = "textDocument/declaration";
		DeclarationRequest$1.messageDirection = messages_1$15.MessageDirection.clientToServer;
		DeclarationRequest$1.type = new messages_1$15.ProtocolRequestType(DeclarationRequest$1.method);
	})(DeclarationRequest || (exports.DeclarationRequest = DeclarationRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.selectionRange.js
var require_protocol_selectionRange = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.selectionRange.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.SelectionRangeRequest = void 0;
	const messages_1$14 = require_messages();
	/**
	* A request to provide selection ranges in a document. The request's
	* parameter is of type {@link SelectionRangeParams}, the
	* response is of type {@link SelectionRange SelectionRange[]} or a Thenable
	* that resolves to such.
	*/
	var SelectionRangeRequest;
	(function(SelectionRangeRequest$1) {
		SelectionRangeRequest$1.method = "textDocument/selectionRange";
		SelectionRangeRequest$1.messageDirection = messages_1$14.MessageDirection.clientToServer;
		SelectionRangeRequest$1.type = new messages_1$14.ProtocolRequestType(SelectionRangeRequest$1.method);
	})(SelectionRangeRequest || (exports.SelectionRangeRequest = SelectionRangeRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.progress.js
var require_protocol_progress = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.progress.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.WorkDoneProgressCancelNotification = exports.WorkDoneProgressCreateRequest = exports.WorkDoneProgress = void 0;
	const vscode_jsonrpc_1$2 = require_main$2();
	const messages_1$13 = require_messages();
	var WorkDoneProgress;
	(function(WorkDoneProgress$1) {
		WorkDoneProgress$1.type = new vscode_jsonrpc_1$2.ProgressType();
		function is$1(value) {
			return value === WorkDoneProgress$1.type;
		}
		WorkDoneProgress$1.is = is$1;
	})(WorkDoneProgress || (exports.WorkDoneProgress = WorkDoneProgress = {}));
	/**
	* The `window/workDoneProgress/create` request is sent from the server to the client to initiate progress
	* reporting from the server.
	*/
	var WorkDoneProgressCreateRequest;
	(function(WorkDoneProgressCreateRequest$1) {
		WorkDoneProgressCreateRequest$1.method = "window/workDoneProgress/create";
		WorkDoneProgressCreateRequest$1.messageDirection = messages_1$13.MessageDirection.serverToClient;
		WorkDoneProgressCreateRequest$1.type = new messages_1$13.ProtocolRequestType(WorkDoneProgressCreateRequest$1.method);
	})(WorkDoneProgressCreateRequest || (exports.WorkDoneProgressCreateRequest = WorkDoneProgressCreateRequest = {}));
	/**
	* The `window/workDoneProgress/cancel` notification is sent from  the client to the server to cancel a progress
	* initiated on the server side.
	*/
	var WorkDoneProgressCancelNotification;
	(function(WorkDoneProgressCancelNotification$1) {
		WorkDoneProgressCancelNotification$1.method = "window/workDoneProgress/cancel";
		WorkDoneProgressCancelNotification$1.messageDirection = messages_1$13.MessageDirection.clientToServer;
		WorkDoneProgressCancelNotification$1.type = new messages_1$13.ProtocolNotificationType(WorkDoneProgressCancelNotification$1.method);
	})(WorkDoneProgressCancelNotification || (exports.WorkDoneProgressCancelNotification = WorkDoneProgressCancelNotification = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.callHierarchy.js
var require_protocol_callHierarchy = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.callHierarchy.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.CallHierarchyOutgoingCallsRequest = exports.CallHierarchyIncomingCallsRequest = exports.CallHierarchyPrepareRequest = void 0;
	const messages_1$12 = require_messages();
	/**
	* A request to result a `CallHierarchyItem` in a document at a given position.
	* Can be used as an input to an incoming or outgoing call hierarchy.
	*
	* @since 3.16.0
	*/
	var CallHierarchyPrepareRequest;
	(function(CallHierarchyPrepareRequest$1) {
		CallHierarchyPrepareRequest$1.method = "textDocument/prepareCallHierarchy";
		CallHierarchyPrepareRequest$1.messageDirection = messages_1$12.MessageDirection.clientToServer;
		CallHierarchyPrepareRequest$1.type = new messages_1$12.ProtocolRequestType(CallHierarchyPrepareRequest$1.method);
	})(CallHierarchyPrepareRequest || (exports.CallHierarchyPrepareRequest = CallHierarchyPrepareRequest = {}));
	/**
	* A request to resolve the incoming calls for a given `CallHierarchyItem`.
	*
	* @since 3.16.0
	*/
	var CallHierarchyIncomingCallsRequest;
	(function(CallHierarchyIncomingCallsRequest$1) {
		CallHierarchyIncomingCallsRequest$1.method = "callHierarchy/incomingCalls";
		CallHierarchyIncomingCallsRequest$1.messageDirection = messages_1$12.MessageDirection.clientToServer;
		CallHierarchyIncomingCallsRequest$1.type = new messages_1$12.ProtocolRequestType(CallHierarchyIncomingCallsRequest$1.method);
	})(CallHierarchyIncomingCallsRequest || (exports.CallHierarchyIncomingCallsRequest = CallHierarchyIncomingCallsRequest = {}));
	/**
	* A request to resolve the outgoing calls for a given `CallHierarchyItem`.
	*
	* @since 3.16.0
	*/
	var CallHierarchyOutgoingCallsRequest;
	(function(CallHierarchyOutgoingCallsRequest$1) {
		CallHierarchyOutgoingCallsRequest$1.method = "callHierarchy/outgoingCalls";
		CallHierarchyOutgoingCallsRequest$1.messageDirection = messages_1$12.MessageDirection.clientToServer;
		CallHierarchyOutgoingCallsRequest$1.type = new messages_1$12.ProtocolRequestType(CallHierarchyOutgoingCallsRequest$1.method);
	})(CallHierarchyOutgoingCallsRequest || (exports.CallHierarchyOutgoingCallsRequest = CallHierarchyOutgoingCallsRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.semanticTokens.js
var require_protocol_semanticTokens = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.semanticTokens.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.SemanticTokensRefreshRequest = exports.SemanticTokensRangeRequest = exports.SemanticTokensDeltaRequest = exports.SemanticTokensRequest = exports.SemanticTokensRegistrationType = exports.TokenFormat = void 0;
	const messages_1$11 = require_messages();
	var TokenFormat;
	(function(TokenFormat$1) {
		TokenFormat$1.Relative = "relative";
	})(TokenFormat || (exports.TokenFormat = TokenFormat = {}));
	var SemanticTokensRegistrationType;
	(function(SemanticTokensRegistrationType$1) {
		SemanticTokensRegistrationType$1.method = "textDocument/semanticTokens";
		SemanticTokensRegistrationType$1.type = new messages_1$11.RegistrationType(SemanticTokensRegistrationType$1.method);
	})(SemanticTokensRegistrationType || (exports.SemanticTokensRegistrationType = SemanticTokensRegistrationType = {}));
	/**
	* @since 3.16.0
	*/
	var SemanticTokensRequest;
	(function(SemanticTokensRequest$1) {
		SemanticTokensRequest$1.method = "textDocument/semanticTokens/full";
		SemanticTokensRequest$1.messageDirection = messages_1$11.MessageDirection.clientToServer;
		SemanticTokensRequest$1.type = new messages_1$11.ProtocolRequestType(SemanticTokensRequest$1.method);
		SemanticTokensRequest$1.registrationMethod = SemanticTokensRegistrationType.method;
	})(SemanticTokensRequest || (exports.SemanticTokensRequest = SemanticTokensRequest = {}));
	/**
	* @since 3.16.0
	*/
	var SemanticTokensDeltaRequest;
	(function(SemanticTokensDeltaRequest$1) {
		SemanticTokensDeltaRequest$1.method = "textDocument/semanticTokens/full/delta";
		SemanticTokensDeltaRequest$1.messageDirection = messages_1$11.MessageDirection.clientToServer;
		SemanticTokensDeltaRequest$1.type = new messages_1$11.ProtocolRequestType(SemanticTokensDeltaRequest$1.method);
		SemanticTokensDeltaRequest$1.registrationMethod = SemanticTokensRegistrationType.method;
	})(SemanticTokensDeltaRequest || (exports.SemanticTokensDeltaRequest = SemanticTokensDeltaRequest = {}));
	/**
	* @since 3.16.0
	*/
	var SemanticTokensRangeRequest;
	(function(SemanticTokensRangeRequest$1) {
		SemanticTokensRangeRequest$1.method = "textDocument/semanticTokens/range";
		SemanticTokensRangeRequest$1.messageDirection = messages_1$11.MessageDirection.clientToServer;
		SemanticTokensRangeRequest$1.type = new messages_1$11.ProtocolRequestType(SemanticTokensRangeRequest$1.method);
		SemanticTokensRangeRequest$1.registrationMethod = SemanticTokensRegistrationType.method;
	})(SemanticTokensRangeRequest || (exports.SemanticTokensRangeRequest = SemanticTokensRangeRequest = {}));
	/**
	* @since 3.16.0
	*/
	var SemanticTokensRefreshRequest;
	(function(SemanticTokensRefreshRequest$1) {
		SemanticTokensRefreshRequest$1.method = `workspace/semanticTokens/refresh`;
		SemanticTokensRefreshRequest$1.messageDirection = messages_1$11.MessageDirection.serverToClient;
		SemanticTokensRefreshRequest$1.type = new messages_1$11.ProtocolRequestType0(SemanticTokensRefreshRequest$1.method);
	})(SemanticTokensRefreshRequest || (exports.SemanticTokensRefreshRequest = SemanticTokensRefreshRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.showDocument.js
var require_protocol_showDocument = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.showDocument.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ShowDocumentRequest = void 0;
	const messages_1$10 = require_messages();
	/**
	* A request to show a document. This request might open an
	* external program depending on the value of the URI to open.
	* For example a request to open `https://code.visualstudio.com/`
	* will very likely open the URI in a WEB browser.
	*
	* @since 3.16.0
	*/
	var ShowDocumentRequest;
	(function(ShowDocumentRequest$1) {
		ShowDocumentRequest$1.method = "window/showDocument";
		ShowDocumentRequest$1.messageDirection = messages_1$10.MessageDirection.serverToClient;
		ShowDocumentRequest$1.type = new messages_1$10.ProtocolRequestType(ShowDocumentRequest$1.method);
	})(ShowDocumentRequest || (exports.ShowDocumentRequest = ShowDocumentRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.linkedEditingRange.js
var require_protocol_linkedEditingRange = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.linkedEditingRange.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.LinkedEditingRangeRequest = void 0;
	const messages_1$9 = require_messages();
	/**
	* A request to provide ranges that can be edited together.
	*
	* @since 3.16.0
	*/
	var LinkedEditingRangeRequest;
	(function(LinkedEditingRangeRequest$1) {
		LinkedEditingRangeRequest$1.method = "textDocument/linkedEditingRange";
		LinkedEditingRangeRequest$1.messageDirection = messages_1$9.MessageDirection.clientToServer;
		LinkedEditingRangeRequest$1.type = new messages_1$9.ProtocolRequestType(LinkedEditingRangeRequest$1.method);
	})(LinkedEditingRangeRequest || (exports.LinkedEditingRangeRequest = LinkedEditingRangeRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.fileOperations.js
var require_protocol_fileOperations = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.fileOperations.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.WillDeleteFilesRequest = exports.DidDeleteFilesNotification = exports.DidRenameFilesNotification = exports.WillRenameFilesRequest = exports.DidCreateFilesNotification = exports.WillCreateFilesRequest = exports.FileOperationPatternKind = void 0;
	const messages_1$8 = require_messages();
	/**
	* A pattern kind describing if a glob pattern matches a file a folder or
	* both.
	*
	* @since 3.16.0
	*/
	var FileOperationPatternKind;
	(function(FileOperationPatternKind$1) {
		/**
		* The pattern matches a file only.
		*/
		FileOperationPatternKind$1.file = "file";
		/**
		* The pattern matches a folder only.
		*/
		FileOperationPatternKind$1.folder = "folder";
	})(FileOperationPatternKind || (exports.FileOperationPatternKind = FileOperationPatternKind = {}));
	/**
	* The will create files request is sent from the client to the server before files are actually
	* created as long as the creation is triggered from within the client.
	*
	* The request can return a `WorkspaceEdit` which will be applied to workspace before the
	* files are created. Hence the `WorkspaceEdit` can not manipulate the content of the file
	* to be created.
	*
	* @since 3.16.0
	*/
	var WillCreateFilesRequest;
	(function(WillCreateFilesRequest$1) {
		WillCreateFilesRequest$1.method = "workspace/willCreateFiles";
		WillCreateFilesRequest$1.messageDirection = messages_1$8.MessageDirection.clientToServer;
		WillCreateFilesRequest$1.type = new messages_1$8.ProtocolRequestType(WillCreateFilesRequest$1.method);
	})(WillCreateFilesRequest || (exports.WillCreateFilesRequest = WillCreateFilesRequest = {}));
	/**
	* The did create files notification is sent from the client to the server when
	* files were created from within the client.
	*
	* @since 3.16.0
	*/
	var DidCreateFilesNotification;
	(function(DidCreateFilesNotification$1) {
		DidCreateFilesNotification$1.method = "workspace/didCreateFiles";
		DidCreateFilesNotification$1.messageDirection = messages_1$8.MessageDirection.clientToServer;
		DidCreateFilesNotification$1.type = new messages_1$8.ProtocolNotificationType(DidCreateFilesNotification$1.method);
	})(DidCreateFilesNotification || (exports.DidCreateFilesNotification = DidCreateFilesNotification = {}));
	/**
	* The will rename files request is sent from the client to the server before files are actually
	* renamed as long as the rename is triggered from within the client.
	*
	* @since 3.16.0
	*/
	var WillRenameFilesRequest;
	(function(WillRenameFilesRequest$1) {
		WillRenameFilesRequest$1.method = "workspace/willRenameFiles";
		WillRenameFilesRequest$1.messageDirection = messages_1$8.MessageDirection.clientToServer;
		WillRenameFilesRequest$1.type = new messages_1$8.ProtocolRequestType(WillRenameFilesRequest$1.method);
	})(WillRenameFilesRequest || (exports.WillRenameFilesRequest = WillRenameFilesRequest = {}));
	/**
	* The did rename files notification is sent from the client to the server when
	* files were renamed from within the client.
	*
	* @since 3.16.0
	*/
	var DidRenameFilesNotification;
	(function(DidRenameFilesNotification$1) {
		DidRenameFilesNotification$1.method = "workspace/didRenameFiles";
		DidRenameFilesNotification$1.messageDirection = messages_1$8.MessageDirection.clientToServer;
		DidRenameFilesNotification$1.type = new messages_1$8.ProtocolNotificationType(DidRenameFilesNotification$1.method);
	})(DidRenameFilesNotification || (exports.DidRenameFilesNotification = DidRenameFilesNotification = {}));
	/**
	* The will delete files request is sent from the client to the server before files are actually
	* deleted as long as the deletion is triggered from within the client.
	*
	* @since 3.16.0
	*/
	var DidDeleteFilesNotification;
	(function(DidDeleteFilesNotification$1) {
		DidDeleteFilesNotification$1.method = "workspace/didDeleteFiles";
		DidDeleteFilesNotification$1.messageDirection = messages_1$8.MessageDirection.clientToServer;
		DidDeleteFilesNotification$1.type = new messages_1$8.ProtocolNotificationType(DidDeleteFilesNotification$1.method);
	})(DidDeleteFilesNotification || (exports.DidDeleteFilesNotification = DidDeleteFilesNotification = {}));
	/**
	* The did delete files notification is sent from the client to the server when
	* files were deleted from within the client.
	*
	* @since 3.16.0
	*/
	var WillDeleteFilesRequest;
	(function(WillDeleteFilesRequest$1) {
		WillDeleteFilesRequest$1.method = "workspace/willDeleteFiles";
		WillDeleteFilesRequest$1.messageDirection = messages_1$8.MessageDirection.clientToServer;
		WillDeleteFilesRequest$1.type = new messages_1$8.ProtocolRequestType(WillDeleteFilesRequest$1.method);
	})(WillDeleteFilesRequest || (exports.WillDeleteFilesRequest = WillDeleteFilesRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.moniker.js
var require_protocol_moniker = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.moniker.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.MonikerRequest = exports.MonikerKind = exports.UniquenessLevel = void 0;
	const messages_1$7 = require_messages();
	/**
	* Moniker uniqueness level to define scope of the moniker.
	*
	* @since 3.16.0
	*/
	var UniquenessLevel;
	(function(UniquenessLevel$1) {
		/**
		* The moniker is only unique inside a document
		*/
		UniquenessLevel$1.document = "document";
		/**
		* The moniker is unique inside a project for which a dump got created
		*/
		UniquenessLevel$1.project = "project";
		/**
		* The moniker is unique inside the group to which a project belongs
		*/
		UniquenessLevel$1.group = "group";
		/**
		* The moniker is unique inside the moniker scheme.
		*/
		UniquenessLevel$1.scheme = "scheme";
		/**
		* The moniker is globally unique
		*/
		UniquenessLevel$1.global = "global";
	})(UniquenessLevel || (exports.UniquenessLevel = UniquenessLevel = {}));
	/**
	* The moniker kind.
	*
	* @since 3.16.0
	*/
	var MonikerKind;
	(function(MonikerKind$1) {
		/**
		* The moniker represent a symbol that is imported into a project
		*/
		MonikerKind$1.$import = "import";
		/**
		* The moniker represents a symbol that is exported from a project
		*/
		MonikerKind$1.$export = "export";
		/**
		* The moniker represents a symbol that is local to a project (e.g. a local
		* variable of a function, a class not visible outside the project, ...)
		*/
		MonikerKind$1.local = "local";
	})(MonikerKind || (exports.MonikerKind = MonikerKind = {}));
	/**
	* A request to get the moniker of a symbol at a given text document position.
	* The request parameter is of type {@link TextDocumentPositionParams}.
	* The response is of type {@link Moniker Moniker[]} or `null`.
	*/
	var MonikerRequest;
	(function(MonikerRequest$1) {
		MonikerRequest$1.method = "textDocument/moniker";
		MonikerRequest$1.messageDirection = messages_1$7.MessageDirection.clientToServer;
		MonikerRequest$1.type = new messages_1$7.ProtocolRequestType(MonikerRequest$1.method);
	})(MonikerRequest || (exports.MonikerRequest = MonikerRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.typeHierarchy.js
var require_protocol_typeHierarchy = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.typeHierarchy.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.TypeHierarchySubtypesRequest = exports.TypeHierarchySupertypesRequest = exports.TypeHierarchyPrepareRequest = void 0;
	const messages_1$6 = require_messages();
	/**
	* A request to result a `TypeHierarchyItem` in a document at a given position.
	* Can be used as an input to a subtypes or supertypes type hierarchy.
	*
	* @since 3.17.0
	*/
	var TypeHierarchyPrepareRequest;
	(function(TypeHierarchyPrepareRequest$1) {
		TypeHierarchyPrepareRequest$1.method = "textDocument/prepareTypeHierarchy";
		TypeHierarchyPrepareRequest$1.messageDirection = messages_1$6.MessageDirection.clientToServer;
		TypeHierarchyPrepareRequest$1.type = new messages_1$6.ProtocolRequestType(TypeHierarchyPrepareRequest$1.method);
	})(TypeHierarchyPrepareRequest || (exports.TypeHierarchyPrepareRequest = TypeHierarchyPrepareRequest = {}));
	/**
	* A request to resolve the supertypes for a given `TypeHierarchyItem`.
	*
	* @since 3.17.0
	*/
	var TypeHierarchySupertypesRequest;
	(function(TypeHierarchySupertypesRequest$1) {
		TypeHierarchySupertypesRequest$1.method = "typeHierarchy/supertypes";
		TypeHierarchySupertypesRequest$1.messageDirection = messages_1$6.MessageDirection.clientToServer;
		TypeHierarchySupertypesRequest$1.type = new messages_1$6.ProtocolRequestType(TypeHierarchySupertypesRequest$1.method);
	})(TypeHierarchySupertypesRequest || (exports.TypeHierarchySupertypesRequest = TypeHierarchySupertypesRequest = {}));
	/**
	* A request to resolve the subtypes for a given `TypeHierarchyItem`.
	*
	* @since 3.17.0
	*/
	var TypeHierarchySubtypesRequest;
	(function(TypeHierarchySubtypesRequest$1) {
		TypeHierarchySubtypesRequest$1.method = "typeHierarchy/subtypes";
		TypeHierarchySubtypesRequest$1.messageDirection = messages_1$6.MessageDirection.clientToServer;
		TypeHierarchySubtypesRequest$1.type = new messages_1$6.ProtocolRequestType(TypeHierarchySubtypesRequest$1.method);
	})(TypeHierarchySubtypesRequest || (exports.TypeHierarchySubtypesRequest = TypeHierarchySubtypesRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.inlineValue.js
var require_protocol_inlineValue = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.inlineValue.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.InlineValueRefreshRequest = exports.InlineValueRequest = void 0;
	const messages_1$5 = require_messages();
	/**
	* A request to provide inline values in a document. The request's parameter is of
	* type {@link InlineValueParams}, the response is of type
	* {@link InlineValue InlineValue[]} or a Thenable that resolves to such.
	*
	* @since 3.17.0
	*/
	var InlineValueRequest;
	(function(InlineValueRequest$1) {
		InlineValueRequest$1.method = "textDocument/inlineValue";
		InlineValueRequest$1.messageDirection = messages_1$5.MessageDirection.clientToServer;
		InlineValueRequest$1.type = new messages_1$5.ProtocolRequestType(InlineValueRequest$1.method);
	})(InlineValueRequest || (exports.InlineValueRequest = InlineValueRequest = {}));
	/**
	* @since 3.17.0
	*/
	var InlineValueRefreshRequest;
	(function(InlineValueRefreshRequest$1) {
		InlineValueRefreshRequest$1.method = `workspace/inlineValue/refresh`;
		InlineValueRefreshRequest$1.messageDirection = messages_1$5.MessageDirection.serverToClient;
		InlineValueRefreshRequest$1.type = new messages_1$5.ProtocolRequestType0(InlineValueRefreshRequest$1.method);
	})(InlineValueRefreshRequest || (exports.InlineValueRefreshRequest = InlineValueRefreshRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.inlayHint.js
var require_protocol_inlayHint = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.inlayHint.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.InlayHintRefreshRequest = exports.InlayHintResolveRequest = exports.InlayHintRequest = void 0;
	const messages_1$4 = require_messages();
	/**
	* A request to provide inlay hints in a document. The request's parameter is of
	* type {@link InlayHintsParams}, the response is of type
	* {@link InlayHint InlayHint[]} or a Thenable that resolves to such.
	*
	* @since 3.17.0
	*/
	var InlayHintRequest;
	(function(InlayHintRequest$1) {
		InlayHintRequest$1.method = "textDocument/inlayHint";
		InlayHintRequest$1.messageDirection = messages_1$4.MessageDirection.clientToServer;
		InlayHintRequest$1.type = new messages_1$4.ProtocolRequestType(InlayHintRequest$1.method);
	})(InlayHintRequest || (exports.InlayHintRequest = InlayHintRequest = {}));
	/**
	* A request to resolve additional properties for an inlay hint.
	* The request's parameter is of type {@link InlayHint}, the response is
	* of type {@link InlayHint} or a Thenable that resolves to such.
	*
	* @since 3.17.0
	*/
	var InlayHintResolveRequest;
	(function(InlayHintResolveRequest$1) {
		InlayHintResolveRequest$1.method = "inlayHint/resolve";
		InlayHintResolveRequest$1.messageDirection = messages_1$4.MessageDirection.clientToServer;
		InlayHintResolveRequest$1.type = new messages_1$4.ProtocolRequestType(InlayHintResolveRequest$1.method);
	})(InlayHintResolveRequest || (exports.InlayHintResolveRequest = InlayHintResolveRequest = {}));
	/**
	* @since 3.17.0
	*/
	var InlayHintRefreshRequest;
	(function(InlayHintRefreshRequest$1) {
		InlayHintRefreshRequest$1.method = `workspace/inlayHint/refresh`;
		InlayHintRefreshRequest$1.messageDirection = messages_1$4.MessageDirection.serverToClient;
		InlayHintRefreshRequest$1.type = new messages_1$4.ProtocolRequestType0(InlayHintRefreshRequest$1.method);
	})(InlayHintRefreshRequest || (exports.InlayHintRefreshRequest = InlayHintRefreshRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.diagnostic.js
var require_protocol_diagnostic = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.diagnostic.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.DiagnosticRefreshRequest = exports.WorkspaceDiagnosticRequest = exports.DocumentDiagnosticRequest = exports.DocumentDiagnosticReportKind = exports.DiagnosticServerCancellationData = void 0;
	const vscode_jsonrpc_1$1 = require_main$2();
	const Is$2 = require_is();
	const messages_1$3 = require_messages();
	/**
	* @since 3.17.0
	*/
	var DiagnosticServerCancellationData;
	(function(DiagnosticServerCancellationData$1) {
		function is$1(value) {
			const candidate = value;
			return candidate && Is$2.boolean(candidate.retriggerRequest);
		}
		DiagnosticServerCancellationData$1.is = is$1;
	})(DiagnosticServerCancellationData || (exports.DiagnosticServerCancellationData = DiagnosticServerCancellationData = {}));
	/**
	* The document diagnostic report kinds.
	*
	* @since 3.17.0
	*/
	var DocumentDiagnosticReportKind;
	(function(DocumentDiagnosticReportKind$1) {
		/**
		* A diagnostic report with a full
		* set of problems.
		*/
		DocumentDiagnosticReportKind$1.Full = "full";
		/**
		* A report indicating that the last
		* returned report is still accurate.
		*/
		DocumentDiagnosticReportKind$1.Unchanged = "unchanged";
	})(DocumentDiagnosticReportKind || (exports.DocumentDiagnosticReportKind = DocumentDiagnosticReportKind = {}));
	/**
	* The document diagnostic request definition.
	*
	* @since 3.17.0
	*/
	var DocumentDiagnosticRequest;
	(function(DocumentDiagnosticRequest$1) {
		DocumentDiagnosticRequest$1.method = "textDocument/diagnostic";
		DocumentDiagnosticRequest$1.messageDirection = messages_1$3.MessageDirection.clientToServer;
		DocumentDiagnosticRequest$1.type = new messages_1$3.ProtocolRequestType(DocumentDiagnosticRequest$1.method);
		DocumentDiagnosticRequest$1.partialResult = new vscode_jsonrpc_1$1.ProgressType();
	})(DocumentDiagnosticRequest || (exports.DocumentDiagnosticRequest = DocumentDiagnosticRequest = {}));
	/**
	* The workspace diagnostic request definition.
	*
	* @since 3.17.0
	*/
	var WorkspaceDiagnosticRequest;
	(function(WorkspaceDiagnosticRequest$1) {
		WorkspaceDiagnosticRequest$1.method = "workspace/diagnostic";
		WorkspaceDiagnosticRequest$1.messageDirection = messages_1$3.MessageDirection.clientToServer;
		WorkspaceDiagnosticRequest$1.type = new messages_1$3.ProtocolRequestType(WorkspaceDiagnosticRequest$1.method);
		WorkspaceDiagnosticRequest$1.partialResult = new vscode_jsonrpc_1$1.ProgressType();
	})(WorkspaceDiagnosticRequest || (exports.WorkspaceDiagnosticRequest = WorkspaceDiagnosticRequest = {}));
	/**
	* The diagnostic refresh request definition.
	*
	* @since 3.17.0
	*/
	var DiagnosticRefreshRequest;
	(function(DiagnosticRefreshRequest$1) {
		DiagnosticRefreshRequest$1.method = `workspace/diagnostic/refresh`;
		DiagnosticRefreshRequest$1.messageDirection = messages_1$3.MessageDirection.serverToClient;
		DiagnosticRefreshRequest$1.type = new messages_1$3.ProtocolRequestType0(DiagnosticRefreshRequest$1.method);
	})(DiagnosticRefreshRequest || (exports.DiagnosticRefreshRequest = DiagnosticRefreshRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.notebook.js
var require_protocol_notebook = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.notebook.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.DidCloseNotebookDocumentNotification = exports.DidSaveNotebookDocumentNotification = exports.DidChangeNotebookDocumentNotification = exports.NotebookCellArrayChange = exports.DidOpenNotebookDocumentNotification = exports.NotebookDocumentSyncRegistrationType = exports.NotebookDocument = exports.NotebookCell = exports.ExecutionSummary = exports.NotebookCellKind = void 0;
	const vscode_languageserver_types_1$1 = require_main$1();
	const Is$1 = require_is();
	const messages_1$2 = require_messages();
	/**
	* A notebook cell kind.
	*
	* @since 3.17.0
	*/
	var NotebookCellKind;
	(function(NotebookCellKind$1) {
		/**
		* A markup-cell is formatted source that is used for display.
		*/
		NotebookCellKind$1.Markup = 1;
		/**
		* A code-cell is source code.
		*/
		NotebookCellKind$1.Code = 2;
		function is$1(value) {
			return value === 1 || value === 2;
		}
		NotebookCellKind$1.is = is$1;
	})(NotebookCellKind || (exports.NotebookCellKind = NotebookCellKind = {}));
	var ExecutionSummary;
	(function(ExecutionSummary$1) {
		function create(executionOrder, success) {
			const result = { executionOrder };
			if (success === true || success === false) result.success = success;
			return result;
		}
		ExecutionSummary$1.create = create;
		function is$1(value) {
			const candidate = value;
			return Is$1.objectLiteral(candidate) && vscode_languageserver_types_1$1.uinteger.is(candidate.executionOrder) && (candidate.success === void 0 || Is$1.boolean(candidate.success));
		}
		ExecutionSummary$1.is = is$1;
		function equals(one, other) {
			if (one === other) return true;
			if (one === null || one === void 0 || other === null || other === void 0) return false;
			return one.executionOrder === other.executionOrder && one.success === other.success;
		}
		ExecutionSummary$1.equals = equals;
	})(ExecutionSummary || (exports.ExecutionSummary = ExecutionSummary = {}));
	var NotebookCell;
	(function(NotebookCell$1) {
		function create(kind, document) {
			return {
				kind,
				document
			};
		}
		NotebookCell$1.create = create;
		function is$1(value) {
			const candidate = value;
			return Is$1.objectLiteral(candidate) && NotebookCellKind.is(candidate.kind) && vscode_languageserver_types_1$1.DocumentUri.is(candidate.document) && (candidate.metadata === void 0 || Is$1.objectLiteral(candidate.metadata));
		}
		NotebookCell$1.is = is$1;
		function diff(one, two) {
			const result = /* @__PURE__ */ new Set();
			if (one.document !== two.document) result.add("document");
			if (one.kind !== two.kind) result.add("kind");
			if (one.executionSummary !== two.executionSummary) result.add("executionSummary");
			if ((one.metadata !== void 0 || two.metadata !== void 0) && !equalsMetadata(one.metadata, two.metadata)) result.add("metadata");
			if ((one.executionSummary !== void 0 || two.executionSummary !== void 0) && !ExecutionSummary.equals(one.executionSummary, two.executionSummary)) result.add("executionSummary");
			return result;
		}
		NotebookCell$1.diff = diff;
		function equalsMetadata(one, other) {
			if (one === other) return true;
			if (one === null || one === void 0 || other === null || other === void 0) return false;
			if (typeof one !== typeof other) return false;
			if (typeof one !== "object") return false;
			const oneArray = Array.isArray(one);
			const otherArray = Array.isArray(other);
			if (oneArray !== otherArray) return false;
			if (oneArray && otherArray) {
				if (one.length !== other.length) return false;
				for (let i = 0; i < one.length; i++) if (!equalsMetadata(one[i], other[i])) return false;
			}
			if (Is$1.objectLiteral(one) && Is$1.objectLiteral(other)) {
				const oneKeys = Object.keys(one);
				const otherKeys = Object.keys(other);
				if (oneKeys.length !== otherKeys.length) return false;
				oneKeys.sort();
				otherKeys.sort();
				if (!equalsMetadata(oneKeys, otherKeys)) return false;
				for (let i = 0; i < oneKeys.length; i++) {
					const prop = oneKeys[i];
					if (!equalsMetadata(one[prop], other[prop])) return false;
				}
			}
			return true;
		}
	})(NotebookCell || (exports.NotebookCell = NotebookCell = {}));
	var NotebookDocument;
	(function(NotebookDocument$1) {
		function create(uri, notebookType, version, cells) {
			return {
				uri,
				notebookType,
				version,
				cells
			};
		}
		NotebookDocument$1.create = create;
		function is$1(value) {
			const candidate = value;
			return Is$1.objectLiteral(candidate) && Is$1.string(candidate.uri) && vscode_languageserver_types_1$1.integer.is(candidate.version) && Is$1.typedArray(candidate.cells, NotebookCell.is);
		}
		NotebookDocument$1.is = is$1;
	})(NotebookDocument || (exports.NotebookDocument = NotebookDocument = {}));
	var NotebookDocumentSyncRegistrationType;
	(function(NotebookDocumentSyncRegistrationType$1) {
		NotebookDocumentSyncRegistrationType$1.method = "notebookDocument/sync";
		NotebookDocumentSyncRegistrationType$1.messageDirection = messages_1$2.MessageDirection.clientToServer;
		NotebookDocumentSyncRegistrationType$1.type = new messages_1$2.RegistrationType(NotebookDocumentSyncRegistrationType$1.method);
	})(NotebookDocumentSyncRegistrationType || (exports.NotebookDocumentSyncRegistrationType = NotebookDocumentSyncRegistrationType = {}));
	/**
	* A notification sent when a notebook opens.
	*
	* @since 3.17.0
	*/
	var DidOpenNotebookDocumentNotification;
	(function(DidOpenNotebookDocumentNotification$1) {
		DidOpenNotebookDocumentNotification$1.method = "notebookDocument/didOpen";
		DidOpenNotebookDocumentNotification$1.messageDirection = messages_1$2.MessageDirection.clientToServer;
		DidOpenNotebookDocumentNotification$1.type = new messages_1$2.ProtocolNotificationType(DidOpenNotebookDocumentNotification$1.method);
		DidOpenNotebookDocumentNotification$1.registrationMethod = NotebookDocumentSyncRegistrationType.method;
	})(DidOpenNotebookDocumentNotification || (exports.DidOpenNotebookDocumentNotification = DidOpenNotebookDocumentNotification = {}));
	var NotebookCellArrayChange;
	(function(NotebookCellArrayChange$1) {
		function is$1(value) {
			const candidate = value;
			return Is$1.objectLiteral(candidate) && vscode_languageserver_types_1$1.uinteger.is(candidate.start) && vscode_languageserver_types_1$1.uinteger.is(candidate.deleteCount) && (candidate.cells === void 0 || Is$1.typedArray(candidate.cells, NotebookCell.is));
		}
		NotebookCellArrayChange$1.is = is$1;
		function create(start, deleteCount, cells) {
			const result = {
				start,
				deleteCount
			};
			if (cells !== void 0) result.cells = cells;
			return result;
		}
		NotebookCellArrayChange$1.create = create;
	})(NotebookCellArrayChange || (exports.NotebookCellArrayChange = NotebookCellArrayChange = {}));
	var DidChangeNotebookDocumentNotification;
	(function(DidChangeNotebookDocumentNotification$1) {
		DidChangeNotebookDocumentNotification$1.method = "notebookDocument/didChange";
		DidChangeNotebookDocumentNotification$1.messageDirection = messages_1$2.MessageDirection.clientToServer;
		DidChangeNotebookDocumentNotification$1.type = new messages_1$2.ProtocolNotificationType(DidChangeNotebookDocumentNotification$1.method);
		DidChangeNotebookDocumentNotification$1.registrationMethod = NotebookDocumentSyncRegistrationType.method;
	})(DidChangeNotebookDocumentNotification || (exports.DidChangeNotebookDocumentNotification = DidChangeNotebookDocumentNotification = {}));
	/**
	* A notification sent when a notebook document is saved.
	*
	* @since 3.17.0
	*/
	var DidSaveNotebookDocumentNotification;
	(function(DidSaveNotebookDocumentNotification$1) {
		DidSaveNotebookDocumentNotification$1.method = "notebookDocument/didSave";
		DidSaveNotebookDocumentNotification$1.messageDirection = messages_1$2.MessageDirection.clientToServer;
		DidSaveNotebookDocumentNotification$1.type = new messages_1$2.ProtocolNotificationType(DidSaveNotebookDocumentNotification$1.method);
		DidSaveNotebookDocumentNotification$1.registrationMethod = NotebookDocumentSyncRegistrationType.method;
	})(DidSaveNotebookDocumentNotification || (exports.DidSaveNotebookDocumentNotification = DidSaveNotebookDocumentNotification = {}));
	/**
	* A notification sent when a notebook closes.
	*
	* @since 3.17.0
	*/
	var DidCloseNotebookDocumentNotification;
	(function(DidCloseNotebookDocumentNotification$1) {
		DidCloseNotebookDocumentNotification$1.method = "notebookDocument/didClose";
		DidCloseNotebookDocumentNotification$1.messageDirection = messages_1$2.MessageDirection.clientToServer;
		DidCloseNotebookDocumentNotification$1.type = new messages_1$2.ProtocolNotificationType(DidCloseNotebookDocumentNotification$1.method);
		DidCloseNotebookDocumentNotification$1.registrationMethod = NotebookDocumentSyncRegistrationType.method;
	})(DidCloseNotebookDocumentNotification || (exports.DidCloseNotebookDocumentNotification = DidCloseNotebookDocumentNotification = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.inlineCompletion.js
var require_protocol_inlineCompletion = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.inlineCompletion.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.InlineCompletionRequest = void 0;
	const messages_1$1 = require_messages();
	/**
	* A request to provide inline completions in a document. The request's parameter is of
	* type {@link InlineCompletionParams}, the response is of type
	* {@link InlineCompletion InlineCompletion[]} or a Thenable that resolves to such.
	*
	* @since 3.18.0
	* @proposed
	*/
	var InlineCompletionRequest;
	(function(InlineCompletionRequest$1) {
		InlineCompletionRequest$1.method = "textDocument/inlineCompletion";
		InlineCompletionRequest$1.messageDirection = messages_1$1.MessageDirection.clientToServer;
		InlineCompletionRequest$1.type = new messages_1$1.ProtocolRequestType(InlineCompletionRequest$1.method);
	})(InlineCompletionRequest || (exports.InlineCompletionRequest = InlineCompletionRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.js
var require_protocol = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/protocol.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.WorkspaceSymbolRequest = exports.CodeActionResolveRequest = exports.CodeActionRequest = exports.DocumentSymbolRequest = exports.DocumentHighlightRequest = exports.ReferencesRequest = exports.DefinitionRequest = exports.SignatureHelpRequest = exports.SignatureHelpTriggerKind = exports.HoverRequest = exports.CompletionResolveRequest = exports.CompletionRequest = exports.CompletionTriggerKind = exports.PublishDiagnosticsNotification = exports.WatchKind = exports.RelativePattern = exports.FileChangeType = exports.DidChangeWatchedFilesNotification = exports.WillSaveTextDocumentWaitUntilRequest = exports.WillSaveTextDocumentNotification = exports.TextDocumentSaveReason = exports.DidSaveTextDocumentNotification = exports.DidCloseTextDocumentNotification = exports.DidChangeTextDocumentNotification = exports.TextDocumentContentChangeEvent = exports.DidOpenTextDocumentNotification = exports.TextDocumentSyncKind = exports.TelemetryEventNotification = exports.LogMessageNotification = exports.ShowMessageRequest = exports.ShowMessageNotification = exports.MessageType = exports.DidChangeConfigurationNotification = exports.ExitNotification = exports.ShutdownRequest = exports.InitializedNotification = exports.InitializeErrorCodes = exports.InitializeRequest = exports.WorkDoneProgressOptions = exports.TextDocumentRegistrationOptions = exports.StaticRegistrationOptions = exports.PositionEncodingKind = exports.FailureHandlingKind = exports.ResourceOperationKind = exports.UnregistrationRequest = exports.RegistrationRequest = exports.DocumentSelector = exports.NotebookCellTextDocumentFilter = exports.NotebookDocumentFilter = exports.TextDocumentFilter = void 0;
	exports.MonikerRequest = exports.MonikerKind = exports.UniquenessLevel = exports.WillDeleteFilesRequest = exports.DidDeleteFilesNotification = exports.WillRenameFilesRequest = exports.DidRenameFilesNotification = exports.WillCreateFilesRequest = exports.DidCreateFilesNotification = exports.FileOperationPatternKind = exports.LinkedEditingRangeRequest = exports.ShowDocumentRequest = exports.SemanticTokensRegistrationType = exports.SemanticTokensRefreshRequest = exports.SemanticTokensRangeRequest = exports.SemanticTokensDeltaRequest = exports.SemanticTokensRequest = exports.TokenFormat = exports.CallHierarchyPrepareRequest = exports.CallHierarchyOutgoingCallsRequest = exports.CallHierarchyIncomingCallsRequest = exports.WorkDoneProgressCancelNotification = exports.WorkDoneProgressCreateRequest = exports.WorkDoneProgress = exports.SelectionRangeRequest = exports.DeclarationRequest = exports.FoldingRangeRefreshRequest = exports.FoldingRangeRequest = exports.ColorPresentationRequest = exports.DocumentColorRequest = exports.ConfigurationRequest = exports.DidChangeWorkspaceFoldersNotification = exports.WorkspaceFoldersRequest = exports.TypeDefinitionRequest = exports.ImplementationRequest = exports.ApplyWorkspaceEditRequest = exports.ExecuteCommandRequest = exports.PrepareRenameRequest = exports.RenameRequest = exports.PrepareSupportDefaultBehavior = exports.DocumentOnTypeFormattingRequest = exports.DocumentRangesFormattingRequest = exports.DocumentRangeFormattingRequest = exports.DocumentFormattingRequest = exports.DocumentLinkResolveRequest = exports.DocumentLinkRequest = exports.CodeLensRefreshRequest = exports.CodeLensResolveRequest = exports.CodeLensRequest = exports.WorkspaceSymbolResolveRequest = void 0;
	exports.InlineCompletionRequest = exports.DidCloseNotebookDocumentNotification = exports.DidSaveNotebookDocumentNotification = exports.DidChangeNotebookDocumentNotification = exports.NotebookCellArrayChange = exports.DidOpenNotebookDocumentNotification = exports.NotebookDocumentSyncRegistrationType = exports.NotebookDocument = exports.NotebookCell = exports.ExecutionSummary = exports.NotebookCellKind = exports.DiagnosticRefreshRequest = exports.WorkspaceDiagnosticRequest = exports.DocumentDiagnosticRequest = exports.DocumentDiagnosticReportKind = exports.DiagnosticServerCancellationData = exports.InlayHintRefreshRequest = exports.InlayHintResolveRequest = exports.InlayHintRequest = exports.InlineValueRefreshRequest = exports.InlineValueRequest = exports.TypeHierarchySupertypesRequest = exports.TypeHierarchySubtypesRequest = exports.TypeHierarchyPrepareRequest = void 0;
	const messages_1 = require_messages();
	const vscode_languageserver_types_1 = require_main$1();
	const Is = require_is();
	const protocol_implementation_1 = require_protocol_implementation();
	Object.defineProperty(exports, "ImplementationRequest", {
		enumerable: true,
		get: function() {
			return protocol_implementation_1.ImplementationRequest;
		}
	});
	const protocol_typeDefinition_1 = require_protocol_typeDefinition();
	Object.defineProperty(exports, "TypeDefinitionRequest", {
		enumerable: true,
		get: function() {
			return protocol_typeDefinition_1.TypeDefinitionRequest;
		}
	});
	const protocol_workspaceFolder_1 = require_protocol_workspaceFolder();
	Object.defineProperty(exports, "WorkspaceFoldersRequest", {
		enumerable: true,
		get: function() {
			return protocol_workspaceFolder_1.WorkspaceFoldersRequest;
		}
	});
	Object.defineProperty(exports, "DidChangeWorkspaceFoldersNotification", {
		enumerable: true,
		get: function() {
			return protocol_workspaceFolder_1.DidChangeWorkspaceFoldersNotification;
		}
	});
	const protocol_configuration_1 = require_protocol_configuration();
	Object.defineProperty(exports, "ConfigurationRequest", {
		enumerable: true,
		get: function() {
			return protocol_configuration_1.ConfigurationRequest;
		}
	});
	const protocol_colorProvider_1 = require_protocol_colorProvider();
	Object.defineProperty(exports, "DocumentColorRequest", {
		enumerable: true,
		get: function() {
			return protocol_colorProvider_1.DocumentColorRequest;
		}
	});
	Object.defineProperty(exports, "ColorPresentationRequest", {
		enumerable: true,
		get: function() {
			return protocol_colorProvider_1.ColorPresentationRequest;
		}
	});
	const protocol_foldingRange_1 = require_protocol_foldingRange();
	Object.defineProperty(exports, "FoldingRangeRequest", {
		enumerable: true,
		get: function() {
			return protocol_foldingRange_1.FoldingRangeRequest;
		}
	});
	Object.defineProperty(exports, "FoldingRangeRefreshRequest", {
		enumerable: true,
		get: function() {
			return protocol_foldingRange_1.FoldingRangeRefreshRequest;
		}
	});
	const protocol_declaration_1 = require_protocol_declaration();
	Object.defineProperty(exports, "DeclarationRequest", {
		enumerable: true,
		get: function() {
			return protocol_declaration_1.DeclarationRequest;
		}
	});
	const protocol_selectionRange_1 = require_protocol_selectionRange();
	Object.defineProperty(exports, "SelectionRangeRequest", {
		enumerable: true,
		get: function() {
			return protocol_selectionRange_1.SelectionRangeRequest;
		}
	});
	const protocol_progress_1 = require_protocol_progress();
	Object.defineProperty(exports, "WorkDoneProgress", {
		enumerable: true,
		get: function() {
			return protocol_progress_1.WorkDoneProgress;
		}
	});
	Object.defineProperty(exports, "WorkDoneProgressCreateRequest", {
		enumerable: true,
		get: function() {
			return protocol_progress_1.WorkDoneProgressCreateRequest;
		}
	});
	Object.defineProperty(exports, "WorkDoneProgressCancelNotification", {
		enumerable: true,
		get: function() {
			return protocol_progress_1.WorkDoneProgressCancelNotification;
		}
	});
	const protocol_callHierarchy_1 = require_protocol_callHierarchy();
	Object.defineProperty(exports, "CallHierarchyIncomingCallsRequest", {
		enumerable: true,
		get: function() {
			return protocol_callHierarchy_1.CallHierarchyIncomingCallsRequest;
		}
	});
	Object.defineProperty(exports, "CallHierarchyOutgoingCallsRequest", {
		enumerable: true,
		get: function() {
			return protocol_callHierarchy_1.CallHierarchyOutgoingCallsRequest;
		}
	});
	Object.defineProperty(exports, "CallHierarchyPrepareRequest", {
		enumerable: true,
		get: function() {
			return protocol_callHierarchy_1.CallHierarchyPrepareRequest;
		}
	});
	const protocol_semanticTokens_1 = require_protocol_semanticTokens();
	Object.defineProperty(exports, "TokenFormat", {
		enumerable: true,
		get: function() {
			return protocol_semanticTokens_1.TokenFormat;
		}
	});
	Object.defineProperty(exports, "SemanticTokensRequest", {
		enumerable: true,
		get: function() {
			return protocol_semanticTokens_1.SemanticTokensRequest;
		}
	});
	Object.defineProperty(exports, "SemanticTokensDeltaRequest", {
		enumerable: true,
		get: function() {
			return protocol_semanticTokens_1.SemanticTokensDeltaRequest;
		}
	});
	Object.defineProperty(exports, "SemanticTokensRangeRequest", {
		enumerable: true,
		get: function() {
			return protocol_semanticTokens_1.SemanticTokensRangeRequest;
		}
	});
	Object.defineProperty(exports, "SemanticTokensRefreshRequest", {
		enumerable: true,
		get: function() {
			return protocol_semanticTokens_1.SemanticTokensRefreshRequest;
		}
	});
	Object.defineProperty(exports, "SemanticTokensRegistrationType", {
		enumerable: true,
		get: function() {
			return protocol_semanticTokens_1.SemanticTokensRegistrationType;
		}
	});
	const protocol_showDocument_1 = require_protocol_showDocument();
	Object.defineProperty(exports, "ShowDocumentRequest", {
		enumerable: true,
		get: function() {
			return protocol_showDocument_1.ShowDocumentRequest;
		}
	});
	const protocol_linkedEditingRange_1 = require_protocol_linkedEditingRange();
	Object.defineProperty(exports, "LinkedEditingRangeRequest", {
		enumerable: true,
		get: function() {
			return protocol_linkedEditingRange_1.LinkedEditingRangeRequest;
		}
	});
	const protocol_fileOperations_1 = require_protocol_fileOperations();
	Object.defineProperty(exports, "FileOperationPatternKind", {
		enumerable: true,
		get: function() {
			return protocol_fileOperations_1.FileOperationPatternKind;
		}
	});
	Object.defineProperty(exports, "DidCreateFilesNotification", {
		enumerable: true,
		get: function() {
			return protocol_fileOperations_1.DidCreateFilesNotification;
		}
	});
	Object.defineProperty(exports, "WillCreateFilesRequest", {
		enumerable: true,
		get: function() {
			return protocol_fileOperations_1.WillCreateFilesRequest;
		}
	});
	Object.defineProperty(exports, "DidRenameFilesNotification", {
		enumerable: true,
		get: function() {
			return protocol_fileOperations_1.DidRenameFilesNotification;
		}
	});
	Object.defineProperty(exports, "WillRenameFilesRequest", {
		enumerable: true,
		get: function() {
			return protocol_fileOperations_1.WillRenameFilesRequest;
		}
	});
	Object.defineProperty(exports, "DidDeleteFilesNotification", {
		enumerable: true,
		get: function() {
			return protocol_fileOperations_1.DidDeleteFilesNotification;
		}
	});
	Object.defineProperty(exports, "WillDeleteFilesRequest", {
		enumerable: true,
		get: function() {
			return protocol_fileOperations_1.WillDeleteFilesRequest;
		}
	});
	const protocol_moniker_1 = require_protocol_moniker();
	Object.defineProperty(exports, "UniquenessLevel", {
		enumerable: true,
		get: function() {
			return protocol_moniker_1.UniquenessLevel;
		}
	});
	Object.defineProperty(exports, "MonikerKind", {
		enumerable: true,
		get: function() {
			return protocol_moniker_1.MonikerKind;
		}
	});
	Object.defineProperty(exports, "MonikerRequest", {
		enumerable: true,
		get: function() {
			return protocol_moniker_1.MonikerRequest;
		}
	});
	const protocol_typeHierarchy_1 = require_protocol_typeHierarchy();
	Object.defineProperty(exports, "TypeHierarchyPrepareRequest", {
		enumerable: true,
		get: function() {
			return protocol_typeHierarchy_1.TypeHierarchyPrepareRequest;
		}
	});
	Object.defineProperty(exports, "TypeHierarchySubtypesRequest", {
		enumerable: true,
		get: function() {
			return protocol_typeHierarchy_1.TypeHierarchySubtypesRequest;
		}
	});
	Object.defineProperty(exports, "TypeHierarchySupertypesRequest", {
		enumerable: true,
		get: function() {
			return protocol_typeHierarchy_1.TypeHierarchySupertypesRequest;
		}
	});
	const protocol_inlineValue_1 = require_protocol_inlineValue();
	Object.defineProperty(exports, "InlineValueRequest", {
		enumerable: true,
		get: function() {
			return protocol_inlineValue_1.InlineValueRequest;
		}
	});
	Object.defineProperty(exports, "InlineValueRefreshRequest", {
		enumerable: true,
		get: function() {
			return protocol_inlineValue_1.InlineValueRefreshRequest;
		}
	});
	const protocol_inlayHint_1 = require_protocol_inlayHint();
	Object.defineProperty(exports, "InlayHintRequest", {
		enumerable: true,
		get: function() {
			return protocol_inlayHint_1.InlayHintRequest;
		}
	});
	Object.defineProperty(exports, "InlayHintResolveRequest", {
		enumerable: true,
		get: function() {
			return protocol_inlayHint_1.InlayHintResolveRequest;
		}
	});
	Object.defineProperty(exports, "InlayHintRefreshRequest", {
		enumerable: true,
		get: function() {
			return protocol_inlayHint_1.InlayHintRefreshRequest;
		}
	});
	const protocol_diagnostic_1 = require_protocol_diagnostic();
	Object.defineProperty(exports, "DiagnosticServerCancellationData", {
		enumerable: true,
		get: function() {
			return protocol_diagnostic_1.DiagnosticServerCancellationData;
		}
	});
	Object.defineProperty(exports, "DocumentDiagnosticReportKind", {
		enumerable: true,
		get: function() {
			return protocol_diagnostic_1.DocumentDiagnosticReportKind;
		}
	});
	Object.defineProperty(exports, "DocumentDiagnosticRequest", {
		enumerable: true,
		get: function() {
			return protocol_diagnostic_1.DocumentDiagnosticRequest;
		}
	});
	Object.defineProperty(exports, "WorkspaceDiagnosticRequest", {
		enumerable: true,
		get: function() {
			return protocol_diagnostic_1.WorkspaceDiagnosticRequest;
		}
	});
	Object.defineProperty(exports, "DiagnosticRefreshRequest", {
		enumerable: true,
		get: function() {
			return protocol_diagnostic_1.DiagnosticRefreshRequest;
		}
	});
	const protocol_notebook_1 = require_protocol_notebook();
	Object.defineProperty(exports, "NotebookCellKind", {
		enumerable: true,
		get: function() {
			return protocol_notebook_1.NotebookCellKind;
		}
	});
	Object.defineProperty(exports, "ExecutionSummary", {
		enumerable: true,
		get: function() {
			return protocol_notebook_1.ExecutionSummary;
		}
	});
	Object.defineProperty(exports, "NotebookCell", {
		enumerable: true,
		get: function() {
			return protocol_notebook_1.NotebookCell;
		}
	});
	Object.defineProperty(exports, "NotebookDocument", {
		enumerable: true,
		get: function() {
			return protocol_notebook_1.NotebookDocument;
		}
	});
	Object.defineProperty(exports, "NotebookDocumentSyncRegistrationType", {
		enumerable: true,
		get: function() {
			return protocol_notebook_1.NotebookDocumentSyncRegistrationType;
		}
	});
	Object.defineProperty(exports, "DidOpenNotebookDocumentNotification", {
		enumerable: true,
		get: function() {
			return protocol_notebook_1.DidOpenNotebookDocumentNotification;
		}
	});
	Object.defineProperty(exports, "NotebookCellArrayChange", {
		enumerable: true,
		get: function() {
			return protocol_notebook_1.NotebookCellArrayChange;
		}
	});
	Object.defineProperty(exports, "DidChangeNotebookDocumentNotification", {
		enumerable: true,
		get: function() {
			return protocol_notebook_1.DidChangeNotebookDocumentNotification;
		}
	});
	Object.defineProperty(exports, "DidSaveNotebookDocumentNotification", {
		enumerable: true,
		get: function() {
			return protocol_notebook_1.DidSaveNotebookDocumentNotification;
		}
	});
	Object.defineProperty(exports, "DidCloseNotebookDocumentNotification", {
		enumerable: true,
		get: function() {
			return protocol_notebook_1.DidCloseNotebookDocumentNotification;
		}
	});
	const protocol_inlineCompletion_1 = require_protocol_inlineCompletion();
	Object.defineProperty(exports, "InlineCompletionRequest", {
		enumerable: true,
		get: function() {
			return protocol_inlineCompletion_1.InlineCompletionRequest;
		}
	});
	/**
	* The TextDocumentFilter namespace provides helper functions to work with
	* {@link TextDocumentFilter} literals.
	*
	* @since 3.17.0
	*/
	var TextDocumentFilter;
	(function(TextDocumentFilter$1) {
		function is$1(value) {
			const candidate = value;
			return Is.string(candidate) || Is.string(candidate.language) || Is.string(candidate.scheme) || Is.string(candidate.pattern);
		}
		TextDocumentFilter$1.is = is$1;
	})(TextDocumentFilter || (exports.TextDocumentFilter = TextDocumentFilter = {}));
	/**
	* The NotebookDocumentFilter namespace provides helper functions to work with
	* {@link NotebookDocumentFilter} literals.
	*
	* @since 3.17.0
	*/
	var NotebookDocumentFilter;
	(function(NotebookDocumentFilter$1) {
		function is$1(value) {
			const candidate = value;
			return Is.objectLiteral(candidate) && (Is.string(candidate.notebookType) || Is.string(candidate.scheme) || Is.string(candidate.pattern));
		}
		NotebookDocumentFilter$1.is = is$1;
	})(NotebookDocumentFilter || (exports.NotebookDocumentFilter = NotebookDocumentFilter = {}));
	/**
	* The NotebookCellTextDocumentFilter namespace provides helper functions to work with
	* {@link NotebookCellTextDocumentFilter} literals.
	*
	* @since 3.17.0
	*/
	var NotebookCellTextDocumentFilter;
	(function(NotebookCellTextDocumentFilter$1) {
		function is$1(value) {
			const candidate = value;
			return Is.objectLiteral(candidate) && (Is.string(candidate.notebook) || NotebookDocumentFilter.is(candidate.notebook)) && (candidate.language === void 0 || Is.string(candidate.language));
		}
		NotebookCellTextDocumentFilter$1.is = is$1;
	})(NotebookCellTextDocumentFilter || (exports.NotebookCellTextDocumentFilter = NotebookCellTextDocumentFilter = {}));
	/**
	* The DocumentSelector namespace provides helper functions to work with
	* {@link DocumentSelector}s.
	*/
	var DocumentSelector;
	(function(DocumentSelector$1) {
		function is$1(value) {
			if (!Array.isArray(value)) return false;
			for (let elem of value) if (!Is.string(elem) && !TextDocumentFilter.is(elem) && !NotebookCellTextDocumentFilter.is(elem)) return false;
			return true;
		}
		DocumentSelector$1.is = is$1;
	})(DocumentSelector || (exports.DocumentSelector = DocumentSelector = {}));
	/**
	* The `client/registerCapability` request is sent from the server to the client to register a new capability
	* handler on the client side.
	*/
	var RegistrationRequest;
	(function(RegistrationRequest$1) {
		RegistrationRequest$1.method = "client/registerCapability";
		RegistrationRequest$1.messageDirection = messages_1.MessageDirection.serverToClient;
		RegistrationRequest$1.type = new messages_1.ProtocolRequestType(RegistrationRequest$1.method);
	})(RegistrationRequest || (exports.RegistrationRequest = RegistrationRequest = {}));
	/**
	* The `client/unregisterCapability` request is sent from the server to the client to unregister a previously registered capability
	* handler on the client side.
	*/
	var UnregistrationRequest;
	(function(UnregistrationRequest$1) {
		UnregistrationRequest$1.method = "client/unregisterCapability";
		UnregistrationRequest$1.messageDirection = messages_1.MessageDirection.serverToClient;
		UnregistrationRequest$1.type = new messages_1.ProtocolRequestType(UnregistrationRequest$1.method);
	})(UnregistrationRequest || (exports.UnregistrationRequest = UnregistrationRequest = {}));
	var ResourceOperationKind;
	(function(ResourceOperationKind$1) {
		/**
		* Supports creating new files and folders.
		*/
		ResourceOperationKind$1.Create = "create";
		/**
		* Supports renaming existing files and folders.
		*/
		ResourceOperationKind$1.Rename = "rename";
		/**
		* Supports deleting existing files and folders.
		*/
		ResourceOperationKind$1.Delete = "delete";
	})(ResourceOperationKind || (exports.ResourceOperationKind = ResourceOperationKind = {}));
	var FailureHandlingKind;
	(function(FailureHandlingKind$1) {
		/**
		* Applying the workspace change is simply aborted if one of the changes provided
		* fails. All operations executed before the failing operation stay executed.
		*/
		FailureHandlingKind$1.Abort = "abort";
		/**
		* All operations are executed transactional. That means they either all
		* succeed or no changes at all are applied to the workspace.
		*/
		FailureHandlingKind$1.Transactional = "transactional";
		/**
		* If the workspace edit contains only textual file changes they are executed transactional.
		* If resource changes (create, rename or delete file) are part of the change the failure
		* handling strategy is abort.
		*/
		FailureHandlingKind$1.TextOnlyTransactional = "textOnlyTransactional";
		/**
		* The client tries to undo the operations already executed. But there is no
		* guarantee that this is succeeding.
		*/
		FailureHandlingKind$1.Undo = "undo";
	})(FailureHandlingKind || (exports.FailureHandlingKind = FailureHandlingKind = {}));
	/**
	* A set of predefined position encoding kinds.
	*
	* @since 3.17.0
	*/
	var PositionEncodingKind;
	(function(PositionEncodingKind$1) {
		/**
		* Character offsets count UTF-8 code units (e.g. bytes).
		*/
		PositionEncodingKind$1.UTF8 = "utf-8";
		/**
		* Character offsets count UTF-16 code units.
		*
		* This is the default and must always be supported
		* by servers
		*/
		PositionEncodingKind$1.UTF16 = "utf-16";
		/**
		* Character offsets count UTF-32 code units.
		*
		* Implementation note: these are the same as Unicode codepoints,
		* so this `PositionEncodingKind` may also be used for an
		* encoding-agnostic representation of character offsets.
		*/
		PositionEncodingKind$1.UTF32 = "utf-32";
	})(PositionEncodingKind || (exports.PositionEncodingKind = PositionEncodingKind = {}));
	/**
	* The StaticRegistrationOptions namespace provides helper functions to work with
	* {@link StaticRegistrationOptions} literals.
	*/
	var StaticRegistrationOptions;
	(function(StaticRegistrationOptions$1) {
		function hasId(value) {
			const candidate = value;
			return candidate && Is.string(candidate.id) && candidate.id.length > 0;
		}
		StaticRegistrationOptions$1.hasId = hasId;
	})(StaticRegistrationOptions || (exports.StaticRegistrationOptions = StaticRegistrationOptions = {}));
	/**
	* The TextDocumentRegistrationOptions namespace provides helper functions to work with
	* {@link TextDocumentRegistrationOptions} literals.
	*/
	var TextDocumentRegistrationOptions;
	(function(TextDocumentRegistrationOptions$1) {
		function is$1(value) {
			const candidate = value;
			return candidate && (candidate.documentSelector === null || DocumentSelector.is(candidate.documentSelector));
		}
		TextDocumentRegistrationOptions$1.is = is$1;
	})(TextDocumentRegistrationOptions || (exports.TextDocumentRegistrationOptions = TextDocumentRegistrationOptions = {}));
	/**
	* The WorkDoneProgressOptions namespace provides helper functions to work with
	* {@link WorkDoneProgressOptions} literals.
	*/
	var WorkDoneProgressOptions;
	(function(WorkDoneProgressOptions$1) {
		function is$1(value) {
			const candidate = value;
			return Is.objectLiteral(candidate) && (candidate.workDoneProgress === void 0 || Is.boolean(candidate.workDoneProgress));
		}
		WorkDoneProgressOptions$1.is = is$1;
		function hasWorkDoneProgress(value) {
			const candidate = value;
			return candidate && Is.boolean(candidate.workDoneProgress);
		}
		WorkDoneProgressOptions$1.hasWorkDoneProgress = hasWorkDoneProgress;
	})(WorkDoneProgressOptions || (exports.WorkDoneProgressOptions = WorkDoneProgressOptions = {}));
	/**
	* The initialize request is sent from the client to the server.
	* It is sent once as the request after starting up the server.
	* The requests parameter is of type {@link InitializeParams}
	* the response if of type {@link InitializeResult} of a Thenable that
	* resolves to such.
	*/
	var InitializeRequest;
	(function(InitializeRequest$1) {
		InitializeRequest$1.method = "initialize";
		InitializeRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		InitializeRequest$1.type = new messages_1.ProtocolRequestType(InitializeRequest$1.method);
	})(InitializeRequest || (exports.InitializeRequest = InitializeRequest = {}));
	/**
	* Known error codes for an `InitializeErrorCodes`;
	*/
	var InitializeErrorCodes;
	(function(InitializeErrorCodes$1) {
		/**
		* If the protocol version provided by the client can't be handled by the server.
		*
		* @deprecated This initialize error got replaced by client capabilities. There is
		* no version handshake in version 3.0x
		*/
		InitializeErrorCodes$1.unknownProtocolVersion = 1;
	})(InitializeErrorCodes || (exports.InitializeErrorCodes = InitializeErrorCodes = {}));
	/**
	* The initialized notification is sent from the client to the
	* server after the client is fully initialized and the server
	* is allowed to send requests from the server to the client.
	*/
	var InitializedNotification;
	(function(InitializedNotification$1) {
		InitializedNotification$1.method = "initialized";
		InitializedNotification$1.messageDirection = messages_1.MessageDirection.clientToServer;
		InitializedNotification$1.type = new messages_1.ProtocolNotificationType(InitializedNotification$1.method);
	})(InitializedNotification || (exports.InitializedNotification = InitializedNotification = {}));
	/**
	* A shutdown request is sent from the client to the server.
	* It is sent once when the client decides to shutdown the
	* server. The only notification that is sent after a shutdown request
	* is the exit event.
	*/
	var ShutdownRequest;
	(function(ShutdownRequest$1) {
		ShutdownRequest$1.method = "shutdown";
		ShutdownRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		ShutdownRequest$1.type = new messages_1.ProtocolRequestType0(ShutdownRequest$1.method);
	})(ShutdownRequest || (exports.ShutdownRequest = ShutdownRequest = {}));
	/**
	* The exit event is sent from the client to the server to
	* ask the server to exit its process.
	*/
	var ExitNotification;
	(function(ExitNotification$1) {
		ExitNotification$1.method = "exit";
		ExitNotification$1.messageDirection = messages_1.MessageDirection.clientToServer;
		ExitNotification$1.type = new messages_1.ProtocolNotificationType0(ExitNotification$1.method);
	})(ExitNotification || (exports.ExitNotification = ExitNotification = {}));
	/**
	* The configuration change notification is sent from the client to the server
	* when the client's configuration has changed. The notification contains
	* the changed configuration as defined by the language client.
	*/
	var DidChangeConfigurationNotification;
	(function(DidChangeConfigurationNotification$1) {
		DidChangeConfigurationNotification$1.method = "workspace/didChangeConfiguration";
		DidChangeConfigurationNotification$1.messageDirection = messages_1.MessageDirection.clientToServer;
		DidChangeConfigurationNotification$1.type = new messages_1.ProtocolNotificationType(DidChangeConfigurationNotification$1.method);
	})(DidChangeConfigurationNotification || (exports.DidChangeConfigurationNotification = DidChangeConfigurationNotification = {}));
	/**
	* The message type
	*/
	var MessageType;
	(function(MessageType$1) {
		/**
		* An error message.
		*/
		MessageType$1.Error = 1;
		/**
		* A warning message.
		*/
		MessageType$1.Warning = 2;
		/**
		* An information message.
		*/
		MessageType$1.Info = 3;
		/**
		* A log message.
		*/
		MessageType$1.Log = 4;
		/**
		* A debug message.
		*
		* @since 3.18.0
		*/
		MessageType$1.Debug = 5;
	})(MessageType || (exports.MessageType = MessageType = {}));
	/**
	* The show message notification is sent from a server to a client to ask
	* the client to display a particular message in the user interface.
	*/
	var ShowMessageNotification;
	(function(ShowMessageNotification$1) {
		ShowMessageNotification$1.method = "window/showMessage";
		ShowMessageNotification$1.messageDirection = messages_1.MessageDirection.serverToClient;
		ShowMessageNotification$1.type = new messages_1.ProtocolNotificationType(ShowMessageNotification$1.method);
	})(ShowMessageNotification || (exports.ShowMessageNotification = ShowMessageNotification = {}));
	/**
	* The show message request is sent from the server to the client to show a message
	* and a set of options actions to the user.
	*/
	var ShowMessageRequest;
	(function(ShowMessageRequest$1) {
		ShowMessageRequest$1.method = "window/showMessageRequest";
		ShowMessageRequest$1.messageDirection = messages_1.MessageDirection.serverToClient;
		ShowMessageRequest$1.type = new messages_1.ProtocolRequestType(ShowMessageRequest$1.method);
	})(ShowMessageRequest || (exports.ShowMessageRequest = ShowMessageRequest = {}));
	/**
	* The log message notification is sent from the server to the client to ask
	* the client to log a particular message.
	*/
	var LogMessageNotification;
	(function(LogMessageNotification$1) {
		LogMessageNotification$1.method = "window/logMessage";
		LogMessageNotification$1.messageDirection = messages_1.MessageDirection.serverToClient;
		LogMessageNotification$1.type = new messages_1.ProtocolNotificationType(LogMessageNotification$1.method);
	})(LogMessageNotification || (exports.LogMessageNotification = LogMessageNotification = {}));
	/**
	* The telemetry event notification is sent from the server to the client to ask
	* the client to log telemetry data.
	*/
	var TelemetryEventNotification;
	(function(TelemetryEventNotification$1) {
		TelemetryEventNotification$1.method = "telemetry/event";
		TelemetryEventNotification$1.messageDirection = messages_1.MessageDirection.serverToClient;
		TelemetryEventNotification$1.type = new messages_1.ProtocolNotificationType(TelemetryEventNotification$1.method);
	})(TelemetryEventNotification || (exports.TelemetryEventNotification = TelemetryEventNotification = {}));
	/**
	* Defines how the host (editor) should sync
	* document changes to the language server.
	*/
	var TextDocumentSyncKind;
	(function(TextDocumentSyncKind$1) {
		/**
		* Documents should not be synced at all.
		*/
		TextDocumentSyncKind$1.None = 0;
		/**
		* Documents are synced by always sending the full content
		* of the document.
		*/
		TextDocumentSyncKind$1.Full = 1;
		/**
		* Documents are synced by sending the full content on open.
		* After that only incremental updates to the document are
		* send.
		*/
		TextDocumentSyncKind$1.Incremental = 2;
	})(TextDocumentSyncKind || (exports.TextDocumentSyncKind = TextDocumentSyncKind = {}));
	/**
	* The document open notification is sent from the client to the server to signal
	* newly opened text documents. The document's truth is now managed by the client
	* and the server must not try to read the document's truth using the document's
	* uri. Open in this sense means it is managed by the client. It doesn't necessarily
	* mean that its content is presented in an editor. An open notification must not
	* be sent more than once without a corresponding close notification send before.
	* This means open and close notification must be balanced and the max open count
	* is one.
	*/
	var DidOpenTextDocumentNotification;
	(function(DidOpenTextDocumentNotification$1) {
		DidOpenTextDocumentNotification$1.method = "textDocument/didOpen";
		DidOpenTextDocumentNotification$1.messageDirection = messages_1.MessageDirection.clientToServer;
		DidOpenTextDocumentNotification$1.type = new messages_1.ProtocolNotificationType(DidOpenTextDocumentNotification$1.method);
	})(DidOpenTextDocumentNotification || (exports.DidOpenTextDocumentNotification = DidOpenTextDocumentNotification = {}));
	var TextDocumentContentChangeEvent;
	(function(TextDocumentContentChangeEvent$1) {
		/**
		* Checks whether the information describes a delta event.
		*/
		function isIncremental(event) {
			let candidate = event;
			return candidate !== void 0 && candidate !== null && typeof candidate.text === "string" && candidate.range !== void 0 && (candidate.rangeLength === void 0 || typeof candidate.rangeLength === "number");
		}
		TextDocumentContentChangeEvent$1.isIncremental = isIncremental;
		/**
		* Checks whether the information describes a full replacement event.
		*/
		function isFull(event) {
			let candidate = event;
			return candidate !== void 0 && candidate !== null && typeof candidate.text === "string" && candidate.range === void 0 && candidate.rangeLength === void 0;
		}
		TextDocumentContentChangeEvent$1.isFull = isFull;
	})(TextDocumentContentChangeEvent || (exports.TextDocumentContentChangeEvent = TextDocumentContentChangeEvent = {}));
	/**
	* The document change notification is sent from the client to the server to signal
	* changes to a text document.
	*/
	var DidChangeTextDocumentNotification;
	(function(DidChangeTextDocumentNotification$1) {
		DidChangeTextDocumentNotification$1.method = "textDocument/didChange";
		DidChangeTextDocumentNotification$1.messageDirection = messages_1.MessageDirection.clientToServer;
		DidChangeTextDocumentNotification$1.type = new messages_1.ProtocolNotificationType(DidChangeTextDocumentNotification$1.method);
	})(DidChangeTextDocumentNotification || (exports.DidChangeTextDocumentNotification = DidChangeTextDocumentNotification = {}));
	/**
	* The document close notification is sent from the client to the server when
	* the document got closed in the client. The document's truth now exists where
	* the document's uri points to (e.g. if the document's uri is a file uri the
	* truth now exists on disk). As with the open notification the close notification
	* is about managing the document's content. Receiving a close notification
	* doesn't mean that the document was open in an editor before. A close
	* notification requires a previous open notification to be sent.
	*/
	var DidCloseTextDocumentNotification;
	(function(DidCloseTextDocumentNotification$1) {
		DidCloseTextDocumentNotification$1.method = "textDocument/didClose";
		DidCloseTextDocumentNotification$1.messageDirection = messages_1.MessageDirection.clientToServer;
		DidCloseTextDocumentNotification$1.type = new messages_1.ProtocolNotificationType(DidCloseTextDocumentNotification$1.method);
	})(DidCloseTextDocumentNotification || (exports.DidCloseTextDocumentNotification = DidCloseTextDocumentNotification = {}));
	/**
	* The document save notification is sent from the client to the server when
	* the document got saved in the client.
	*/
	var DidSaveTextDocumentNotification;
	(function(DidSaveTextDocumentNotification$1) {
		DidSaveTextDocumentNotification$1.method = "textDocument/didSave";
		DidSaveTextDocumentNotification$1.messageDirection = messages_1.MessageDirection.clientToServer;
		DidSaveTextDocumentNotification$1.type = new messages_1.ProtocolNotificationType(DidSaveTextDocumentNotification$1.method);
	})(DidSaveTextDocumentNotification || (exports.DidSaveTextDocumentNotification = DidSaveTextDocumentNotification = {}));
	/**
	* Represents reasons why a text document is saved.
	*/
	var TextDocumentSaveReason;
	(function(TextDocumentSaveReason$1) {
		/**
		* Manually triggered, e.g. by the user pressing save, by starting debugging,
		* or by an API call.
		*/
		TextDocumentSaveReason$1.Manual = 1;
		/**
		* Automatic after a delay.
		*/
		TextDocumentSaveReason$1.AfterDelay = 2;
		/**
		* When the editor lost focus.
		*/
		TextDocumentSaveReason$1.FocusOut = 3;
	})(TextDocumentSaveReason || (exports.TextDocumentSaveReason = TextDocumentSaveReason = {}));
	/**
	* A document will save notification is sent from the client to the server before
	* the document is actually saved.
	*/
	var WillSaveTextDocumentNotification;
	(function(WillSaveTextDocumentNotification$1) {
		WillSaveTextDocumentNotification$1.method = "textDocument/willSave";
		WillSaveTextDocumentNotification$1.messageDirection = messages_1.MessageDirection.clientToServer;
		WillSaveTextDocumentNotification$1.type = new messages_1.ProtocolNotificationType(WillSaveTextDocumentNotification$1.method);
	})(WillSaveTextDocumentNotification || (exports.WillSaveTextDocumentNotification = WillSaveTextDocumentNotification = {}));
	/**
	* A document will save request is sent from the client to the server before
	* the document is actually saved. The request can return an array of TextEdits
	* which will be applied to the text document before it is saved. Please note that
	* clients might drop results if computing the text edits took too long or if a
	* server constantly fails on this request. This is done to keep the save fast and
	* reliable.
	*/
	var WillSaveTextDocumentWaitUntilRequest;
	(function(WillSaveTextDocumentWaitUntilRequest$1) {
		WillSaveTextDocumentWaitUntilRequest$1.method = "textDocument/willSaveWaitUntil";
		WillSaveTextDocumentWaitUntilRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		WillSaveTextDocumentWaitUntilRequest$1.type = new messages_1.ProtocolRequestType(WillSaveTextDocumentWaitUntilRequest$1.method);
	})(WillSaveTextDocumentWaitUntilRequest || (exports.WillSaveTextDocumentWaitUntilRequest = WillSaveTextDocumentWaitUntilRequest = {}));
	/**
	* The watched files notification is sent from the client to the server when
	* the client detects changes to file watched by the language client.
	*/
	var DidChangeWatchedFilesNotification;
	(function(DidChangeWatchedFilesNotification$1) {
		DidChangeWatchedFilesNotification$1.method = "workspace/didChangeWatchedFiles";
		DidChangeWatchedFilesNotification$1.messageDirection = messages_1.MessageDirection.clientToServer;
		DidChangeWatchedFilesNotification$1.type = new messages_1.ProtocolNotificationType(DidChangeWatchedFilesNotification$1.method);
	})(DidChangeWatchedFilesNotification || (exports.DidChangeWatchedFilesNotification = DidChangeWatchedFilesNotification = {}));
	/**
	* The file event type
	*/
	var FileChangeType;
	(function(FileChangeType$1) {
		/**
		* The file got created.
		*/
		FileChangeType$1.Created = 1;
		/**
		* The file got changed.
		*/
		FileChangeType$1.Changed = 2;
		/**
		* The file got deleted.
		*/
		FileChangeType$1.Deleted = 3;
	})(FileChangeType || (exports.FileChangeType = FileChangeType = {}));
	var RelativePattern;
	(function(RelativePattern$1) {
		function is$1(value) {
			const candidate = value;
			return Is.objectLiteral(candidate) && (vscode_languageserver_types_1.URI.is(candidate.baseUri) || vscode_languageserver_types_1.WorkspaceFolder.is(candidate.baseUri)) && Is.string(candidate.pattern);
		}
		RelativePattern$1.is = is$1;
	})(RelativePattern || (exports.RelativePattern = RelativePattern = {}));
	var WatchKind;
	(function(WatchKind$1) {
		/**
		* Interested in create events.
		*/
		WatchKind$1.Create = 1;
		/**
		* Interested in change events
		*/
		WatchKind$1.Change = 2;
		/**
		* Interested in delete events
		*/
		WatchKind$1.Delete = 4;
	})(WatchKind || (exports.WatchKind = WatchKind = {}));
	/**
	* Diagnostics notification are sent from the server to the client to signal
	* results of validation runs.
	*/
	var PublishDiagnosticsNotification;
	(function(PublishDiagnosticsNotification$1) {
		PublishDiagnosticsNotification$1.method = "textDocument/publishDiagnostics";
		PublishDiagnosticsNotification$1.messageDirection = messages_1.MessageDirection.serverToClient;
		PublishDiagnosticsNotification$1.type = new messages_1.ProtocolNotificationType(PublishDiagnosticsNotification$1.method);
	})(PublishDiagnosticsNotification || (exports.PublishDiagnosticsNotification = PublishDiagnosticsNotification = {}));
	/**
	* How a completion was triggered
	*/
	var CompletionTriggerKind;
	(function(CompletionTriggerKind$1) {
		/**
		* Completion was triggered by typing an identifier (24x7 code
		* complete), manual invocation (e.g Ctrl+Space) or via API.
		*/
		CompletionTriggerKind$1.Invoked = 1;
		/**
		* Completion was triggered by a trigger character specified by
		* the `triggerCharacters` properties of the `CompletionRegistrationOptions`.
		*/
		CompletionTriggerKind$1.TriggerCharacter = 2;
		/**
		* Completion was re-triggered as current completion list is incomplete
		*/
		CompletionTriggerKind$1.TriggerForIncompleteCompletions = 3;
	})(CompletionTriggerKind || (exports.CompletionTriggerKind = CompletionTriggerKind = {}));
	/**
	* Request to request completion at a given text document position. The request's
	* parameter is of type {@link TextDocumentPosition} the response
	* is of type {@link CompletionItem CompletionItem[]} or {@link CompletionList}
	* or a Thenable that resolves to such.
	*
	* The request can delay the computation of the {@link CompletionItem.detail `detail`}
	* and {@link CompletionItem.documentation `documentation`} properties to the `completionItem/resolve`
	* request. However, properties that are needed for the initial sorting and filtering, like `sortText`,
	* `filterText`, `insertText`, and `textEdit`, must not be changed during resolve.
	*/
	var CompletionRequest;
	(function(CompletionRequest$1) {
		CompletionRequest$1.method = "textDocument/completion";
		CompletionRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		CompletionRequest$1.type = new messages_1.ProtocolRequestType(CompletionRequest$1.method);
	})(CompletionRequest || (exports.CompletionRequest = CompletionRequest = {}));
	/**
	* Request to resolve additional information for a given completion item.The request's
	* parameter is of type {@link CompletionItem} the response
	* is of type {@link CompletionItem} or a Thenable that resolves to such.
	*/
	var CompletionResolveRequest;
	(function(CompletionResolveRequest$1) {
		CompletionResolveRequest$1.method = "completionItem/resolve";
		CompletionResolveRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		CompletionResolveRequest$1.type = new messages_1.ProtocolRequestType(CompletionResolveRequest$1.method);
	})(CompletionResolveRequest || (exports.CompletionResolveRequest = CompletionResolveRequest = {}));
	/**
	* Request to request hover information at a given text document position. The request's
	* parameter is of type {@link TextDocumentPosition} the response is of
	* type {@link Hover} or a Thenable that resolves to such.
	*/
	var HoverRequest;
	(function(HoverRequest$1) {
		HoverRequest$1.method = "textDocument/hover";
		HoverRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		HoverRequest$1.type = new messages_1.ProtocolRequestType(HoverRequest$1.method);
	})(HoverRequest || (exports.HoverRequest = HoverRequest = {}));
	/**
	* How a signature help was triggered.
	*
	* @since 3.15.0
	*/
	var SignatureHelpTriggerKind;
	(function(SignatureHelpTriggerKind$1) {
		/**
		* Signature help was invoked manually by the user or by a command.
		*/
		SignatureHelpTriggerKind$1.Invoked = 1;
		/**
		* Signature help was triggered by a trigger character.
		*/
		SignatureHelpTriggerKind$1.TriggerCharacter = 2;
		/**
		* Signature help was triggered by the cursor moving or by the document content changing.
		*/
		SignatureHelpTriggerKind$1.ContentChange = 3;
	})(SignatureHelpTriggerKind || (exports.SignatureHelpTriggerKind = SignatureHelpTriggerKind = {}));
	var SignatureHelpRequest;
	(function(SignatureHelpRequest$1) {
		SignatureHelpRequest$1.method = "textDocument/signatureHelp";
		SignatureHelpRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		SignatureHelpRequest$1.type = new messages_1.ProtocolRequestType(SignatureHelpRequest$1.method);
	})(SignatureHelpRequest || (exports.SignatureHelpRequest = SignatureHelpRequest = {}));
	/**
	* A request to resolve the definition location of a symbol at a given text
	* document position. The request's parameter is of type {@link TextDocumentPosition}
	* the response is of either type {@link Definition} or a typed array of
	* {@link DefinitionLink} or a Thenable that resolves to such.
	*/
	var DefinitionRequest;
	(function(DefinitionRequest$1) {
		DefinitionRequest$1.method = "textDocument/definition";
		DefinitionRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		DefinitionRequest$1.type = new messages_1.ProtocolRequestType(DefinitionRequest$1.method);
	})(DefinitionRequest || (exports.DefinitionRequest = DefinitionRequest = {}));
	/**
	* A request to resolve project-wide references for the symbol denoted
	* by the given text document position. The request's parameter is of
	* type {@link ReferenceParams} the response is of type
	* {@link Location Location[]} or a Thenable that resolves to such.
	*/
	var ReferencesRequest;
	(function(ReferencesRequest$1) {
		ReferencesRequest$1.method = "textDocument/references";
		ReferencesRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		ReferencesRequest$1.type = new messages_1.ProtocolRequestType(ReferencesRequest$1.method);
	})(ReferencesRequest || (exports.ReferencesRequest = ReferencesRequest = {}));
	/**
	* Request to resolve a {@link DocumentHighlight} for a given
	* text document position. The request's parameter is of type {@link TextDocumentPosition}
	* the request response is an array of type {@link DocumentHighlight}
	* or a Thenable that resolves to such.
	*/
	var DocumentHighlightRequest;
	(function(DocumentHighlightRequest$1) {
		DocumentHighlightRequest$1.method = "textDocument/documentHighlight";
		DocumentHighlightRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		DocumentHighlightRequest$1.type = new messages_1.ProtocolRequestType(DocumentHighlightRequest$1.method);
	})(DocumentHighlightRequest || (exports.DocumentHighlightRequest = DocumentHighlightRequest = {}));
	/**
	* A request to list all symbols found in a given text document. The request's
	* parameter is of type {@link TextDocumentIdentifier} the
	* response is of type {@link SymbolInformation SymbolInformation[]} or a Thenable
	* that resolves to such.
	*/
	var DocumentSymbolRequest;
	(function(DocumentSymbolRequest$1) {
		DocumentSymbolRequest$1.method = "textDocument/documentSymbol";
		DocumentSymbolRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		DocumentSymbolRequest$1.type = new messages_1.ProtocolRequestType(DocumentSymbolRequest$1.method);
	})(DocumentSymbolRequest || (exports.DocumentSymbolRequest = DocumentSymbolRequest = {}));
	/**
	* A request to provide commands for the given text document and range.
	*/
	var CodeActionRequest;
	(function(CodeActionRequest$1) {
		CodeActionRequest$1.method = "textDocument/codeAction";
		CodeActionRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		CodeActionRequest$1.type = new messages_1.ProtocolRequestType(CodeActionRequest$1.method);
	})(CodeActionRequest || (exports.CodeActionRequest = CodeActionRequest = {}));
	/**
	* Request to resolve additional information for a given code action.The request's
	* parameter is of type {@link CodeAction} the response
	* is of type {@link CodeAction} or a Thenable that resolves to such.
	*/
	var CodeActionResolveRequest;
	(function(CodeActionResolveRequest$1) {
		CodeActionResolveRequest$1.method = "codeAction/resolve";
		CodeActionResolveRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		CodeActionResolveRequest$1.type = new messages_1.ProtocolRequestType(CodeActionResolveRequest$1.method);
	})(CodeActionResolveRequest || (exports.CodeActionResolveRequest = CodeActionResolveRequest = {}));
	/**
	* A request to list project-wide symbols matching the query string given
	* by the {@link WorkspaceSymbolParams}. The response is
	* of type {@link SymbolInformation SymbolInformation[]} or a Thenable that
	* resolves to such.
	*
	* @since 3.17.0 - support for WorkspaceSymbol in the returned data. Clients
	*  need to advertise support for WorkspaceSymbols via the client capability
	*  `workspace.symbol.resolveSupport`.
	*
	*/
	var WorkspaceSymbolRequest;
	(function(WorkspaceSymbolRequest$1) {
		WorkspaceSymbolRequest$1.method = "workspace/symbol";
		WorkspaceSymbolRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		WorkspaceSymbolRequest$1.type = new messages_1.ProtocolRequestType(WorkspaceSymbolRequest$1.method);
	})(WorkspaceSymbolRequest || (exports.WorkspaceSymbolRequest = WorkspaceSymbolRequest = {}));
	/**
	* A request to resolve the range inside the workspace
	* symbol's location.
	*
	* @since 3.17.0
	*/
	var WorkspaceSymbolResolveRequest;
	(function(WorkspaceSymbolResolveRequest$1) {
		WorkspaceSymbolResolveRequest$1.method = "workspaceSymbol/resolve";
		WorkspaceSymbolResolveRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		WorkspaceSymbolResolveRequest$1.type = new messages_1.ProtocolRequestType(WorkspaceSymbolResolveRequest$1.method);
	})(WorkspaceSymbolResolveRequest || (exports.WorkspaceSymbolResolveRequest = WorkspaceSymbolResolveRequest = {}));
	/**
	* A request to provide code lens for the given text document.
	*/
	var CodeLensRequest;
	(function(CodeLensRequest$1) {
		CodeLensRequest$1.method = "textDocument/codeLens";
		CodeLensRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		CodeLensRequest$1.type = new messages_1.ProtocolRequestType(CodeLensRequest$1.method);
	})(CodeLensRequest || (exports.CodeLensRequest = CodeLensRequest = {}));
	/**
	* A request to resolve a command for a given code lens.
	*/
	var CodeLensResolveRequest;
	(function(CodeLensResolveRequest$1) {
		CodeLensResolveRequest$1.method = "codeLens/resolve";
		CodeLensResolveRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		CodeLensResolveRequest$1.type = new messages_1.ProtocolRequestType(CodeLensResolveRequest$1.method);
	})(CodeLensResolveRequest || (exports.CodeLensResolveRequest = CodeLensResolveRequest = {}));
	/**
	* A request to refresh all code actions
	*
	* @since 3.16.0
	*/
	var CodeLensRefreshRequest;
	(function(CodeLensRefreshRequest$1) {
		CodeLensRefreshRequest$1.method = `workspace/codeLens/refresh`;
		CodeLensRefreshRequest$1.messageDirection = messages_1.MessageDirection.serverToClient;
		CodeLensRefreshRequest$1.type = new messages_1.ProtocolRequestType0(CodeLensRefreshRequest$1.method);
	})(CodeLensRefreshRequest || (exports.CodeLensRefreshRequest = CodeLensRefreshRequest = {}));
	/**
	* A request to provide document links
	*/
	var DocumentLinkRequest;
	(function(DocumentLinkRequest$1) {
		DocumentLinkRequest$1.method = "textDocument/documentLink";
		DocumentLinkRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		DocumentLinkRequest$1.type = new messages_1.ProtocolRequestType(DocumentLinkRequest$1.method);
	})(DocumentLinkRequest || (exports.DocumentLinkRequest = DocumentLinkRequest = {}));
	/**
	* Request to resolve additional information for a given document link. The request's
	* parameter is of type {@link DocumentLink} the response
	* is of type {@link DocumentLink} or a Thenable that resolves to such.
	*/
	var DocumentLinkResolveRequest;
	(function(DocumentLinkResolveRequest$1) {
		DocumentLinkResolveRequest$1.method = "documentLink/resolve";
		DocumentLinkResolveRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		DocumentLinkResolveRequest$1.type = new messages_1.ProtocolRequestType(DocumentLinkResolveRequest$1.method);
	})(DocumentLinkResolveRequest || (exports.DocumentLinkResolveRequest = DocumentLinkResolveRequest = {}));
	/**
	* A request to format a whole document.
	*/
	var DocumentFormattingRequest;
	(function(DocumentFormattingRequest$1) {
		DocumentFormattingRequest$1.method = "textDocument/formatting";
		DocumentFormattingRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		DocumentFormattingRequest$1.type = new messages_1.ProtocolRequestType(DocumentFormattingRequest$1.method);
	})(DocumentFormattingRequest || (exports.DocumentFormattingRequest = DocumentFormattingRequest = {}));
	/**
	* A request to format a range in a document.
	*/
	var DocumentRangeFormattingRequest;
	(function(DocumentRangeFormattingRequest$1) {
		DocumentRangeFormattingRequest$1.method = "textDocument/rangeFormatting";
		DocumentRangeFormattingRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		DocumentRangeFormattingRequest$1.type = new messages_1.ProtocolRequestType(DocumentRangeFormattingRequest$1.method);
	})(DocumentRangeFormattingRequest || (exports.DocumentRangeFormattingRequest = DocumentRangeFormattingRequest = {}));
	/**
	* A request to format ranges in a document.
	*
	* @since 3.18.0
	* @proposed
	*/
	var DocumentRangesFormattingRequest;
	(function(DocumentRangesFormattingRequest$1) {
		DocumentRangesFormattingRequest$1.method = "textDocument/rangesFormatting";
		DocumentRangesFormattingRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		DocumentRangesFormattingRequest$1.type = new messages_1.ProtocolRequestType(DocumentRangesFormattingRequest$1.method);
	})(DocumentRangesFormattingRequest || (exports.DocumentRangesFormattingRequest = DocumentRangesFormattingRequest = {}));
	/**
	* A request to format a document on type.
	*/
	var DocumentOnTypeFormattingRequest;
	(function(DocumentOnTypeFormattingRequest$1) {
		DocumentOnTypeFormattingRequest$1.method = "textDocument/onTypeFormatting";
		DocumentOnTypeFormattingRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		DocumentOnTypeFormattingRequest$1.type = new messages_1.ProtocolRequestType(DocumentOnTypeFormattingRequest$1.method);
	})(DocumentOnTypeFormattingRequest || (exports.DocumentOnTypeFormattingRequest = DocumentOnTypeFormattingRequest = {}));
	var PrepareSupportDefaultBehavior;
	(function(PrepareSupportDefaultBehavior$1) {
		/**
		* The client's default behavior is to select the identifier
		* according the to language's syntax rule.
		*/
		PrepareSupportDefaultBehavior$1.Identifier = 1;
	})(PrepareSupportDefaultBehavior || (exports.PrepareSupportDefaultBehavior = PrepareSupportDefaultBehavior = {}));
	/**
	* A request to rename a symbol.
	*/
	var RenameRequest;
	(function(RenameRequest$1) {
		RenameRequest$1.method = "textDocument/rename";
		RenameRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		RenameRequest$1.type = new messages_1.ProtocolRequestType(RenameRequest$1.method);
	})(RenameRequest || (exports.RenameRequest = RenameRequest = {}));
	/**
	* A request to test and perform the setup necessary for a rename.
	*
	* @since 3.16 - support for default behavior
	*/
	var PrepareRenameRequest;
	(function(PrepareRenameRequest$1) {
		PrepareRenameRequest$1.method = "textDocument/prepareRename";
		PrepareRenameRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		PrepareRenameRequest$1.type = new messages_1.ProtocolRequestType(PrepareRenameRequest$1.method);
	})(PrepareRenameRequest || (exports.PrepareRenameRequest = PrepareRenameRequest = {}));
	/**
	* A request send from the client to the server to execute a command. The request might return
	* a workspace edit which the client will apply to the workspace.
	*/
	var ExecuteCommandRequest;
	(function(ExecuteCommandRequest$1) {
		ExecuteCommandRequest$1.method = "workspace/executeCommand";
		ExecuteCommandRequest$1.messageDirection = messages_1.MessageDirection.clientToServer;
		ExecuteCommandRequest$1.type = new messages_1.ProtocolRequestType(ExecuteCommandRequest$1.method);
	})(ExecuteCommandRequest || (exports.ExecuteCommandRequest = ExecuteCommandRequest = {}));
	/**
	* A request sent from the server to the client to modified certain resources.
	*/
	var ApplyWorkspaceEditRequest;
	(function(ApplyWorkspaceEditRequest$1) {
		ApplyWorkspaceEditRequest$1.method = "workspace/applyEdit";
		ApplyWorkspaceEditRequest$1.messageDirection = messages_1.MessageDirection.serverToClient;
		ApplyWorkspaceEditRequest$1.type = new messages_1.ProtocolRequestType("workspace/applyEdit");
	})(ApplyWorkspaceEditRequest || (exports.ApplyWorkspaceEditRequest = ApplyWorkspaceEditRequest = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/connection.js
var require_connection = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/connection.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.createProtocolConnection = void 0;
	const vscode_jsonrpc_1 = require_main$2();
	function createProtocolConnection$1(input, output, logger, options) {
		if (vscode_jsonrpc_1.ConnectionStrategy.is(options)) options = { connectionStrategy: options };
		return (0, vscode_jsonrpc_1.createMessageConnection)(input, output, logger, options);
	}
	exports.createProtocolConnection = createProtocolConnection$1;
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/api.js
var require_api = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/common/api.js"(exports) {
	var __createBinding$1 = void 0 && (void 0).__createBinding || (Object.create ? function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	} : function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	});
	var __exportStar$1 = void 0 && (void 0).__exportStar || function(m, exports$1) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$1, p)) __createBinding$1(exports$1, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.LSPErrorCodes = exports.createProtocolConnection = void 0;
	__exportStar$1(require_main$2(), exports);
	__exportStar$1(require_main$1(), exports);
	__exportStar$1(require_messages(), exports);
	__exportStar$1(require_protocol(), exports);
	var connection_1 = require_connection();
	Object.defineProperty(exports, "createProtocolConnection", {
		enumerable: true,
		get: function() {
			return connection_1.createProtocolConnection;
		}
	});
	var LSPErrorCodes;
	(function(LSPErrorCodes$1) {
		/**
		* This is the start range of LSP reserved error codes.
		* It doesn't denote a real error code.
		*
		* @since 3.16.0
		*/
		LSPErrorCodes$1.lspReservedErrorRangeStart = -32899;
		/**
		* A request failed but it was syntactically correct, e.g the
		* method name was known and the parameters were valid. The error
		* message should contain human readable information about why
		* the request failed.
		*
		* @since 3.17.0
		*/
		LSPErrorCodes$1.RequestFailed = -32803;
		/**
		* The server cancelled the request. This error code should
		* only be used for requests that explicitly support being
		* server cancellable.
		*
		* @since 3.17.0
		*/
		LSPErrorCodes$1.ServerCancelled = -32802;
		/**
		* The server detected that the content of a document got
		* modified outside normal conditions. A server should
		* NOT send this error code if it detects a content change
		* in it unprocessed messages. The result even computed
		* on an older state might still be useful for the client.
		*
		* If a client decides that a result is not of any use anymore
		* the client should cancel the request.
		*/
		LSPErrorCodes$1.ContentModified = -32801;
		/**
		* The client has canceled a request and a server as detected
		* the cancel.
		*/
		LSPErrorCodes$1.RequestCancelled = -32800;
		/**
		* This is the end range of LSP reserved error codes.
		* It doesn't denote a real error code.
		*
		* @since 3.16.0
		*/
		LSPErrorCodes$1.lspReservedErrorRangeEnd = -32800;
	})(LSPErrorCodes || (exports.LSPErrorCodes = LSPErrorCodes = {}));
} });

//#endregion
//#region node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/node/main.js
var require_main = __commonJS({ "node_modules/.pnpm/vscode-languageserver-protocol@3.17.5/node_modules/vscode-languageserver-protocol/lib/node/main.js"(exports) {
	var __createBinding = void 0 && (void 0).__createBinding || (Object.create ? function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	} : function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	});
	var __exportStar = void 0 && (void 0).__exportStar || function(m, exports$1) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$1, p)) __createBinding(exports$1, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.createProtocolConnection = void 0;
	const node_1 = require_node();
	__exportStar(require_node(), exports);
	__exportStar(require_api(), exports);
	function createProtocolConnection(input, output, logger, options) {
		return (0, node_1.createMessageConnection)(input, output, logger, options);
	}
	exports.createProtocolConnection = createProtocolConnection;
} });

//#endregion
//#region packages/lsp-client/src/client/context.ts
/**
* Get language ID from file path
*/
function getLanguageIdFromPath(filePath) {
	const ext = filePath.split(".").pop()?.toLowerCase();
	const languageMap = {
		ts: "typescript",
		tsx: "typescriptreact",
		js: "javascript",
		jsx: "javascriptreact",
		mjs: "javascript",
		cjs: "javascript",
		py: "python",
		rs: "rust",
		go: "go",
		java: "java",
		c: "c",
		cpp: "cpp",
		cc: "cpp",
		cxx: "cpp",
		h: "c",
		hpp: "cpp",
		cs: "csharp",
		fs: "fsharp",
		fsx: "fsharp",
		fsi: "fsharp",
		ml: "ocaml",
		mli: "ocaml",
		rb: "ruby",
		php: "php",
		lua: "lua",
		dart: "dart",
		swift: "swift",
		kt: "kotlin",
		scala: "scala",
		r: "r",
		jl: "julia",
		nim: "nim",
		zig: "zig",
		v: "vlang",
		sh: "shellscript",
		bash: "shellscript",
		zsh: "shellscript",
		fish: "shellscript",
		ps1: "powershell",
		psm1: "powershell",
		yaml: "yaml",
		yml: "yaml",
		json: "json",
		jsonc: "jsonc",
		xml: "xml",
		html: "html",
		htm: "html",
		css: "css",
		scss: "scss",
		sass: "sass",
		less: "less",
		md: "markdown",
		markdown: "markdown",
		tex: "latex",
		bib: "bibtex",
		sql: "sql",
		toml: "toml",
		ini: "ini",
		cfg: "ini",
		conf: "ini",
		vb: "vb",
		clj: "clojure",
		cljs: "clojurescript",
		cljc: "clojure",
		elm: "elm",
		ex: "elixir",
		exs: "elixir",
		erl: "erlang",
		hrl: "erlang",
		vue: "vue",
		svelte: "svelte"
	};
	return languageMap[ext || ""] || null;
}

//#endregion
//#region packages/lsp-client/src/utils/fsharp-position-fix.ts
/**
* Fix F# symbol positions that point to comments
*
* @param symbols The symbols returned by fsautocomplete
* @param fileContent The content of the file
* @returns Symbols with corrected positions
*/
function fixFSharpSymbolPositions(symbols, fileContent) {
	const lines = fileContent.split("\n");
	return symbols.map((symbol) => fixSymbol(symbol, lines));
}
function fixSymbol(symbol, lines) {
	const fixedRange = fixRange(symbol.range, symbol.selectionRange, lines, symbol.name);
	const fixedChildren = symbol.children?.map((child) => fixSymbol(child, lines));
	return {
		...symbol,
		range: fixedRange.range,
		selectionRange: fixedRange.selectionRange,
		children: fixedChildren
	};
}
function fixRange(range, selectionRange, lines, symbolName) {
	const startLine = range.start.line;
	if (startLine >= lines.length) return {
		range,
		selectionRange
	};
	const currentLine = lines[startLine].trim();
	if (currentLine.startsWith("///") || currentLine.startsWith("//")) for (let i = startLine + 1; i < Math.min(startLine + 10, lines.length); i++) {
		const line = lines[i];
		const trimmedLine = line.trim();
		if (trimmedLine === "" || trimmedLine.startsWith("///") || trimmedLine.startsWith("//")) continue;
		const isRecordField = trimmedLine.includes(`${symbolName}:`) && !trimmedLine.startsWith("///") && !trimmedLine.startsWith("//");
		if (isRecordField || trimmedLine.startsWith("let ") || trimmedLine.startsWith("type ") || trimmedLine.startsWith("member ") || trimmedLine.startsWith("val ") || trimmedLine.startsWith("module ") || trimmedLine.startsWith("namespace ") || trimmedLine.includes(`let ${symbolName}`) || trimmedLine.includes(`type ${symbolName}`) || trimmedLine.includes(`member this.${symbolName}`) || trimmedLine.includes(`member self.${symbolName}`) || trimmedLine.includes(`member _.${symbolName}`)) {
			const charPos = line.indexOf(symbolName);
			const newStart = {
				line: i,
				character: charPos >= 0 ? charPos : 0
			};
			const lineDiff = i - startLine;
			return {
				range: {
					start: newStart,
					end: {
						line: range.end.line + lineDiff,
						character: range.end.character
					}
				},
				selectionRange: {
					start: newStart,
					end: {
						line: selectionRange.end.line + lineDiff,
						character: selectionRange.end.character
					}
				}
			};
		}
	}
	return {
		range,
		selectionRange
	};
}

//#endregion
//#region packages/lsp-client/src/providers.ts
/**
* LSP implementation of SymbolProvider
*/
var LSPSymbolProvider = class {
	constructor(client, fileContentProvider, languageId) {
		this.client = client;
		this.fileContentProvider = fileContentProvider;
		this.languageId = languageId;
	}
	async getDocumentSymbols(uri) {
		try {
			const content = await this.fileContentProvider(uri);
			this.client.openDocument(uri, content);
			try {
				await new Promise((resolve$1) => setTimeout(resolve$1, 200));
				let symbols = await this.client.getDocumentSymbols(uri);
				if (this.languageId === "fsharp" && (uri.endsWith(".fs") || uri.endsWith(".fsi") || uri.endsWith(".fsx"))) symbols = fixFSharpSymbolPositions(symbols, content);
				return symbols;
			} finally {
				this.client.closeDocument(uri);
			}
		} catch (error$2) {
			return [];
		}
	}
};
/**
* Create an LSP-based symbol provider
*/
function createLSPSymbolProvider(client, fileContentProvider, languageId) {
	return new LSPSymbolProvider(client, fileContentProvider, languageId);
}

//#endregion
//#region packages/lsp-client/src/capabilities/CapabilityChecker.ts
var CapabilityChecker = class {
	capabilities;
	constructor(capabilities) {
		this.capabilities = capabilities;
	}
	/**
	* Update the capabilities
	*/
	setCapabilities(capabilities) {
		this.capabilities = capabilities;
	}
	/**
	* Check if server supports a specific capability
	*/
	hasCapability(capability) {
		if (!this.capabilities) return false;
		const value = this.capabilities[capability];
		if (typeof value === "boolean") return value;
		if (typeof value === "object" && value !== null) return true;
		return false;
	}
	/**
	* Check if server supports multiple capabilities
	*/
	hasCapabilities(capabilities) {
		return capabilities.every((cap) => this.hasCapability(cap));
	}
	/**
	* Check if a tool is supported based on its required capabilities
	*/
	isToolSupported(requirement) {
		return this.hasCapabilities(requirement.requiredCapabilities);
	}
	/**
	* Filter tools based on server capabilities
	*/
	filterTools(tools, requirements) {
		if (!this.capabilities) return tools;
		return tools.filter((tool) => {
			const required = requirements.get(tool.name);
			if (!required || required.length === 0) return true;
			return this.hasCapabilities(required);
		});
	}
	/**
	* Get detailed capability support information
	*/
	getCapabilitySupport() {
		const support = {};
		if (!this.capabilities) return support;
		const commonCapabilities = [
			"definitionProvider",
			"referencesProvider",
			"hoverProvider",
			"documentSymbolProvider",
			"workspaceSymbolProvider",
			"completionProvider",
			"signatureHelpProvider",
			"codeActionProvider",
			"codeLensProvider",
			"documentFormattingProvider",
			"documentRangeFormattingProvider",
			"documentOnTypeFormattingProvider",
			"renameProvider",
			"documentLinkProvider",
			"colorProvider",
			"foldingRangeProvider",
			"declarationProvider",
			"implementationProvider",
			"typeDefinitionProvider",
			"callHierarchyProvider",
			"semanticTokensProvider",
			"linkedEditingRangeProvider",
			"monikerProvider",
			"typeHierarchyProvider",
			"inlineValueProvider",
			"inlayHintProvider",
			"diagnosticProvider"
		];
		for (const capability of commonCapabilities) support[capability] = this.hasCapability(capability);
		return support;
	}
	/**
	* Get human-readable capability names
	*/
	static getCapabilityDisplayName(capability) {
		const displayNames = {
			definitionProvider: "Go to Definition",
			referencesProvider: "Find References",
			hoverProvider: "Hover Information",
			documentSymbolProvider: "Document Symbols",
			workspaceSymbolProvider: "Workspace Symbols",
			completionProvider: "Code Completion",
			signatureHelpProvider: "Signature Help",
			codeActionProvider: "Code Actions",
			codeLensProvider: "Code Lens",
			documentFormattingProvider: "Format Document",
			documentRangeFormattingProvider: "Format Selection",
			documentOnTypeFormattingProvider: "Format on Type",
			renameProvider: "Rename Symbol",
			documentLinkProvider: "Document Links",
			colorProvider: "Color Information",
			foldingRangeProvider: "Code Folding",
			declarationProvider: "Go to Declaration",
			implementationProvider: "Go to Implementation",
			typeDefinitionProvider: "Go to Type Definition",
			callHierarchyProvider: "Call Hierarchy",
			semanticTokensProvider: "Semantic Tokens",
			linkedEditingRangeProvider: "Linked Editing",
			monikerProvider: "Monikers",
			typeHierarchyProvider: "Type Hierarchy",
			inlineValueProvider: "Inline Values",
			inlayHintProvider: "Inlay Hints",
			diagnosticProvider: "Pull Diagnostics"
		};
		return displayNames[capability] || String(capability);
	}
};
/**
* Create a mapping of tool names to required capabilities
*/
function createToolCapabilityMap() {
	const map = /* @__PURE__ */ new Map();
	map.set("get_hover", ["hoverProvider"]);
	map.set("find_references", ["referencesProvider"]);
	map.set("get_definitions", ["definitionProvider"]);
	map.set("get_diagnostics", ["diagnosticProvider"]);
	map.set("get_all_diagnostics", ["diagnosticProvider"]);
	map.set("get_document_symbols", ["documentSymbolProvider"]);
	map.set("get_completion", ["completionProvider"]);
	map.set("get_signature_help", ["signatureHelpProvider"]);
	map.set("format_document", ["documentFormattingProvider"]);
	map.set("get_workspace_symbols", ["workspaceSymbolProvider"]);
	map.set("get_code_actions", ["codeActionProvider"]);
	map.set("rename_symbol", ["renameProvider"]);
	return map;
}

//#endregion
//#region packages/lsp-client/src/utils/defaults.ts
var DefaultLogger = class {
	debug(..._args) {}
	info(..._args) {}
	warn(..._args) {}
	error(..._args) {}
};
var DefaultErrorHandler = class {
	formatError(error$2, context) {
		const message = error$2?.message || String(error$2);
		if (context && Object.keys(context).length > 0) return `${message} (Context: ${JSON.stringify(context)})`;
		return message;
	}
};
var DefaultLanguageDetector = class {
	languageMap = {
		ts: "typescript",
		tsx: "typescriptreact",
		js: "javascript",
		jsx: "javascriptreact",
		py: "python",
		rs: "rust",
		go: "go",
		java: "java",
		c: "c",
		cpp: "cpp",
		cs: "csharp",
		rb: "ruby",
		php: "php",
		swift: "swift",
		kt: "kotlin",
		scala: "scala",
		sh: "shellscript",
		yml: "yaml",
		yaml: "yaml",
		json: "json",
		xml: "xml",
		html: "html",
		css: "css",
		scss: "scss",
		sass: "sass",
		less: "less",
		md: "markdown",
		sql: "sql"
	};
	getLanguageId(filePath) {
		const ext = filePath.split(".").pop();
		return this.languageMap[ext || ""] || null;
	}
};
var DefaultLineResolver = class {
	resolveLineParameter(lines, line) {
		if (typeof line === "number") return Math.max(0, Math.min(line - 1, lines.length - 1));
		const index = lines.findIndex((l) => l.includes(line));
		if (index === -1) throw new Error(`Line containing "${line}" not found`);
		return index;
	}
};
var DefaultServerCharacteristicsProvider = class {
	defaultCharacteristics = {
		documentOpenDelay: 100,
		operationTimeout: 5e3,
		supportsIncrementalSync: true,
		supportsPullDiagnostics: false
	};
	getCharacteristics(_languageId, overrides) {
		return {
			...this.defaultCharacteristics,
			...overrides
		};
	}
};

//#endregion
//#region packages/lsp-client/src/container.ts
var DependencyContainer = class {
	_logger = new DefaultLogger();
	_errorHandler = new DefaultErrorHandler();
	_fileSystem;
	_languageDetector = new DefaultLanguageDetector();
	_lineResolver = new DefaultLineResolver();
	_serverCharacteristicsProvider = new DefaultServerCharacteristicsProvider();
	get logger() {
		return this._logger;
	}
	set logger(value) {
		this._logger = value;
	}
	get errorHandler() {
		return this._errorHandler;
	}
	set errorHandler(value) {
		this._errorHandler = value;
	}
	get fileSystem() {
		return this._fileSystem;
	}
	set fileSystem(value) {
		this._fileSystem = value;
	}
	get languageDetector() {
		return this._languageDetector;
	}
	set languageDetector(value) {
		this._languageDetector = value;
	}
	get lineResolver() {
		return this._lineResolver;
	}
	set lineResolver(value) {
		this._lineResolver = value;
	}
	get serverCharacteristicsProvider() {
		return this._serverCharacteristicsProvider;
	}
	set serverCharacteristicsProvider(value) {
		this._serverCharacteristicsProvider = value;
	}
	/**
	* Configure the container with custom implementations
	*/
	configure(config) {
		if (config.logger) this.logger = config.logger;
		if (config.errorHandler) this.errorHandler = config.errorHandler;
		if (config.fileSystem) this.fileSystem = config.fileSystem;
		if (config.languageDetector) this.languageDetector = config.languageDetector;
		if (config.lineResolver) this.lineResolver = config.lineResolver;
		if (config.serverCharacteristicsProvider) this.serverCharacteristicsProvider = config.serverCharacteristicsProvider;
	}
	/**
	* Reset to default implementations
	*/
	reset() {
		this._logger = new DefaultLogger();
		this._errorHandler = new DefaultErrorHandler();
		this._fileSystem = void 0;
		this._languageDetector = new DefaultLanguageDetector();
		this._lineResolver = new DefaultLineResolver();
		this._serverCharacteristicsProvider = new DefaultServerCharacteristicsProvider();
	}
};
const container = new DependencyContainer();

//#endregion
//#region packages/lsp-client/src/utils/container-helpers.ts
function formatError(error$2, context) {
	return container.errorHandler.formatError(error$2, context);
}
function resolveLineParameter(lines, line) {
	return container.lineResolver.resolveLineParameter(lines, line);
}

//#endregion
//#region packages/lsp-client/src/utils/documentManager.ts
/**
* Execute an operation with a temporarily opened LSP document
*
* This function handles the lifecycle of opening and closing a document
* in the LSP server, ensuring proper cleanup even if the operation fails.
*
* @param client - LSP client instance
* @param fileUri - File URI for the document
* @param content - Content of the document
* @param operation - Async operation to execute while document is open
* @param language - Optional language ID for the document
* @returns Result of the operation
*/
async function withTemporaryDocument(client, fileUri, content, operation, language) {
	if (!client) {
		const context = {
			operation: "LSP document operation",
			language
		};
		throw new Error(formatError(new Error("LSP client not initialized. Ensure the language server is started."), context));
	}
	client.openDocument(fileUri, content, language);
	try {
		await new Promise((resolve$1) => setTimeout(resolve$1, 500));
		return await operation();
	} finally {
		client.closeDocument(fileUri);
	}
}

//#endregion
//#region packages/lsp-client/src/utils/validation.ts
/**
* Common validation utilities for LSP tools
*/
function validateLineAndSymbol(content, line, symbolName, filePath) {
	const lines = content.split("\n");
	let lineIndex;
	if (typeof line === "number") lineIndex = line - 1;
	else {
		lineIndex = lines.findIndex((l) => l.includes(line));
		if (lineIndex === -1) throw new Error(`Line containing "${line}" not found in ${filePath}`);
	}
	const lineContent = lines[lineIndex];
	const symbolIndex = lineContent.indexOf(symbolName);
	if (symbolIndex === -1) throw new Error(`Symbol "${symbolName}" not found on line ${lineIndex + 1} in ${filePath}`);
	return {
		lineIndex,
		symbolIndex
	};
}

//#endregion
//#region packages/lsp-client/src/utils/fileContext.ts
/**
* Load a file and prepare its context for LSP operations
*
* @param root - Root directory for resolving relative paths
* @param filePath - File path (can be relative or absolute)
* @param fs - FileSystem API instance
* @returns File context with absolute path, URI, and content
*/
async function loadFileContext(root, filePath, fs$1) {
	const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
	if (!await fs$1.exists(absolutePath)) {
		const context = {
			operation: "file access",
			filePath: path.relative(root, absolutePath)
		};
		throw new Error(formatError(new Error("File not found"), context));
	}
	const fileUri = pathToFileURL(absolutePath).toString();
	try {
		const content = await fs$1.readFile(absolutePath);
		return {
			absolutePath,
			fileUri,
			content
		};
	} catch (error$2) {
		const context = {
			operation: "file read",
			filePath: path.relative(root, absolutePath)
		};
		throw new Error(formatError(error$2, context));
	}
}

//#endregion
//#region packages/lsp-client/src/client/lspOperations.ts
/**
* Executes an LSP operation with proper document lifecycle management
*
* @example
* ```typescript
* const hover = await withLSPOperation({
*   client: myLspClient,
*   fileUri: "file:///path/to/file.ts",
*   fileContent: content,
*   operation: (client) => client.getHover(fileUri, position),
*   errorContext: { filePath: "file.ts", operation: "hover" }
* });
* ```
*/
async function withLSPOperation(options) {
	const { client } = options;
	if (!client) throw new Error(`LSP client not provided for language: ${options.errorContext?.language || "unknown"}`);
	const defaultCharacteristics = {
		documentOpenDelay: 100,
		operationTimeout: 5e3
	};
	const characteristics = options.serverCharacteristics || defaultCharacteristics;
	const { fileUri, fileContent, languageId, waitTime = characteristics.documentOpenDelay, timeout = characteristics.operationTimeout, operation, errorContext: _errorContext = {} } = options;
	const actualLanguageId = languageId || client.languageId || "plaintext";
	client.openDocument(fileUri, fileContent, actualLanguageId);
	if (waitTime > 0) await new Promise((resolve$1) => setTimeout(resolve$1, waitTime));
	const operationPromise = operation(client);
	const timeoutPromise = new Promise((_, reject) => {
		setTimeout(() => {
			reject(new Error(`LSP operation timed out after ${timeout}ms`));
		}, timeout);
	});
	return Promise.race([operationPromise, timeoutPromise]);
}

//#endregion
//#region packages/lsp-client/src/utils/logger.ts
/**
* Create a new debug logger state
*/
function createDebugLogger(options) {
	const state = {
		logLevel: options?.logLevel ?? LogLevel.INFO,
		logFile: options?.logFile,
		sessions: /* @__PURE__ */ new Map(),
		currentSession: void 0,
		enableFileLogging: options?.enableFileLogging ?? false,
		enableConsoleLogging: options?.enableConsoleLogging ?? true
	};
	if (options?.logFile) {
		state.enableFileLogging = true;
		ensureLogDirectoryExists(options.logFile);
	}
	return state;
}
/**
* Log a message
*/
function log(state, level, component, message, data, error$2) {
	if (level > state.logLevel) return;
	const entry = {
		timestamp: (/* @__PURE__ */ new Date()).toISOString(),
		level,
		component,
		message,
		data,
		error: error$2
	};
	if (state.currentSession) {
		const session = state.sessions.get(state.currentSession);
		if (session) session.logEntries.push(entry);
	}
	if (state.enableConsoleLogging) logToConsole(entry, state.logLevel);
	if (state.enableFileLogging && state.logFile) logToFile(entry, state.logFile, state.logLevel);
}
function logToConsole(entry, logLevel) {
	const levelName = LogLevel[entry.level].padEnd(5);
	const timestamp = entry.timestamp.split("T")[1].split(".")[0];
	const message = `[${timestamp}] ${levelName} ${entry.component}: ${entry.message}`;
	switch (entry.level) {
		case LogLevel.ERROR:
			errorLog(message);
			if (entry.error) errorLog(entry.error);
			break;
		case LogLevel.WARN:
			console.warn(message);
			break;
		case LogLevel.INFO:
			console.info(message);
			break;
		case LogLevel.DEBUG:
		case LogLevel.TRACE:
			debugLog(message);
			break;
	}
	if (entry.data && logLevel >= LogLevel.DEBUG) console.log("  Data:", entry.data);
}
function logToFile(entry, logFile, logLevel) {
	const levelName = LogLevel[entry.level].padEnd(5);
	const line = `[${entry.timestamp}] ${levelName} ${entry.component}: ${entry.message}\n`;
	try {
		appendFileSync(logFile, line);
		if (entry.data && logLevel >= LogLevel.DEBUG) appendFileSync(logFile, `  Data: ${JSON.stringify(entry.data)}\n`);
		if (entry.error) {
			appendFileSync(logFile, `  Error: ${entry.error.message}\n`);
			if (entry.error.stack) appendFileSync(logFile, `  Stack: ${entry.error.stack}\n`);
		}
	} catch (error$2) {
		errorLog("Failed to write to log file:", error$2);
	}
}
function ensureLogDirectoryExists(logFile) {
	const dir = join(logFile, "..");
	if (!existsSync$1(dir)) mkdirSync$1(dir, { recursive: true });
}
const debugLogger = createDebugLogger({
	logLevel: process.env.LSP_LOG_LEVEL ? parseInt(process.env.LSP_LOG_LEVEL) : LogLevel.INFO,
	enableConsoleLogging: true,
	enableFileLogging: false
});
const defaultLog = (level, component, message, data, error$2) => log(debugLogger, level, component, message, data, error$2);

//#endregion
//#region packages/lsp-client/src/diagnostics/utils.ts
/**
* Wait for diagnostics with language-specific retry logic
* Unified implementation for both test and production use
*/
async function waitForDiagnosticsWithRetry(client, fileUri, fileContent, languageId, options = {}) {
	const { timeout = 5e3, pollInterval = 50, forceRefresh = false, languageSpecific = {} } = options;
	if (forceRefresh && client.isDocumentOpen(fileUri)) {
		client.closeDocument(fileUri);
		await new Promise((resolve$1) => setTimeout(resolve$1, 100));
	}
	if (!client.isDocumentOpen(fileUri)) client.openDocument(fileUri, fileContent, languageId);
	else client.updateDocument(fileUri, fileContent, 2);
	const langSettings = getLanguageSettings(client.languageId, languageSpecific);
	const effectiveTimeout = langSettings.timeout || timeout;
	const initialWait = options.initialWait || langSettings.initialWait || 0;
	const maxPolls = options.maxPolls || langSettings.maxPolls || Math.floor(effectiveTimeout / pollInterval);
	if (initialWait > 0) await new Promise((resolve$1) => setTimeout(resolve$1, initialWait));
	let diagnostics = [];
	if (client.waitForDiagnostics) try {
		const eventTimeout = Math.min(effectiveTimeout * .6, 3e3);
		diagnostics = await client.waitForDiagnostics(fileUri, eventTimeout);
		if (client.languageId === "deno" && diagnostics.length === 0) {
			await new Promise((resolve$1) => setTimeout(resolve$1, 500));
			const currentDiagnostics = client.getDiagnostics(fileUri) || [];
			if (currentDiagnostics.length > 0) diagnostics = currentDiagnostics;
		}
	} catch {}
	if (diagnostics.length === 0 && client.pullDiagnostics) try {
		await new Promise((resolve$1) => setTimeout(resolve$1, 200));
		diagnostics = await client.pullDiagnostics(fileUri);
	} catch {}
	if (diagnostics.length === 0) for (let poll = 0; poll < maxPolls; poll++) {
		await new Promise((resolve$1) => setTimeout(resolve$1, pollInterval));
		diagnostics = client.getDiagnostics(fileUri) || [];
		if (diagnostics.length > 0) break;
		if (poll > 0 && poll % 3 === 0) client.updateDocument(fileUri, fileContent, poll + 2);
	}
	return diagnostics;
}
/**
* Get language-specific settings for diagnostics
*/
function getLanguageSettings(languageId, languageSpecific = {}) {
	const defaults = {
		initialWait: 200,
		maxPolls: 60,
		timeout: 3e3
	};
	if (languageId === "moonbit" && languageSpecific.moonbit) return languageSpecific.moonbit;
	if (languageId === "deno" && languageSpecific.deno) return languageSpecific.deno;
	return languageSpecific.default || defaults;
}

//#endregion
//#region packages/lsp-client/src/utils/lineResolver.ts
/**
* Resolve a line parameter to a line index, throwing on error
*
* @param content - File content
* @param line - Line number (1-based) or string to search for
* @param filePath - File path for error context
* @returns Zero-based line index
* @throws Error if line cannot be resolved
*/
function resolveLineIndexOrThrow(content, line, filePath) {
	const lines = content.split("\n");
	try {
		const lineIndex = resolveLineParameter(lines, line);
		return lineIndex;
	} catch (error$2) {
		const context = {
			operation: "line resolution",
			filePath,
			details: {
				line,
				error: error$2 instanceof Error ? error$2.message : String(error$2)
			}
		};
		throw new Error(formatError(new Error(`Failed to resolve line: ${error$2 instanceof Error ? error$2.message : String(error$2)}`), context));
	}
}

//#endregion
//#region packages/lsp-client/src/index.ts
var import_main = __toESM(require_main(), 1);

//#endregion
export { CapabilityChecker, CodeActionKind$1 as CodeActionKind, CompletionItemKind$1 as CompletionItemKind, DiagnosticResultBuilder, ErrorCode, LSMCPError, LogLevel, SYMBOL_CACHE_SCHEMA_VERSION, SYMBOL_KIND_NAMES, SymbolKind$1 as SymbolKind, commonSchemas, createAdvancedCompletionHandler, createAndInitializeLSPClient, createLSPClient, createLSPSymbolProvider, createToolCapabilityMap, debug, debug$1, defaultLog, fileLocationSchema, formatError, formatError$1, getLanguageIdFromPath, getSymbolKindName, loadFileContext, parseSymbolKind, resolveLineIndexOrThrow, resolveLineParameter, validateLineAndSymbol, waitForDiagnosticsWithRetry, withLSPOperation, withTemporaryDocument };