import { describe, expect, it } from "bun:test";
import { FONT_SIZE_LIMITS } from "@superset/shared/settings-constraints";
import { DEFAULT_TERMINAL_FONT_SIZE } from "renderer/lib/terminal/appearance";
import { stepTerminalFontSize } from "./stepTerminalFontSize";

describe("stepTerminalFontSize", () => {
	it("steps by one point from the default when no size is persisted", () => {
		expect(stepTerminalFontSize(null, "in")).toBe(
			DEFAULT_TERMINAL_FONT_SIZE + 1,
		);
		expect(stepTerminalFontSize(null, "out")).toBe(
			DEFAULT_TERMINAL_FONT_SIZE - 1,
		);
	});

	it("keeps half-point sizes on their grid", () => {
		expect(stepTerminalFontSize(13.5, "in")).toBe(14.5);
	});

	it("is a no-op at the limits instead of overshooting", () => {
		expect(stepTerminalFontSize(FONT_SIZE_LIMITS.max, "in")).toBeUndefined();
		expect(stepTerminalFontSize(FONT_SIZE_LIMITS.min, "out")).toBeUndefined();
	});

	it("clamps a step that would cross a limit", () => {
		expect(stepTerminalFontSize(FONT_SIZE_LIMITS.max - 0.5, "in")).toBe(
			FONT_SIZE_LIMITS.max,
		);
	});

	it("reset clears the override, and is a no-op when already default", () => {
		expect(stepTerminalFontSize(20, "reset")).toBeNull();
		expect(stepTerminalFontSize(null, "reset")).toBeUndefined();
	});
});
