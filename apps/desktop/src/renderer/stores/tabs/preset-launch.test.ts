import { describe, expect, it } from "bun:test";
import { getPresetLaunchPlan, normalizePresetMode } from "./preset-launch";

describe("normalizePresetMode", () => {
	it("returns new-tab for new-tab mode", () => {
		expect(normalizePresetMode("new-tab")).toBe("new-tab");
	});

	it("maps legacy and unknown modes to split-pane", () => {
		expect(normalizePresetMode("split-pane")).toBe("split-pane");
		expect(normalizePresetMode("parallel")).toBe("split-pane");
		expect(normalizePresetMode("sequential")).toBe("split-pane");
		expect(normalizePresetMode(undefined)).toBe("split-pane");
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
});
