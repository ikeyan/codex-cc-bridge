import { existsSync, readFileSync } from "fs";
import { join } from "path";

//#region src/utils/packageVersion.ts
/**
* Major version implied by a semver string or range
* ("7.0.2", "^7", "~7.1", ">=7.0.0", "=7", "v7"). For "a || b" ranges the
* first alternative wins. Returns undefined for anything that does not
* start with a version number ("*", "latest", "<7", "workspace:*").
*/
function majorOf(range) {
	if (typeof range !== "string") return void 0;
	const match = /^\s*(?:[\^~=]|>=?)?\s*v?(\d+)/.exec(range);
	return match ? Number(match[1]) : void 0;
}
/**
* Major version of the package installed under `nodeModulesDir`, or undefined
* when it is not installed or its package.json cannot be read.
*/
function installedPackageMajor(nodeModulesDir, packageName) {
	const packageJsonPath = join(nodeModulesDir, packageName, "package.json");
	if (!existsSync(packageJsonPath)) return void 0;
	try {
		const { version } = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
		return majorOf(version);
	} catch {
		return void 0;
	}
}
/**
* Major version of a dependency of the project: the installed copy wins,
* falling back to the range declared in package.json.
*/
function dependencyMajor(projectRoot, packageJson, packageName) {
	return installedPackageMajor(join(projectRoot, "node_modules"), packageName) ?? majorOf(packageJson.devDependencies?.[packageName] ?? packageJson.dependencies?.[packageName]);
}

//#endregion
export { dependencyMajor, installedPackageMajor };