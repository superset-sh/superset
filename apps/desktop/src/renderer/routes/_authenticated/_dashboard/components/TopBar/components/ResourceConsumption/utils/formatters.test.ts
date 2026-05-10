import { describe, expect, it } from "bun:test";
import { formatCpu, formatMemory, formatPercent } from "./formatters";

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;
const NBSP = String.fromCharCode(0xa0);

describe("formatMemory", () => {
	it("renders KB values", () => {
		expect(formatMemory(512 * KB)).toBe(`512${NBSP}KB`);
	});

	it("renders MB values with one decimal", () => {
		expect(formatMemory(512 * MB)).toBe(`512.0${NBSP}MB`);
	});

	it("renders GB values with two decimals", () => {
		expect(formatMemory(17.81 * GB)).toBe(`17.81${NBSP}GB`);
	});

	// Regression for issue #4379: at narrow top-bar widths the value+unit
	// wrapped onto two lines. A non-breaking space keeps them on one line.
	it("uses a non-breaking space (not a regular space) between value and unit", () => {
		const cases = [256 * KB, 512 * MB, 17.81 * GB, 100 * GB];
		for (const bytes of cases) {
			const output = formatMemory(bytes);
			expect(output.includes(" ")).toBe(false);
			expect(output.includes(NBSP)).toBe(true);
		}
	});
});

describe("formatCpu", () => {
	it("renders a percent suffix with one decimal", () => {
		expect(formatCpu(42.5)).toBe("42.5%");
		expect(formatCpu(0)).toBe("0.0%");
	});
});

describe("formatPercent", () => {
	it("renders a percent suffix with no decimals", () => {
		expect(formatPercent(42.5)).toBe("43%");
		expect(formatPercent(0)).toBe("0%");
	});
});
