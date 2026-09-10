//#region src/utils/mcp-logger.ts
/**
* MCP Server Logger - Independent logging system for MCP server
*
* This logger is separate from the LSP logger and can be controlled independently.
* Use MCP_DEBUG=1 or LSMCP_DEBUG=1 environment variable to enable MCP server debug logging.
*
* IMPORTANT: For MCP servers, all debug output must go to stderr (console.error)
* since stdout is used for MCP protocol communication.
*/
/**
* Check if MCP debug logging is enabled
*/
function isMcpDebugEnabled() {
	return process.env.MCP_DEBUG === "1" || process.env.MCP_DEBUG === "true" || process.env.LSMCP_DEBUG === "1" || process.env.LSMCP_DEBUG === "true";
}
/**
* MCP server debug logging function
*
* @param args Arguments to log (same as console.error)
*
* @example
* mcpDebug("Processing MCP request:", requestType);
* mcpDebug("[MCPServer] Handling tool call");
*/
function mcpDebug(...args) {
	if (isMcpDebugEnabled()) console.error("[MCP]", ...args);
}
/**
* MCP server debug logging with custom prefix
*
* @param prefix Component prefix (e.g., "Server", "Tool", "Protocol")
* @param args Arguments to log
*
* @example
* mcpDebugWithPrefix("Tool", "Executing:", toolName);
* mcpDebugWithPrefix("Protocol", "Received request:", data);
*/
function mcpDebugWithPrefix(prefix, ...args) {
	if (isMcpDebugEnabled()) console.error(`[MCP:${prefix}]`, ...args);
}
/**
* MCP server error logging - always shows errors regardless of debug setting
*
* @param args Arguments to log
*
* @example
* mcpError("Failed to execute tool:", error.message);
*/
function mcpError(...args) {
	console.error("[MCP:ERROR]", ...args);
}

//#endregion
//#region src/utils/debugLog.ts
/**
* Debug logging function that respects LSMCP_DEBUG environment variable
*
* @param args Arguments to log (same as console.error)
*
* @example
* debugLog("Processing file:", filename);
* debugLog("[SymbolIndex] Indexed files:", count);
*/
function debugLog(...args) {
	mcpDebug(...args);
}
/**
* Debug logging function with prefix for specific components
*
* @param prefix Component prefix (e.g., "SymbolIndex", "LSP", "MCP")
* @param args Arguments to log
*
* @example
* debugLogWithPrefix("SymbolIndex", "Indexed files:", count);
* debugLogWithPrefix("LSP", "Server started for", language);
*/
function debugLogWithPrefix(prefix, ...args) {
	mcpDebugWithPrefix(prefix, ...args);
}
/**
* Error logging function that always shows errors (ignores LSMCP_DEBUG)
* Use this for critical errors that should always be visible
*
* @param args Arguments to log
*
* @example
* errorLog("Failed to start LSP server:", error.message);
* errorLog("Critical configuration error:", errorDetails);
*/
function errorLog(...args) {
	mcpError(...args);
}

//#endregion
export { debugLog, debugLogWithPrefix, errorLog, mcpDebugWithPrefix };