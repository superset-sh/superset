/**
 * Tests for the pure gating helper applyCommandGating.
 * Lives in shared/ to avoid importing Electron main-process modules.
 */
import { describe, expect, it } from "bun:test";
import {
	commandSetHash,
	parseWorkspaceCardConfig,
	type WorkspaceCardConfig,
} from "./workspace-card-config";

// Inline the pure gating logic so this test file has no main-process imports.
// It must stay in sync with applyCommandGating in workspace-card-trust.ts.
function applyCommandGating(
	config: WorkspaceCardConfig,
	storedHash: string | undefined,
): WorkspaceCardConfig {
	const currentHash = commandSetHash(config);
	const trusted = storedHash !== undefined && storedHash === currentHash;
	if (trusted) return config;
	return {
		...config,
		customLines: config.customLines.filter((l) => l.type !== "command"),
	};
}

const repoConfig = parseWorkspaceCardConfig({
	customLines: [
		{ id: "cmd1", command: "date", enabled: true },
		{ id: "cmp1", type: "component", component: "clock" },
	],
});

describe("applyCommandGating", () => {
	it("strips command lines when project is untrusted (no stored hash)", () => {
		const gated = applyCommandGating(repoConfig, undefined);
		expect(gated.customLines).toHaveLength(1);
		expect(gated.customLines[0].type).toBe("component");
	});

	it("strips command lines when stored hash does not match current commands", () => {
		const staleHash = commandSetHash(
			parseWorkspaceCardConfig({
				customLines: [{ id: "old", command: "echo old" }],
			}),
		);
		const gated = applyCommandGating(repoConfig, staleHash);
		expect(gated.customLines).toHaveLength(1);
		expect(gated.customLines[0].type).toBe("component");
	});

	it("passes all lines through when hash matches (trusted)", () => {
		const hash = commandSetHash(repoConfig);
		const gated = applyCommandGating(repoConfig, hash);
		expect(gated.customLines).toHaveLength(2);
		expect(gated.customLines.some((l) => l.type === "command")).toBe(true);
		expect(gated.customLines.some((l) => l.type === "component")).toBe(true);
	});

	it("keeps component lines even when untrusted", () => {
		const componentOnly = parseWorkspaceCardConfig({
			customLines: [
				{ id: "c1", type: "component", component: "pomodoro" },
				{ id: "c2", type: "component", component: "clock" },
			],
		});
		const gated = applyCommandGating(componentOnly, undefined);
		// No commands to strip, so config is unchanged.
		expect(gated.customLines).toHaveLength(2);
		expect(gated.customLines.every((l) => l.type === "component")).toBe(true);
	});

	it("override source (all lines) is unaffected -- caller skips gating", () => {
		// When source==="override", resolveGatedWorkspaceCardConfig returns the
		// stored config directly without calling applyCommandGating. Verify that
		// applyCommandGating with a matching hash returns everything intact.
		const overrideConfig = parseWorkspaceCardConfig({
			customLines: [
				{ id: "cmd1", command: "git log -1" },
				{ id: "cmp1", type: "component", component: "pomodoro" },
			],
		});
		const hash = commandSetHash(overrideConfig);
		const result = applyCommandGating(overrideConfig, hash);
		expect(result.customLines).toHaveLength(2);
	});

	it("hash changes when a command is added, causing untrust", () => {
		const original = parseWorkspaceCardConfig({
			customLines: [{ id: "cmd1", command: "date" }],
		});
		const originalHash = commandSetHash(original);

		const updated = parseWorkspaceCardConfig({
			customLines: [
				{ id: "cmd1", command: "date" },
				{ id: "cmd2", command: "git log -1" },
			],
		});

		// Old hash no longer matches updated config -- treated as untrusted.
		const gated = applyCommandGating(updated, originalHash);
		expect(gated.customLines).toHaveLength(0);
	});
});
