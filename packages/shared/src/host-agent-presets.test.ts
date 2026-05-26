import { describe, expect, it } from "bun:test";
import { getDefaultSeedPresets } from "./host-agent-presets";

describe("getDefaultSeedPresets", () => {
	it("includes OpenCode in the default seed presets", () => {
		const ids = getDefaultSeedPresets().map((preset) => preset.presetId);
		expect(ids).toContain("opencode");
	});

	it("includes the other first-class default agents", () => {
		const ids = getDefaultSeedPresets().map((preset) => preset.presetId);
		expect(ids).toEqual(
			expect.arrayContaining(["claude", "codex", "gemini", "copilot"]),
		);
	});
});
