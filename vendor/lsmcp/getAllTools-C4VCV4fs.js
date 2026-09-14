import "./src-MZR2qMTi.js";
import { createLSPTools, highLevelTools, onboardingToolsList, serenityToolsList } from "./toolLists-DuccsujO.js";
import "./debugLog-LfbHS9a2.js";
import "./configLoader-CZlYj_hr.js";
import "./NodeFileSystemApi-CcTrKwya.js";

//#region src/tools/getAllTools.ts
/**
* Get all available tools for the current configuration
*/
async function getAllAvailableTools(_config, client) {
	const tools = [];
	tools.push(...highLevelTools);
	const lspClient = client || {};
	const lspTools = createLSPTools(lspClient);
	tools.push(...lspTools);
	tools.push(...serenityToolsList);
	tools.push(...onboardingToolsList);
	return tools;
}

//#endregion
export { getAllAvailableTools };