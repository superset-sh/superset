import { MultiFileDiff } from "@pierre/diffs/react";
import { useThemeStore } from "renderer/stores/theme";
import type { DiffViewMode, FileContents } from "shared/changes-types";

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
	const themeType = useThemeStore((s) =>
		s.activeTheme?.type === "light" ? "light" : "dark",
	);

	return (
		<MultiFileDiff
			oldFile={{ name: filePath, contents: contents.original }}
			newFile={{ name: filePath, contents: contents.modified }}
			options={{
				diffStyle: viewMode === "side-by-side" ? "split" : "unified",
				expandUnchanged: !hideUnchangedRegions,
				theme:
					themeType === "light"
						? { light: "one-light", dark: "one-dark-pro" }
						: { light: "one-light", dark: "one-dark-pro" },
				themeType,
				overflow: "wrap",
				disableFileHeader: true,
			}}
		/>
	);
}
