import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoBun = readFileSync(
	join(import.meta.dir, "../../.bun-version"),
	"utf8",
).trim();
const workflowsDir = join(import.meta.dir, ".eas/workflows");
const INSTALLS_DEPENDENCIES =
	/type: (build|fingerprint|update)\b|eas\/install_node_modules/;

// The runtime version is a fingerprint that includes bun's store paths, and
// those differ between bun versions. A builder on another bun rejects builds
// submitted from this repo, and its updates target a runtime no build has.
describe("EAS uses the repository's bun", () => {
	test("every build profile pins it", () => {
		const { build } = JSON.parse(
			readFileSync(join(import.meta.dir, "eas.json"), "utf8"),
		) as { build: Record<string, { bun?: string }> };

		for (const [profile, config] of Object.entries(build)) {
			expect(config.bun, profile).toBe(repoBun);
		}
	});

	test("every workflow that installs dependencies pins it", () => {
		for (const file of readdirSync(workflowsDir)) {
			const workflow = readFileSync(join(workflowsDir, file), "utf8");
			if (!INSTALLS_DEPENDENCIES.test(workflow)) continue;
			expect(workflow, file).toMatch(
				new RegExp(`\\ndefaults:\\n  tools:\\n    bun: ${repoBun}\\n`),
			);
		}
	});
});
