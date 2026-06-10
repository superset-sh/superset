import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import packageJson from "./package.json";
import {
	packagedAsarUnpackGlobs,
	packagedNodeModuleCopies,
	packagedTrellisRuntimeResourceCopies,
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

	test("materializes Trellis CLI runtime modules as real resource files", () => {
		for (const moduleName of trellisRuntimeModules) {
			expect(requiredMaterializedNodeModules).toContain(moduleName);
			expect(packagedTrellisRuntimeResourceCopies).toContainEqual(
				expect.objectContaining({
					from: `node_modules/${moduleName}`,
					to: `node_modules/${moduleName}`,
				}),
			);
			expect(packagedNodeModuleCopies).not.toContainEqual(
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

	test("keeps CJS-only Trellis compatibility dependencies nested", () => {
		expect(requiredMaterializedNodeModules).not.toContain("mimic-fn");
		expect(packagedTrellisRuntimeResourceCopies).toContainEqual(
			expect.objectContaining({
				from: "node_modules/onetime/node_modules/mimic-fn",
				to: "node_modules/onetime/node_modules/mimic-fn",
			}),
		);
		expect(packagedTrellisRuntimeResourceCopies).toContainEqual(
			expect.objectContaining({
				from: "node_modules/restore-cursor/node_modules/signal-exit",
				to: "node_modules/restore-cursor/node_modules/signal-exit",
			}),
		);
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
