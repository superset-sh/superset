import { describe, expect, it } from "bun:test";
import { isValidWindowState } from "./window-state";

describe("isValidWindowState", () => {
	describe("valid window states", () => {
		it("should accept valid window state with positive coordinates", () => {
			expect(
				isValidWindowState({
					x: 100,
					y: 200,
					width: 800,
					height: 600,
					isMaximized: false,
				}),
			).toBe(true);
		});

		it("should accept valid window state at origin", () => {
			expect(
				isValidWindowState({
					x: 0,
					y: 0,
					width: 1920,
					height: 1080,
					isMaximized: false,
				}),
			).toBe(true);
		});

		it("should accept valid window state with negative coordinates (multi-monitor)", () => {
			expect(
				isValidWindowState({
					x: -1920,
					y: 0,
					width: 1920,
					height: 1080,
					isMaximized: false,
				}),
			).toBe(true);
		});

		it("should accept valid window state when maximized", () => {
			expect(
				isValidWindowState({
					x: 0,
					y: 0,
					width: 1920,
					height: 1080,
					isMaximized: true,
				}),
			).toBe(true);
		});

		it("should accept valid window state with decimal coordinates", () => {
			expect(
				isValidWindowState({
					x: 100.5,
					y: 200.75,
					width: 800.25,
					height: 600.5,
					isMaximized: false,
				}),
			).toBe(true);
		});

		it("should accept state with extra properties (forward compatibility)", () => {
			expect(
				isValidWindowState({
					x: 0,
					y: 0,
					width: 800,
					height: 600,
					isMaximized: false,
					futureProperty: "ignored",
				}),
			).toBe(true);
		});

		it("should accept valid window state with zoomLevel", () => {
			expect(
				isValidWindowState({
					x: 100,
					y: 200,
					width: 800,
					height: 600,
					isMaximized: false,
					zoomLevel: 1.5,
				}),
			).toBe(true);
		});

		it("should accept valid window state with negative zoomLevel", () => {
			expect(
				isValidWindowState({
					x: 100,
					y: 200,
					width: 800,
					height: 600,
					isMaximized: false,
					zoomLevel: -2,
				}),
			).toBe(true);
		});

		it("should accept valid window state with zero zoomLevel", () => {
			expect(
				isValidWindowState({
					x: 100,
					y: 200,
					width: 800,
					height: 600,
					isMaximized: false,
					zoomLevel: 0,
				}),
			).toBe(true);
		});

		it("should accept valid window state without zoomLevel (optional)", () => {
			expect(
				isValidWindowState({
					x: 100,
					y: 200,
					width: 800,
					height: 600,
					isMaximized: false,
				}),
			).toBe(true);
		});

		it("should accept MAX_SAFE_INTEGER dimensions", () => {
			expect(
				isValidWindowState({
					x: Number.MAX_SAFE_INTEGER,
					y: Number.MAX_SAFE_INTEGER,
					width: Number.MAX_SAFE_INTEGER,
					height: Number.MAX_SAFE_INTEGER,
					isMaximized: false,
				}),
			).toBe(true);
		});
	});

	describe("invalid dimensions", () => {
		it("should reject zero width", () => {
			expect(
				isValidWindowState({
					x: 0,
					y: 0,
					width: 0,
					height: 600,
					isMaximized: false,
				}),
			).toBe(false);
		});

		it("should reject zero height", () => {
			expect(
				isValidWindowState({
					x: 0,
					y: 0,
					width: 800,
					height: 0,
					isMaximized: false,
				}),
			).toBe(false);
		});

		it("should reject negative width", () => {
			expect(
				isValidWindowState({
					x: 0,
					y: 0,
					width: -800,
					height: 600,
					isMaximized: false,
				}),
			).toBe(false);
		});

		it("should reject negative height", () => {
			expect(
				isValidWindowState({
					x: 0,
					y: 0,
					width: 800,
					height: -600,
					isMaximized: false,
				}),
			).toBe(false);
		});
	});

	describe("invalid number values", () => {
		it("should reject Infinity", () => {
			expect(
				isValidWindowState({
					x: Number.POSITIVE_INFINITY,
					y: 0,
					width: 800,
					height: 600,
					isMaximized: false,
				}),
			).toBe(false);
		});

		it("should reject NaN", () => {
			expect(
				isValidWindowState({
					x: 0,
					y: 0,
					width: Number.NaN,
					height: 600,
					isMaximized: false,
				}),
			).toBe(false);
		});

		it("should reject NaN zoomLevel", () => {
			expect(
				isValidWindowState({
					x: 0,
					y: 0,
					width: 800,
					height: 600,
					isMaximized: false,
					zoomLevel: Number.NaN,
				}),
			).toBe(false);
		});

		it("should reject Infinity zoomLevel", () => {
			expect(
				isValidWindowState({
					x: 0,
					y: 0,
					width: 800,
					height: 600,
					isMaximized: false,
					zoomLevel: Number.POSITIVE_INFINITY,
				}),
			).toBe(false);
		});

		it("should reject string zoomLevel", () => {
			expect(
				isValidWindowState({
					x: 0,
					y: 0,
					width: 800,
					height: 600,
					isMaximized: false,
					zoomLevel: "1.5" as unknown as number,
				}),
			).toBe(false);
		});
	});

	describe("missing properties", () => {
		it("should reject missing x", () => {
			expect(
				isValidWindowState({
					y: 0,
					width: 800,
					height: 600,
					isMaximized: false,
				}),
			).toBe(false);
		});

		it("should reject missing y", () => {
			expect(
				isValidWindowState({
					x: 0,
					width: 800,
					height: 600,
					isMaximized: false,
				}),
			).toBe(false);
		});

		it("should reject missing width", () => {
			expect(
				isValidWindowState({
					x: 0,
					y: 0,
					height: 600,
					isMaximized: false,
				}),
			).toBe(false);
		});

		it("should reject missing height", () => {
			expect(
				isValidWindowState({
					x: 0,
					y: 0,
					width: 800,
					isMaximized: false,
				}),
			).toBe(false);
		});

		it("should reject missing isMaximized", () => {
			expect(
				isValidWindowState({
					x: 0,
					y: 0,
					width: 800,
					height: 600,
				}),
			).toBe(false);
		});
	});

	describe("wrong types", () => {
		it("should reject string for x", () => {
			expect(
				isValidWindowState({
					x: "100",
					y: 0,
					width: 800,
					height: 600,
					isMaximized: false,
				}),
			).toBe(false);
		});

		it("should reject string for isMaximized", () => {
			expect(
				isValidWindowState({
					x: 0,
					y: 0,
					width: 800,
					height: 600,
					isMaximized: "false",
				}),
			).toBe(false);
		});

		it("should reject number for isMaximized", () => {
			expect(
				isValidWindowState({
					x: 0,
					y: 0,
					width: 800,
					height: 600,
					isMaximized: 1,
				}),
			).toBe(false);
		});
	});

	describe("non-object values", () => {
		it("should reject null", () => {
			expect(isValidWindowState(null)).toBe(false);
		});

		it("should reject undefined", () => {
			expect(isValidWindowState(undefined)).toBe(false);
		});

		it("should reject string", () => {
			expect(isValidWindowState("not an object")).toBe(false);
		});

		it("should reject number", () => {
			expect(isValidWindowState(123)).toBe(false);
		});

		it("should reject array", () => {
			expect(isValidWindowState([0, 0, 800, 600, false])).toBe(false);
		});

		it("should reject empty object", () => {
			expect(isValidWindowState({})).toBe(false);
		});
	});
});
