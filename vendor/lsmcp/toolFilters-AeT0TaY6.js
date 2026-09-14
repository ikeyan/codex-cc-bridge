//#region src/utils/toolFilters.ts
/**
* Filter out tools that are in the unsupported/disabled list
*/
function filterUnsupportedTools(tools, unsupportedList) {
	if (!unsupportedList || unsupportedList.length === 0) return tools;
	return tools.filter((tool) => !unsupportedList.includes(tool.name));
}
/**
* Filter tools based on LSP server capabilities
*/
function filterToolsByCapabilities(tools, capabilities) {
	return tools.filter((tool) => {
		const name = tool.name;
		if (name === "get_hover" && !capabilities.hoverProvider) return false;
		if (name === "find_references" && !capabilities.referencesProvider) return false;
		if (name === "get_definitions" && !capabilities.definitionProvider) return false;
		if (name === "get_diagnostics" && !capabilities.diagnosticProvider) return false;
		if (name === "rename_symbol" && !capabilities.renameProvider) return false;
		if (name === "get_document_symbols" && !capabilities.documentSymbolProvider) return false;
		if (name === "get_workspace_symbols" && !capabilities.workspaceSymbolProvider) return false;
		if (name === "get_completion" && !capabilities.completionProvider) return false;
		if (name === "get_signature_help" && !capabilities.signatureHelpProvider) return false;
		if (name === "format_document" && !capabilities.documentFormattingProvider) return false;
		if (name === "get_code_actions" && !capabilities.codeActionProvider) return false;
		return true;
	});
}

//#endregion
export { filterToolsByCapabilities, filterUnsupportedTools };