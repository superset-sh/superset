import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";

/** Special value representing "no custom color" - uses default gray border */
export const PROJECT_COLOR_DEFAULT = "default";

/**
 * `id` is the stable identity (tests, catalog IDs); `name()` is the swatch
 * label in the active locale. It stays a function rather than a `msg()`
 * descriptor because this module is also imported by the Electron main
 * process, whose build does not run the Lingui macro transform.
 */
export const PROJECT_COLORS = [
	{
		id: "red",
		name: () => i18n._(msg({ message: "Red" })),
		value: "#ef4444",
	},
	{
		id: "orange",
		name: () => i18n._(msg({ message: "Orange" })),
		value: "#f97316",
	},
	{
		id: "yellow",
		name: () => i18n._(msg({ message: "Yellow" })),
		value: "#eab308",
	},
	{
		id: "lime",
		name: () => i18n._(msg({ message: "Lime" })),
		value: "#84cc16",
	},
	{
		id: "green",
		name: () => i18n._(msg({ message: "Green" })),
		value: "#22c55e",
	},
	{
		id: "teal",
		name: () => i18n._(msg({ message: "Teal" })),
		value: "#14b8a6",
	},
	{
		id: "cyan",
		name: () => i18n._(msg({ message: "Cyan" })),
		value: "#06b6d4",
	},
	{
		id: "blue",
		name: () => i18n._(msg({ message: "Blue" })),
		value: "#3b82f6",
	},
	{
		id: "indigo",
		name: () => i18n._(msg({ message: "Indigo" })),
		value: "#6366f1",
	},
	{
		id: "purple",
		name: () => i18n._(msg({ message: "Purple" })),
		value: "#a855f7",
	},
	{
		id: "pink",
		name: () => i18n._(msg({ message: "Pink" })),
		value: "#ec4899",
	},
	{
		id: "slate",
		name: () => i18n._(msg({ message: "Slate" })),
		value: "#64748b",
	},
] as const;

export const PROJECT_CUSTOM_COLORS = PROJECT_COLORS;

export const PROJECT_COLOR_VALUES: string[] = PROJECT_COLORS.map(
	(color) => color.value,
);
