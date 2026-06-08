import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: source-level regression test
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: source-level regression test
import { join } from "node:path";

const SOURCE = readFileSync(join(__dirname, "TrellisSetupRow.tsx"), "utf-8");

describe("TrellisSetupRow user-facing copy", () => {
	test("uses product language instead of exposing Trellis as a concept", () => {
		expect(SOURCE).toContain("Use guided workflow");
		expect(SOURCE).toContain("Guided workflow ready");
		expect(SOURCE).not.toContain("Initialize Trellis");
		expect(SOURCE).not.toContain("Trellis ready");
	});
});
