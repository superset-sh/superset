import { describe, expect, it } from "bun:test";
import { getScrollOffsetForTab } from "./scroll-utils";

const TAB_WIDTH = 160;

describe("getScrollOffsetForTab", () => {
	// Reproduces issue #1840: newly opened terminals are not visible when the
	// tabs bar is full, and switching to an off-screen tab does not scroll it
	// into view.

	it("returns null when the tab is already fully visible", () => {
		// Container shows 3 tabs (480px wide), scrolled to the start
		const result = getScrollOffsetForTab({
			tabIndex: 0,
			tabWidth: TAB_WIDTH,
			containerScrollLeft: 0,
			containerClientWidth: 480,
		});
		expect(result).toBeNull();
	});

	it("returns null when a middle tab is visible", () => {
		const result = getScrollOffsetForTab({
			tabIndex: 2,
			tabWidth: TAB_WIDTH,
			containerScrollLeft: 0,
			containerClientWidth: 480,
		});
		expect(result).toBeNull();
	});

	it("returns correct offset when the tab is to the RIGHT of the viewport (newly opened terminal not visible)", () => {
		// Container shows tabs 0-2 (480px), tab 3 (index=3) is off-screen to the right
		// tabLeft = 3 * 160 = 480, tabRight = 640
		// Expected scroll: tabRight - containerWidth = 640 - 480 = 160
		const result = getScrollOffsetForTab({
			tabIndex: 3,
			tabWidth: TAB_WIDTH,
			containerScrollLeft: 0,
			containerClientWidth: 480,
		});
		expect(result).toBe(160);
	});

	it("returns correct offset when switching to a tab far to the right", () => {
		// Container shows 480px, currently showing tabs starting at scroll=0
		// Tab at index 9 is at left=1440, right=1600
		// Expected scroll: 1600 - 480 = 1120
		const result = getScrollOffsetForTab({
			tabIndex: 9,
			tabWidth: TAB_WIDTH,
			containerScrollLeft: 0,
			containerClientWidth: 480,
		});
		expect(result).toBe(1120);
	});

	it("returns correct offset when the tab is to the LEFT of the viewport (switching to earlier tab)", () => {
		// Container is scrolled to show tabs 3+ (scrollLeft=480)
		// Tab at index 0 is at left=0, which is less than scrollLeft=480
		// Expected scroll: tabLeft = 0
		const result = getScrollOffsetForTab({
			tabIndex: 0,
			tabWidth: TAB_WIDTH,
			containerScrollLeft: 480,
			containerClientWidth: 480,
		});
		expect(result).toBe(0);
	});

	it("returns the tab's left position when scrolling left to show an off-screen tab", () => {
		// Scrolled to show tabs 5+ (scrollLeft=800), switching back to tab at index 3
		// tabLeft = 3 * 160 = 480, which is < scrollLeft=800
		// Expected scroll: 480
		const result = getScrollOffsetForTab({
			tabIndex: 3,
			tabWidth: TAB_WIDTH,
			containerScrollLeft: 800,
			containerClientWidth: 480,
		});
		expect(result).toBe(480);
	});

	it("returns null when a partially-viewed tab is fully within the viewport", () => {
		// Container scrolled to 80, showing from 80..560 — tab 1 (160..320) is fully visible
		const result = getScrollOffsetForTab({
			tabIndex: 1,
			tabWidth: TAB_WIDTH,
			containerScrollLeft: 80,
			containerClientWidth: 480,
		});
		expect(result).toBeNull();
	});
});
