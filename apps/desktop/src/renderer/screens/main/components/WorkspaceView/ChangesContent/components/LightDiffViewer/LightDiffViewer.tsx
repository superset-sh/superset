import type { DiffsThemeNames } from "@pierre/diffs/react";
import { MultiFileDiff } from "@pierre/diffs/react";
import { useMemo } from "react";
import { useThemeStore } from "renderer/stores/theme";
import { getTerminalColors, type Theme } from "shared/themes";
import type { DiffViewMode, FileContents } from "shared/changes-types";
import { toHexAuto, withAlpha } from "shared/themes/utils";

// Superset theme ID → closest Shiki bundled equivalent
const SHIKI_THEME_MAP: Record<
	string,
	{ light: DiffsThemeNames; dark: DiffsThemeNames }
> = {
	dark: { light: "github-light-default", dark: "github-dark-default" },
	light: { light: "github-light-default", dark: "github-dark-default" },
	"one-dark": { light: "one-light", dark: "one-dark-pro" },
	monokai: { light: "one-light", dark: "monokai" },
	ember: { light: "one-light", dark: "vitesse-dark" },
};

const DEFAULT_THEMES = {
	light: "github-light-default" as DiffsThemeNames,
	dark: "github-dark-default" as DiffsThemeNames,
};

function getDiffBrandUnsafeCss(theme: Theme): string {
	const terminal = getTerminalColors(theme);
	const isDark = theme.type === "dark";
	const brand = toHexAuto(theme.ui.sidebarPrimary);
	const border = toHexAuto(theme.ui.border);
	const bg = toHexAuto(terminal.background);
	const fg = toHexAuto(terminal.foreground);
	const addition = toHexAuto(terminal.green);
	const deletion = toHexAuto(terminal.red);
	const modified = toHexAuto(terminal.blue);

	const subtleTint = isDark ? 0.1 : 0.06;
	const hoverTint = isDark ? 0.16 : 0.1;
	const separatorTint = isDark ? 0.55 : 0.35;
	const addedTint = isDark ? 0.22 : 0.16;
	const removedTint = isDark ? 0.2 : 0.15;
	const addedHoverTint = isDark ? 0.28 : 0.2;
	const removedHoverTint = isDark ? 0.26 : 0.19;
	const emphasisTint = isDark ? 0.22 : 0.16;
	const selectionTint = isDark ? 0.26 : 0.2;
	const selectionNumberTint = isDark ? 0.32 : 0.26;

	return `
:host {
	--diffs-light-bg: ${bg};
	--diffs-dark-bg: ${bg};
	--diffs-light: ${fg};
	--diffs-dark: ${fg};

	--diffs-bg-buffer-override: ${withAlpha(brand, subtleTint + 0.04)};
	--diffs-bg-context-override: ${withAlpha(brand, subtleTint)};
	--diffs-bg-hover-override: ${withAlpha(brand, hoverTint)};
	--diffs-bg-separator-override: ${withAlpha(border, separatorTint)};

	--diffs-addition-color-override: ${addition};
	--diffs-deletion-color-override: ${deletion};
	--diffs-modified-color-override: ${modified};

	--diffs-bg-addition-override: ${withAlpha(addition, addedTint)};
	--diffs-bg-addition-number-override: ${withAlpha(addition, addedTint + 0.05)};
	--diffs-bg-addition-hover-override: ${withAlpha(addition, addedHoverTint)};
	--diffs-bg-addition-emphasis-override: ${withAlpha(addition, emphasisTint)};

	--diffs-bg-deletion-override: ${withAlpha(deletion, removedTint)};
	--diffs-bg-deletion-number-override: ${withAlpha(deletion, removedTint + 0.05)};
	--diffs-bg-deletion-hover-override: ${withAlpha(deletion, removedHoverTint)};
	--diffs-bg-deletion-emphasis-override: ${withAlpha(deletion, emphasisTint)};

	--diffs-bg-selection-override: ${withAlpha(brand, selectionTint)};
	--diffs-bg-selection-number-override: ${withAlpha(brand, selectionNumberTint)};
}
`;
}

interface LightDiffViewerProps {
	contents: FileContents;
	viewMode: DiffViewMode;
	hideUnchangedRegions?: boolean;
	filePath: string;
}

export function LightDiffViewer({
	contents,
	viewMode,
	hideUnchangedRegions,
	filePath,
}: LightDiffViewerProps) {
	const activeTheme = useThemeStore((s) => s.activeTheme);
	const themeId = activeTheme?.id ?? "dark";
	const themeType = useThemeStore((s) =>
		s.activeTheme?.type === "light" ? ("light" as const) : ("dark" as const),
	);
	const unsafeCSS = useMemo(
		() => (activeTheme ? getDiffBrandUnsafeCss(activeTheme) : undefined),
		[activeTheme],
	);

	const shikiTheme = SHIKI_THEME_MAP[themeId] ?? DEFAULT_THEMES;

	return (
		<MultiFileDiff
			oldFile={{ name: filePath, contents: contents.original }}
			newFile={{ name: filePath, contents: contents.modified }}
			options={{
				diffStyle: viewMode === "side-by-side" ? "split" : "unified",
				expandUnchanged: !hideUnchangedRegions,
				theme: shikiTheme,
				themeType,
				overflow: "wrap",
				disableFileHeader: true,
				unsafeCSS,
			}}
		/>
	);
}
