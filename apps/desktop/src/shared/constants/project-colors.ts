/** Special value representing "no custom color" - uses default gray border */
export const PROJECT_COLOR_DEFAULT = "default";

export const PROJECT_COLORS = [
	{ name: "Default", value: PROJECT_COLOR_DEFAULT },
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

export const PROJECT_CUSTOM_COLORS = PROJECT_COLORS.filter(
	(color) => color.value !== PROJECT_COLOR_DEFAULT,
);

export const PROJECT_COLOR_VALUES: string[] = PROJECT_COLORS.map(
	(color) => color.value,
);
