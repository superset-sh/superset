import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: source-level regression test
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: source-level regression test
import { join } from "node:path";

const SOURCE = readFileSync(join(__dirname, "PromptGroup.tsx"), "utf-8");

describe("PromptGroup project preparation", () => {
	test("allows workspace creation to prepare a missing local project", () => {
		expect(SOURCE).toContain("allowProjectPreparation");
		expect(SOURCE).not.toContain("disabled={needsSetup}");
		expect(SOURCE).not.toContain("if (needsSetup)");
		expect(SOURCE).not.toContain("Set up project…");
	});
});
