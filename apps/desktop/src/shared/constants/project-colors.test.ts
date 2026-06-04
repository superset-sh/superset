import { describe, expect, it } from "bun:test";
import { PROJECT_COLORS, PROJECT_CUSTOM_COLORS } from "./project-colors";

function hexToRgb(hex: string) {
	const normalizedHex = hex.replace("#", "");

	return [0, 2, 4].map((offset) =>
		Number.parseInt(normalizedHex.slice(offset, offset + 2), 16),
	);
}

function colorDistance(leftHex: string, rightHex: string) {
	const leftRgb = hexToRgb(leftHex);
	const rightRgb = hexToRgb(rightHex);

	return Math.sqrt(
		leftRgb.reduce((sum, channel, index) => {
			const delta = channel - rightRgb[index];
			return sum + delta * delta;
		}, 0),
	);
}

describe("PROJECT_COLORS", () => {
	it("keeps color names and values unique", () => {
		const colorNames = PROJECT_COLORS.map((color) => color.name);
		const colorValues = PROJECT_COLORS.map((color) => color.value);

		expect(new Set(colorNames).size).toBe(colorNames.length);
		expect(new Set(colorValues).size).toBe(colorValues.length);
		expect(PROJECT_COLORS.length).toBeGreaterThan(0);
	});

	it("keeps custom swatches visually distinct", () => {
		for (
			let leftIndex = 0;
			leftIndex < PROJECT_CUSTOM_COLORS.length;
			leftIndex++
		) {
			const leftColor = PROJECT_CUSTOM_COLORS[leftIndex];

			for (
				let rightIndex = leftIndex + 1;
				rightIndex < PROJECT_CUSTOM_COLORS.length;
				rightIndex++
			) {
				const rightColor = PROJECT_CUSTOM_COLORS[rightIndex];

				expect(
					colorDistance(leftColor.value, rightColor.value),
				).toBeGreaterThan(40);
			}
		}
	});
});
