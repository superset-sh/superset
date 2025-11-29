import { useMemo } from "react";
import { useTheme } from "../stores/theme";
import { createDiffColors, type DiffColors } from "../stores/theme/utils";

/**
 * Default diff colors for when no theme is loaded
 */
const DEFAULT_DIFF_COLORS: DiffColors = {
	addedBg: "rgba(46, 160, 67, 0.15)",
	addedBgHover: "rgba(46, 160, 67, 0.25)",
	addedIndicator: "#3fb950",
	deletedBg: "rgba(248, 81, 73, 0.15)",
	deletedBgHover: "rgba(248, 81, 73, 0.25)",
	deletedIndicator: "#f85149",
	hunkHeaderBg: "rgba(56, 139, 253, 0.1)",
	hunkHeaderText: "#58a6ff",
	lineNumber: "#6e7681",
};

/**
 * Hook to get diff colors derived from the current theme
 */
export function useDiffColors(): DiffColors {
	const theme = useTheme();

	return useMemo(() => {
		if (!theme) {
			return DEFAULT_DIFF_COLORS;
		}

		return createDiffColors(theme.terminal, theme.type === "dark");
	}, [theme]);
}
