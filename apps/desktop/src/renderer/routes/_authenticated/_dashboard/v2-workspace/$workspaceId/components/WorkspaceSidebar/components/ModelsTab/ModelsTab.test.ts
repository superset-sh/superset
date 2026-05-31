import { describe, expect, it } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: source regression test reads the local component file
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: source regression test reads the local component file
import { join } from "node:path";

describe("ModelsTab", () => {
	const source = readFileSync(join(import.meta.dir, "ModelsTab.tsx"), "utf8");

	it("uses the shared model search catalog for Claude Code model slots", () => {
		expect(source).toContain("filterModelGroupsBySearch");
		expect(source).toContain("groupModelsByModelFamily");
		expect(source).toContain("<CommandInput");
	});

	it("does not render the removed model status summary cards", () => {
		expect(source).not.toContain("Agent Models");
		expect(source).not.toContain("Claude Code model aliases");
		expect(source).not.toContain("gatewayStatus");
		expect(source).not.toContain("Credential saved");
	});
});
