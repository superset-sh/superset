import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const MASRTA_CORE_VERSION = "1.8.0-superset.2";
const requireFromCwd = createRequire(join(process.cwd(), "package.json"));

function main(): void {
	const packageJsonPath = requireFromCwd.resolve("mastracode/package.json");
	const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
		dependencies?: Record<string, string>;
		name?: string;
		version?: string;
	};

	if (packageJson.dependencies?.["@mastra/core"] === MASRTA_CORE_VERSION) {
		return;
	}

	if (!packageJson.dependencies || packageJson.name !== "mastracode") {
		throw new Error(
			`Unexpected mastracode package metadata at ${packageJsonPath}`,
		);
	}

	packageJson.dependencies["@mastra/core"] = MASRTA_CORE_VERSION;
	writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

main();
