import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: regression test inspects the component source
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: regression test resolves the colocated source
import { join } from "node:path";

describe("WorkspaceAgentTraitsPicker", () => {
	const source = readFileSync(
		join(import.meta.dir, "WorkspaceAgentTraitsPicker.tsx"),
		"utf8",
	);

	test("uses actual defaults without a synthetic Default option", () => {
		expect(source).toContain("defaultEffortId");
		expect(source).not.toContain(">Default<");
		expect(source).not.toContain('{ id: null, label: "Default" }');
	});

	test("keeps all launch traits in one compact menu", () => {
		expect(source).toContain("speedSupport.speeds.map");
		expect(source).toContain("modeSupport.modes.map");
		expect(source).toContain("contextWindowSupport.contextWindows.map");
		expect(source).toContain("w-44");
	});
});
