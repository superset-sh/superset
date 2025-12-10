import { describe, expect, it } from "bun:test";
import { stripHash, toHex, toHex8, toHexAuto, withAlpha } from "./utils";

describe("toHex", () => {
	it("converts hex to hex", () => {
		expect(toHex("#ff0000")).toBe("#ff0000");
		expect(toHex("#FF0000")).toBe("#ff0000");
	});

	it("converts rgb to hex", () => {
		expect(toHex("rgb(255, 0, 0)")).toBe("#ff0000");
		expect(toHex("rgb(0, 255, 0)")).toBe("#00ff00");
	});

	it("converts oklch to hex", () => {
		expect(toHex("oklch(0.628 0.258 29.23)")).toBe("#ff0000");
	});

	it("converts hsl to hex", () => {
		expect(toHex("hsl(0, 100%, 50%)")).toBe("#ff0000");
	});

	it("returns original for invalid colors", () => {
		expect(toHex("not-a-color")).toBe("not-a-color");
	});
});

describe("toHex8", () => {
	it("converts to hex8 format with full alpha", () => {
		expect(toHex8("#ff0000")).toBe("#ff0000ff");
	});

	it("preserves alpha channel", () => {
		expect(toHex8("rgba(255, 0, 0, 0.5)")).toBe("#ff000080");
	});

	it("converts oklch with alpha", () => {
		const result = toHex8("oklch(0.628 0.258 29.23 / 0.5)");
		expect(result).toMatch(/^#[0-9a-f]{8}$/);
	});
});

describe("toHexAuto", () => {
	it("returns hex6 for opaque colors", () => {
		expect(toHexAuto("#ff0000")).toBe("#ff0000");
		expect(toHexAuto("rgb(255, 0, 0)")).toBe("#ff0000");
	});

	it("returns hex8 for transparent colors", () => {
		expect(toHexAuto("rgba(255, 0, 0, 0.5)")).toBe("#ff000080");
	});
});

describe("withAlpha", () => {
	it("applies alpha to color", () => {
		expect(withAlpha("#ff0000", 0.5)).toBe("#ff000080");
		expect(withAlpha("#ff0000", 1)).toBe("#ff0000ff");
		expect(withAlpha("#ff0000", 0)).toBe("#ff000000");
	});

	it("works with non-hex colors", () => {
		expect(withAlpha("rgb(255, 0, 0)", 0.5)).toBe("#ff000080");
	});

	it("returns original for invalid colors", () => {
		expect(withAlpha("invalid", 0.5)).toBe("invalid");
	});
});

describe("stripHash", () => {
	it("removes # prefix", () => {
		expect(stripHash("#ff0000")).toBe("ff0000");
		expect(stripHash("#ff000080")).toBe("ff000080");
	});

	it("handles strings without #", () => {
		expect(stripHash("ff0000")).toBe("ff0000");
	});
});
