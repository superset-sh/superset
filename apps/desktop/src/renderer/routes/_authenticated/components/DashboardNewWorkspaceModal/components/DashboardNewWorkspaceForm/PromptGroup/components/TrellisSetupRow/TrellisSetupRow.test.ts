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
		expect(SOURCE).toContain("Prepare project on this device");
		expect(SOURCE).toContain("Checking selected device");
		expect(SOURCE).not.toContain("Initialize Trellis");
		expect(SOURCE).not.toContain("Trellis ready");
		expect(SOURCE).not.toContain("Set up project on this device");
	});

	test("can defer workflow probing when project preparation is part of the run", () => {
		expect(SOURCE).toContain('projectSetupState !== "checking"');
		expect(SOURCE).toContain('projectSetupState !== "not-setup"');
		expect(SOURCE).toContain("allowProjectPreparation");
		expect(SOURCE).toContain("canPrepareProject");
		expect(SOURCE).toContain("project-not-setup");
		expect(SOURCE).toContain("project-checking");
	});
});
