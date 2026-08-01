const DEFAULT_FONT_WEIGHT = 400;

export function toFontWeightOverride(value: string): number | null {
	const weight = Number(value);
	return weight === DEFAULT_FONT_WEIGHT ? null : weight;
}
