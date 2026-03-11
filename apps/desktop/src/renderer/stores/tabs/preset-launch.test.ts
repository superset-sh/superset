import { describe, expect, it } from "bun:test";
import { normalizeExecutionMode } from "@superset/local-db/schema/zod";
import { getPresetLaunchPlan } from "./preset-launch";

describe("normalizeExecutionMode", () => {
	it("returns new-tab for new-tab mode", () => {
		expect(normalizeExecutionMode("new-tab")).toBe("new-tab");
	});

	it("returns new-tab-split-pane for new-tab-split-pane mode", () => {
		expect(normalizeExecutionMode("new-tab-split-pane")).toBe(
			"new-tab-split-pane",
		);
	});

	it("returns inject for inject mode", () => {
		expect(normalizeExecutionMode("inject")).toBe("inject");
	});

	it("maps legacy and unknown modes to split-pane", () => {
		expect(normalizeExecutionMode("split-pane")).toBe("split-pane");
		expect(normalizeExecutionMode("parallel")).toBe("split-pane");
		expect(normalizeExecutionMode("sequential")).toBe("split-pane");
		expect(normalizeExecutionMode(undefined)).toBe("split-pane");
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

	describe("inject mode", () => {
		it("returns active-tab-inject when mode is inject, active tab exists, and focused pane exists", () => {
			expect(
				getPresetLaunchPlan({
					mode: "inject",
					target: "active-tab",
					commandCount: 1,
					hasActiveTab: true,
					hasFocusedPane: true,
				}),
			).toBe("active-tab-inject");
		});

		it("returns active-tab-inject for multiple commands with inject mode", () => {
			expect(
				getPresetLaunchPlan({
					mode: "inject",
					target: "active-tab",
					commandCount: 3,
					hasActiveTab: true,
					hasFocusedPane: true,
				}),
			).toBe("active-tab-inject");
		});

		it("falls back to new-tab-single when no active tab is available in inject mode", () => {
			expect(
				getPresetLaunchPlan({
					mode: "inject",
					target: "active-tab",
					commandCount: 1,
					hasActiveTab: false,
					hasFocusedPane: false,
				}),
			).toBe("new-tab-single");
		});

		it("falls back to new-tab-single when active tab exists but no focused pane in inject mode", () => {
			expect(
				getPresetLaunchPlan({
					mode: "inject",
					target: "active-tab",
					commandCount: 1,
					hasActiveTab: true,
					hasFocusedPane: false,
				}),
			).toBe("new-tab-single");
		});
	});
});
