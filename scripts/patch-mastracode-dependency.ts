import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const requireFromCwd = createRequire(join(process.cwd(), "package.json"));

type PackageJson = {
	dependencies?: Record<string, string>;
	name?: string;
	version?: string;
};

function resolvePackageJsonPath(specifier: string): string | null {
	try {
		return requireFromCwd.resolve(`${specifier}/package.json`);
	} catch {
		return null;
	}
}

function patchDependencyVersion(
	packageName: string,
	dependencyName: string,
): void {
	const packageJsonPath = resolvePackageJsonPath(packageName);
	const dependencyJsonPath = resolvePackageJsonPath(dependencyName);

	if (!packageJsonPath || !dependencyJsonPath) {
		return;
	}

	const packageJson = JSON.parse(
		readFileSync(packageJsonPath, "utf8"),
	) as PackageJson;
	if (!packageJson.dependencies || packageJson.name !== packageName) {
		throw new Error(`Unexpected package metadata at ${packageJsonPath}`);
	}

	const dependencyJson = JSON.parse(
		readFileSync(dependencyJsonPath, "utf8"),
	) as PackageJson;
	if (!dependencyJson.version) {
		throw new Error(
			`Missing version in dependency metadata at ${dependencyJsonPath}`,
		);
	}

	if (packageJson.dependencies[dependencyName] === dependencyJson.version) {
		return;
	}

	packageJson.dependencies[dependencyName] = dependencyJson.version;
	writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

patchDependencyVersion("mastracode", "@mastra/core");
patchDependencyVersion("libsql", "detect-libc");
