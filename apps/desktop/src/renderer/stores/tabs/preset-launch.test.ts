import { describe, expect, it } from "bun:test";
import { normalizeExecutionMode } from "@superset/local-db/schema/zod";
import {
	buildFocusedTerminalCommand,
	getPresetLaunchPlan,
	shouldApplyPresetPaneName,
} from "./preset-launch";

describe("normalizeExecutionMode", () => {
	it("returns new-tab for new-tab mode", () => {
		expect(normalizeExecutionMode("new-tab")).toBe("new-tab");
	});

	it("returns new-tab-split-pane for new-tab-split-pane mode", () => {
		expect(normalizeExecutionMode("new-tab-split-pane")).toBe(
			"new-tab-split-pane",
		);
	});

	it("keeps sequential, maps legacy parallel to split-pane, and defaults unknown modes to new-tab", () => {
		expect(normalizeExecutionMode("split-pane")).toBe("split-pane");
		expect(normalizeExecutionMode("parallel")).toBe("split-pane");
		expect(normalizeExecutionMode("sequential")).toBe("sequential");
		expect(normalizeExecutionMode(undefined)).toBe("new-tab");
		expect(normalizeExecutionMode("unknown")).toBe("new-tab");
	});
});

describe("shouldApplyPresetPaneName", () => {
	it("allows preset names for default terminal panes", () => {
		expect(
			shouldApplyPresetPaneName({
				currentName: "Terminal",
				presetName: "echo sequence",
			}),
		).toBe(true);
		expect(
			shouldApplyPresetPaneName({
				currentName: "",
				presetName: "desktop",
			}),
		).toBe(true);
	});

	it("preserves existing pane labels", () => {
		expect(
			shouldApplyPresetPaneName({
				currentName: "echo sequence",
				presetName: "desktop",
			}),
		).toBe(false);
		expect(
			shouldApplyPresetPaneName({
				currentName: "Terminal",
				presetName: "desktop",
				userTitle: "my shell",
			}),
		).toBe(false);
	});

	it("ignores blank preset names", () => {
		expect(
			shouldApplyPresetPaneName({
				currentName: "Terminal",
				presetName: "  ",
			}),
		).toBe(false);
	});
});

describe("buildFocusedTerminalCommand", () => {
	it("prepends an explicit cd when a current terminal launch has a cwd", () => {
		expect(
			buildFocusedTerminalCommand({
				commands: ["echo one", "echo two"],
				cwd: "apps/my app",
			}),
		).toBe("cd 'apps/my app' && echo one && echo two");
	});

	it("leaves commands unchanged when cwd is blank", () => {
		expect(
			buildFocusedTerminalCommand({
				commands: ["pwd"],
				cwd: "  ",
			}),
		).toBe("pwd");
	});

	it("returns null when no runnable command exists", () => {
		expect(
			buildFocusedTerminalCommand({
				commands: ["  "],
				cwd: "apps/desktop",
			}),
		).toBeNull();
	});
});

describe("getPresetLaunchPlan", () => {
	it("uses active tab split mode for active-tab target + split-pane + multiple commands", () => {
		expect(
			getPresetLaunchPlan({
				mode: "split-pane",
				target: "active-tab",
				commandCount: 2,
				hasActiveTab: true,
			}),
		).toBe("active-tab-multi-pane");
	});

	it("falls back to new-tab path when active tab is unavailable", () => {
		expect(
			getPresetLaunchPlan({
				mode: "split-pane",
				target: "active-tab",
				commandCount: 2,
				hasActiveTab: false,
			}),
		).toBe("new-tab-multi-pane");
	});

	it("uses new-tab path when mode is new-tab even if target is active-tab", () => {
		expect(
			getPresetLaunchPlan({
				mode: "new-tab",
				target: "active-tab",
				commandCount: 3,
				hasActiveTab: true,
			}),
		).toBe("new-tab-per-command");
	});

	it("uses new-tab multi-pane path when mode is new-tab-split-pane", () => {
		expect(
			getPresetLaunchPlan({
				mode: "new-tab-split-pane",
				target: "active-tab",
				commandCount: 3,
				hasActiveTab: true,
			}),
		).toBe("new-tab-multi-pane");
	});

	it("defaults new-tab target with split-pane mode to tab multi-pane for multiple commands", () => {
		expect(
			getPresetLaunchPlan({
				mode: "split-pane",
				target: "new-tab",
				commandCount: 2,
				hasActiveTab: true,
			}),
		).toBe("new-tab-multi-pane");
	});

	it("uses the active terminal for sequential commands", () => {
		expect(
			getPresetLaunchPlan({
				mode: "sequential",
				target: "active-tab",
				commandCount: 2,
				hasActiveTab: true,
				hasActiveTerminal: true,
			}),
		).toBe("active-terminal");
	});

	it("uses one new-tab pane for sequential commands without an active terminal", () => {
		expect(
			getPresetLaunchPlan({
				mode: "sequential",
				target: "active-tab",
				commandCount: 2,
				hasActiveTab: true,
			}),
		).toBe("new-tab-single");
	});
});
