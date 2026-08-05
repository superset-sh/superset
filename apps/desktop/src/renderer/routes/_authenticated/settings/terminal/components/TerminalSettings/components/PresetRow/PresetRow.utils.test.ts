import { describe, expect, it } from "bun:test";
import { getLaunchModeValue, getPresetModeLabel } from "./PresetRow.utils";

describe("getPresetModeLabel", () => {
	it("does not describe sequential presets as split panes", () => {
		expect(getPresetModeLabel("sequential", 1)).toBe("Current tab");
		expect(getPresetModeLabel("sequential", 2)).toBe("All in current tab");
	});

	it("keeps split-pane labels for split-pane presets", () => {
		expect(getPresetModeLabel("split-pane", 1)).toBe("Split pane");
		expect(getPresetModeLabel("split-pane", 2)).toBe("Single tab + panes");
	});

	it("labels background presets regardless of command count", () => {
		expect(getPresetModeLabel("background", 1)).toBe("Background");
		expect(getPresetModeLabel("background", 2)).toBe("Background");
	});
});

describe("getLaunchModeValue", () => {
	it("collapses single-command tab variants but keeps background", () => {
		expect(getLaunchModeValue("sequential", false)).toBe("split-pane");
		expect(getLaunchModeValue("new-tab-split-pane", false)).toBe("new-tab");
		expect(getLaunchModeValue("background", false)).toBe("background");
	});

	it("passes modes through unchanged for multiple commands", () => {
		expect(getLaunchModeValue("sequential", true)).toBe("sequential");
		expect(getLaunchModeValue("background", true)).toBe("background");
	});
});
