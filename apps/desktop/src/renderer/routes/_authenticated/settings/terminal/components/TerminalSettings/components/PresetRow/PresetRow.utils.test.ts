import { describe, expect, it } from "bun:test";
import { getPresetModeLabel } from "./PresetRow.utils";

describe("getPresetModeLabel", () => {
	it("does not describe sequential presets as split panes", () => {
		expect(getPresetModeLabel("sequential", 1)).toBe("Current tab");
		expect(getPresetModeLabel("sequential", 2)).toBe("All in current tab");
	});

	it("keeps split-pane labels for split-pane presets", () => {
		expect(getPresetModeLabel("split-pane", 1)).toBe("Split pane");
		expect(getPresetModeLabel("split-pane", 2)).toBe("Single tab + panes");
	});
});
