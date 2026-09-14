import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { lstat, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";

//#region src/infrastructure/NodeFileSystemApi.ts
var NodeFileSystemApi = class {
	async readFile(path) {
		return await readFile(path, "utf-8");
	}
	async writeFile(path, data, encoding) {
		const { dirname } = await import("node:path");
		const dir = dirname(path);
		await mkdir(dir, { recursive: true }).catch(() => {});
		await writeFile(path, data, encoding);
	}
	async readdir(path, options) {
		if (options?.withFileTypes) return await readdir(path, { withFileTypes: true });
		return await readdir(path);
	}
	async stat(path) {
		return await stat(path);
	}
	async lstat(path) {
		return await lstat(path);
	}
	async exists(path) {
		return existsSync(path);
	}
	async mkdir(path, options) {
		return await mkdir(path, options);
	}
	async rm(path, options) {
		await rm(path, options);
	}
	async realpath(path) {
		return await realpath(path);
	}
	async cwd() {
		return process.cwd();
	}
	async resolve(...paths) {
		return resolve(...paths);
	}
	async isDirectory(path) {
		try {
			const stats = await stat(path);
			return stats.isDirectory();
		} catch {
			return false;
		}
	}
	async listDirectory(path) {
		return await readdir(path);
	}
};
const nodeFileSystemApi = new NodeFileSystemApi();

//#endregion
export { NodeFileSystemApi, nodeFileSystemApi };