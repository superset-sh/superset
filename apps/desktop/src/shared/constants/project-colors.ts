/** Special value representing "no custom color" - uses default gray border */
export const PROJECT_COLOR_DEFAULT = "default";

export const PROJECT_COLORS = [
	{ name: "Red", value: "#ef4444" },
	{ name: "Orange", value: "#f97316" },
	{ name: "Yellow", value: "#eab308" },
	{ name: "Lime", value: "#84cc16" },
	{ name: "Green", value: "#22c55e" },
	{ name: "Teal", value: "#14b8a6" },
	{ name: "Cyan", value: "#06b6d4" },
	{ name: "Blue", value: "#3b82f6" },
	{ name: "Indigo", value: "#6366f1" },
	{ name: "Purple", value: "#a855f7" },
	{ name: "Pink", value: "#ec4899" },
	{ name: "Slate", value: "#64748b" },
] as const;

export const PROJECT_CUSTOM_COLORS = PROJECT_COLORS;

export const PROJECT_COLOR_VALUES: string[] = PROJECT_COLORS.map(
	(color) => color.value,
);

/** Checks if a color value is a custom hex color (not the "default" value). */
export function isCustomProjectColor(
	color: string | null | undefined,
): color is string {
	return !!color && color !== PROJECT_COLOR_DEFAULT && color.startsWith("#");
}

/** Converts a hex color to an rgba string with the specified alpha. */
export function hexToRgba(hex: string, alpha: number): string {
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
