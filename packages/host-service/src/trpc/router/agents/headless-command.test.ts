import { describe, expect, test } from "bun:test";
import { buildHeadlessAgentCommand } from "./headless-command";

describe("buildHeadlessAgentCommand", () => {
	test("splices model args right after the binary", () => {
		expect(buildHeadlessAgentCommand("claude", "claude -p", "haiku")).toBe(
			"claude '--model' 'haiku' -p",
		);
	});

	test("unknown or unlisted models degrade to the CLI default", () => {
		expect(
			buildHeadlessAgentCommand("claude", "claude -p", "not-a-model"),
		).toBe("claude -p");
		expect(buildHeadlessAgentCommand("claude", "claude -p", undefined)).toBe(
			"claude -p",
		);
	});

	test("env-selected models ride an overlay prefix", () => {
		expect(
			buildHeadlessAgentCommand("vibe", "vibe --trust -p", "devstral-small"),
		).toBe("VIBE_ACTIVE_MODEL='devstral-small' vibe --trust -p");
	});
});
