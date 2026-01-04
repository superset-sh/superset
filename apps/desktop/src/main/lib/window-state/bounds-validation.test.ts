import { beforeEach, describe, expect, it, type mock } from "bun:test";
import { screen } from "electron";
import {
	getInitialWindowBounds,
	isVisibleOnAnyDisplay,
} from "./bounds-validation";

const MIN_VISIBLE_OVERLAP = 50;
const MIN_WINDOW_SIZE = 400;

describe("isVisibleOnAnyDisplay", () => {
	describe("single display setup", () => {
		beforeEach(() => {
			(screen.getAllDisplays as ReturnType<typeof mock>).mockReturnValue([
				{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
			]);
		});

		it("should return true for window fully within display", () => {
			expect(
				isVisibleOnAnyDisplay({ x: 100, y: 100, width: 800, height: 600 }),
			).toBe(true);
		});

		it("should return true for window covering entire display", () => {
			expect(
				isVisibleOnAnyDisplay({ x: 0, y: 0, width: 1920, height: 1080 }),
			).toBe(true);
		});

		it("should return true for window with more than MIN_VISIBLE_OVERLAP on right edge", () => {
			expect(
				isVisibleOnAnyDisplay({
					x: 1920 - MIN_VISIBLE_OVERLAP - 1,
					y: 100,
					width: 800,
					height: 600,
				}),
			).toBe(true);
		});

		it("should return true for window with more than MIN_VISIBLE_OVERLAP on bottom edge", () => {
			expect(
				isVisibleOnAnyDisplay({
					x: 100,
					y: 1080 - MIN_VISIBLE_OVERLAP - 1,
					width: 800,
					height: 600,
				}),
			).toBe(true);
		});

		it("should return false for window at exactly MIN_VISIBLE_OVERLAP boundary (strict inequality)", () => {
			expect(
				isVisibleOnAnyDisplay({
					x: 1920 - MIN_VISIBLE_OVERLAP,
					y: 100,
					width: 800,
					height: 600,
				}),
			).toBe(false);
		});

		it("should return false for window completely off-screen (right)", () => {
			expect(
				isVisibleOnAnyDisplay({ x: 2000, y: 100, width: 800, height: 600 }),
			).toBe(false);
		});

		it("should return false for window completely off-screen (left)", () => {
			expect(
				isVisibleOnAnyDisplay({ x: -900, y: 100, width: 800, height: 600 }),
			).toBe(false);
		});

		it("should return false for window completely off-screen (bottom)", () => {
			expect(
				isVisibleOnAnyDisplay({ x: 100, y: 1200, width: 800, height: 600 }),
			).toBe(false);
		});

		it("should return false for window completely off-screen (top)", () => {
			expect(
				isVisibleOnAnyDisplay({ x: 100, y: -700, width: 800, height: 600 }),
			).toBe(false);
		});

		it("should return false for window with insufficient overlap (49px < 50px threshold)", () => {
			expect(
				isVisibleOnAnyDisplay({
					x: 1920 - MIN_VISIBLE_OVERLAP + 1,
					y: 100,
					width: 800,
					height: 600,
				}),
			).toBe(false);
		});
	});

	describe("multi-display setup", () => {
		beforeEach(() => {
			(screen.getAllDisplays as ReturnType<typeof mock>).mockReturnValue([
				{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
				{ bounds: { x: 1920, y: 0, width: 1920, height: 1080 } },
			]);
		});

		it("should return true for window on secondary display", () => {
			expect(
				isVisibleOnAnyDisplay({ x: 2000, y: 100, width: 800, height: 600 }),
			).toBe(true);
		});

		it("should return true for window spanning both displays", () => {
			expect(
				isVisibleOnAnyDisplay({ x: 1500, y: 100, width: 1000, height: 600 }),
			).toBe(true);
		});

		it("should return false for window off-screen to the right of secondary", () => {
			expect(
				isVisibleOnAnyDisplay({ x: 4000, y: 100, width: 800, height: 600 }),
			).toBe(false);
		});
	});

	describe("secondary display with offset", () => {
		beforeEach(() => {
			(screen.getAllDisplays as ReturnType<typeof mock>).mockReturnValue([
				{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
				{ bounds: { x: 960, y: 1080, width: 1920, height: 1080 } },
			]);
		});

		it("should return true for window on offset secondary display", () => {
			expect(
				isVisibleOnAnyDisplay({ x: 1000, y: 1200, width: 800, height: 600 }),
			).toBe(true);
		});

		it("should return false for window in gap between displays", () => {
			expect(
				isVisibleOnAnyDisplay({ x: 0, y: 1100, width: 800, height: 600 }),
			).toBe(false);
		});
	});

	describe("display to the left (negative coordinates)", () => {
		beforeEach(() => {
			(screen.getAllDisplays as ReturnType<typeof mock>).mockReturnValue([
				{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
				{ bounds: { x: -1920, y: 0, width: 1920, height: 1080 } },
			]);
		});

		it("should return true for window on display with negative coordinates", () => {
			expect(
				isVisibleOnAnyDisplay({ x: -1000, y: 100, width: 800, height: 600 }),
			).toBe(true);
		});
	});

	describe("edge cases", () => {
		it("should return false when no displays connected", () => {
			(screen.getAllDisplays as ReturnType<typeof mock>).mockReturnValue([]);
			expect(
				isVisibleOnAnyDisplay({ x: 100, y: 100, width: 800, height: 600 }),
			).toBe(false);
		});

		it("should return true for zero-size window if position is valid (size validation is separate)", () => {
			(screen.getAllDisplays as ReturnType<typeof mock>).mockReturnValue([
				{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
			]);
			expect(
				isVisibleOnAnyDisplay({ x: 100, y: 100, width: 0, height: 0 }),
			).toBe(true);
		});
	});
});

describe("getInitialWindowBounds", () => {
	beforeEach(() => {
		(screen.getPrimaryDisplay as ReturnType<typeof mock>).mockReturnValue({
			workAreaSize: { width: 1920, height: 1080 },
		});
		(screen.getAllDisplays as ReturnType<typeof mock>).mockReturnValue([
			{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
		]);
	});

	describe("no saved state", () => {
		it("should return primary display size when no saved state", () => {
			const result = getInitialWindowBounds(null);
			expect(result).toEqual({
				width: 1920,
				height: 1080,
				center: true,
				isMaximized: false,
			});
		});

		it("should not include x/y when centering", () => {
			const result = getInitialWindowBounds(null);
			expect(result.x).toBeUndefined();
			expect(result.y).toBeUndefined();
		});
	});

	describe("saved state on visible display", () => {
		it("should restore exact position when visible on display", () => {
			const result = getInitialWindowBounds({
				x: 100,
				y: 200,
				width: 800,
				height: 600,
				isMaximized: false,
			});
			expect(result).toEqual({
				x: 100,
				y: 200,
				width: 800,
				height: 600,
				center: false,
				isMaximized: false,
			});
		});

		it("should preserve isMaximized when restoring position", () => {
			const result = getInitialWindowBounds({
				x: 0,
				y: 0,
				width: 1920,
				height: 1080,
				isMaximized: true,
			});
			expect(result.isMaximized).toBe(true);
			expect(result.center).toBe(false);
		});
	});

	describe("saved state on disconnected display", () => {
		it("should center window but keep dimensions when display disconnected", () => {
			const result = getInitialWindowBounds({
				x: 2000,
				y: 100,
				width: 800,
				height: 600,
				isMaximized: false,
			});
			expect(result).toEqual({
				width: 800,
				height: 600,
				center: true,
				isMaximized: false,
			});
			expect(result.x).toBeUndefined();
			expect(result.y).toBeUndefined();
		});

		it("should preserve isMaximized when centering", () => {
			const result = getInitialWindowBounds({
				x: 2000,
				y: 100,
				width: 800,
				height: 600,
				isMaximized: true,
			});
			expect(result.isMaximized).toBe(true);
			expect(result.center).toBe(true);
		});
	});

	describe("dimension clamping", () => {
		it("should clamp width to work area size", () => {
			const result = getInitialWindowBounds({
				x: 0,
				y: 0,
				width: 3000,
				height: 600,
				isMaximized: false,
			});
			expect(result.width).toBe(1920);
		});

		it("should clamp height to work area size", () => {
			const result = getInitialWindowBounds({
				x: 0,
				y: 0,
				width: 800,
				height: 2000,
				isMaximized: false,
			});
			expect(result.height).toBe(1080);
		});

		it("should enforce minimum window size for width", () => {
			const result = getInitialWindowBounds({
				x: 0,
				y: 0,
				width: 100,
				height: 600,
				isMaximized: false,
			});
			expect(result.width).toBe(MIN_WINDOW_SIZE);
		});

		it("should enforce minimum window size for height", () => {
			const result = getInitialWindowBounds({
				x: 0,
				y: 0,
				width: 800,
				height: 100,
				isMaximized: false,
			});
			expect(result.height).toBe(MIN_WINDOW_SIZE);
		});
	});

	describe("DPI/resolution changes", () => {
		it("should handle resolution decrease gracefully", () => {
			(screen.getPrimaryDisplay as ReturnType<typeof mock>).mockReturnValue({
				workAreaSize: { width: 1280, height: 720 },
			});

			const result = getInitialWindowBounds({
				x: 0,
				y: 0,
				width: 1920,
				height: 1080,
				isMaximized: false,
			});

			expect(result.width).toBe(1280);
			expect(result.height).toBe(720);
		});

		it("should clamp to work area even if smaller than MIN_WINDOW_SIZE", () => {
			(screen.getPrimaryDisplay as ReturnType<typeof mock>).mockReturnValue({
				workAreaSize: { width: 300, height: 200 },
			});

			const result = getInitialWindowBounds({
				x: 0,
				y: 0,
				width: 800,
				height: 600,
				isMaximized: false,
			});

			expect(result.width).toBe(300);
			expect(result.height).toBe(200);
		});
	});

	describe("multi-monitor scenarios", () => {
		beforeEach(() => {
			(screen.getAllDisplays as ReturnType<typeof mock>).mockReturnValue([
				{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
				{ bounds: { x: 1920, y: 0, width: 1920, height: 1080 } },
			]);
		});

		it("should restore position on secondary display", () => {
			const result = getInitialWindowBounds({
				x: 2000,
				y: 100,
				width: 800,
				height: 600,
				isMaximized: false,
			});
			expect(result.x).toBe(2000);
			expect(result.y).toBe(100);
			expect(result.center).toBe(false);
		});
	});
});
