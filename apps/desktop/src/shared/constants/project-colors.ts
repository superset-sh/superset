/** Special value representing "no custom color" - uses default gray border */
export const PROJECT_COLOR_DEFAULT = "default";

export const PROJECT_COLORS: { name: string; value: string }[] = [
	{ name: "Default", value: PROJECT_COLOR_DEFAULT },
	{ name: "Blue", value: "#3b82f6" },
	{ name: "Green", value: "#22c55e" },
	{ name: "Yellow", value: "#eab308" },
	{ name: "Red", value: "#ef4444" },
	{ name: "Purple", value: "#a855f7" },
	{ name: "Cyan", value: "#06b6d4" },
	{ name: "Orange", value: "#f97316" },
	{ name: "Slate", value: "#64748b" },
] as const;

export const PROJECT_COLOR_VALUES = PROJECT_COLORS.map((color) => color.value);
