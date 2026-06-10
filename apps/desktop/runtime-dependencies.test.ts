import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import packageJson from "./package.json";
import {
	packagedAsarUnpackGlobs,
	packagedNodeModuleCopies,
	requiredMaterializedNodeModules,
} from "./runtime-dependencies";

describe("Trellis bundled runtime packaging", () => {
	const trellisRuntimeModules = [
		"@mindfoldhq/trellis",
		"@mindfoldhq/trellis-core",
		"ora",
		"chalk",
		"ansi-styles",
		"color-convert",
		"color-name",
		"supports-color",
		"has-flag",
	];

	test("materializes and unpacks Trellis transitive CLI runtime modules", () => {
		for (const moduleName of trellisRuntimeModules) {
			expect(requiredMaterializedNodeModules).toContain(moduleName);
			expect(packagedNodeModuleCopies).toContainEqual(
				expect.objectContaining({
					from: `node_modules/${moduleName}`,
					to: `node_modules/${moduleName}`,
				}),
			);
			expect(packagedAsarUnpackGlobs).toContain(
				`**/node_modules/${moduleName}/**/*`,
			);
		}
	});

	test("exposes a Trellis runtime smoke command for release gates", () => {
		expect(packageJson.scripts).toHaveProperty("validate:trellis-runtime");

		const workflow = readFileSync(
			join(
				import.meta.dirname,
				"..",
				"..",
				".github",
				"workflows",
				"build-desktop.yml",
			),
			"utf8",
		);
		expect(workflow).toContain("Verify bundled Trellis runtime");
		expect(workflow).toContain("bun run validate:trellis-runtime");
	});
});
