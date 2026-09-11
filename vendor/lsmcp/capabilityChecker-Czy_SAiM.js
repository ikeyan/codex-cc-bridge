import { debugLogWithPrefix } from "./debugLog-LfbHS9a2.js";
import { spawn } from "child_process";

//#region src/utils/capabilityChecker.ts
/**
* Get LSP capabilities for a given preset configuration
*/
async function getCapabilitiesForPreset(config) {
	if (!config.bin) return null;
	try {
		return await getCapabilitiesFromLSP(config.bin, config.args || []);
	} catch (error) {
		debugLogWithPrefix("capabilityChecker", `Failed to get capabilities: ${error}`);
		return null;
	}
}
/**
* Start LSP server briefly to get its capabilities
*/
async function getCapabilitiesFromLSP(bin, args) {
	return new Promise((resolve) => {
		let capabilities = null;
		let timeout;
		try {
			const lsp = spawn(bin, args, { stdio: [
				"pipe",
				"pipe",
				"pipe"
			] });
			timeout = setTimeout(() => {
				lsp.kill();
				resolve(null);
			}, 3e3);
			let buffer = "";
			lsp.stdout.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				for (const line of lines) if (line.includes("Content-Length:")) {
					const match = line.match(/Content-Length: (\d+)/);
					if (match) {
						const length = parseInt(match[1]);
						const messageStart = buffer.indexOf("\r\n\r\n");
						if (messageStart !== -1) {
							const message$1 = buffer.substring(messageStart + 4, messageStart + 4 + length);
							try {
								const json = JSON.parse(message$1);
								if (json.result?.capabilities) {
									capabilities = json.result.capabilities;
									clearTimeout(timeout);
									lsp.kill();
									resolve(capabilities);
									return;
								}
							} catch {}
						}
					}
				}
			});
			const initRequest = {
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					processId: process.pid,
					rootPath: process.cwd(),
					rootUri: `file://${process.cwd()}`,
					capabilities: {},
					trace: "off"
				}
			};
			const message = JSON.stringify(initRequest);
			const header = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n`;
			lsp.stdin.write(header + message);
			lsp.on("error", () => {
				clearTimeout(timeout);
				resolve(null);
			});
			lsp.on("exit", () => {
				clearTimeout(timeout);
				resolve(capabilities);
			});
		} catch (error) {
			debugLogWithPrefix("capabilityChecker", `Error: ${error}`);
			resolve(null);
		}
	});
}

//#endregion
export { getCapabilitiesForPreset };