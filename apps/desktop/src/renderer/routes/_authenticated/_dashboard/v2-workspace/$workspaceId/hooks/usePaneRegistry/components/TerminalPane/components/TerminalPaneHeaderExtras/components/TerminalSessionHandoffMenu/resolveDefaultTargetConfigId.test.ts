import { describe, expect, test } from "bun:test";
import { resolveDefaultTargetConfigId } from "./resolveDefaultTargetConfigId";

describe("resolveDefaultTargetConfigId", () => {
	test("uses the create-workspace agent preference when it is available", () => {
		expect(
			resolveDefaultTargetConfigId(
				["claude-config", "codex-config"],
				"claude-config",
				"claude-config",
			),
		).toBe("claude-config");
	});

	test("falls back to another agent when the preference is unavailable", () => {
		expect(
			resolveDefaultTargetConfigId(
				["claude-config", "codex-config"],
				"remote-host-config",
				"claude-config",
			),
		).toBe("codex-config");
	});

	test("falls back to the source agent when it is the only option", () => {
		expect(
			resolveDefaultTargetConfigId(["claude-config"], null, "claude-config"),
		).toBe("claude-config");
	});
});
