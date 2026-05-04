import { describe, expect, it } from "bun:test";
import { computeHoverFocusSuppression } from "./computeHoverFocusSuppression";

const baseline = {
	isPointerDown: false,
	isPaneDragging: false,
	isResizing: false,
	hasWindowFocus: true,
	hasOpenOverlay: false,
};

describe("computeHoverFocusSuppression", () => {
	it("returns false when no suppression cause is active", () => {
		expect(computeHoverFocusSuppression(baseline)).toBe(false);
	});

	it("returns true when a pointer button is down", () => {
		expect(
			computeHoverFocusSuppression({ ...baseline, isPointerDown: true }),
		).toBe(true);
	});

	it("returns true when a pane is being dragged", () => {
		expect(
			computeHoverFocusSuppression({ ...baseline, isPaneDragging: true }),
		).toBe(true);
	});

	it("returns true when a split divider is being resized", () => {
		expect(
			computeHoverFocusSuppression({ ...baseline, isResizing: true }),
		).toBe(true);
	});

	it("returns true when the app window does not have OS focus", () => {
		expect(
			computeHoverFocusSuppression({ ...baseline, hasWindowFocus: false }),
		).toBe(true);
	});

	it("returns true when an overlay (Radix menu/dialog/tooltip) is open", () => {
		expect(
			computeHoverFocusSuppression({ ...baseline, hasOpenOverlay: true }),
		).toBe(true);
	});

	it("returns true when multiple causes are active", () => {
		expect(
			computeHoverFocusSuppression({
				isPointerDown: true,
				isPaneDragging: true,
				isResizing: true,
				hasWindowFocus: false,
				hasOpenOverlay: true,
			}),
		).toBe(true);
	});
});
