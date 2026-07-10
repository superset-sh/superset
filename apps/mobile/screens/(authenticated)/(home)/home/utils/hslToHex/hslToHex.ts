/**
 * Converts a THEME "hsl(h s% l%)" string to the hex form required by
 * SwiftUI presentation modifiers like `presentationBackground`.
 */
export function hslToHex(hsl: string): string {
	const match = hsl.match(
		/hsl\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%\s*\)/,
	);
	if (!match) return "#000000";
	const hue = Number(match[1]);
	const saturation = Number(match[2]) / 100;
	const lightness = Number(match[3]) / 100;
	const chroma = saturation * Math.min(lightness, 1 - lightness);
	const channel = (n: number) => {
		const k = (n + hue / 30) % 12;
		const value =
			lightness - chroma * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
		return Math.round(255 * value)
			.toString(16)
			.padStart(2, "0");
	};
	return `#${channel(0)}${channel(8)}${channel(4)}`;
}
