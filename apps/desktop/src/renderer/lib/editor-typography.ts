/** Preserve the legacy rounded 1.5x editor line height until an override exists. */
export function resolveEditorLineHeight(
	fontSize: number,
	lineHeight?: number,
): number {
	return lineHeight == null
		? Math.round(fontSize * 1.5)
		: fontSize * lineHeight;
}

export function resolveFontVariantLigatures(
	ligatures?: boolean,
): "normal" | "none" | undefined {
	if (ligatures == null) return undefined;
	return ligatures ? "normal" : "none";
}
