import { MultiFileDiff } from "@pierre/diffs/react";
import { cn } from "@superset/ui/utils";
import type { CSSProperties } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useThemeStore } from "renderer/stores/theme";
import type { DiffViewMode, FileContents } from "shared/changes-types";
import { getDiffsTheme, getDiffViewerStyle } from "../../../utils/code-theme";

interface LightDiffViewerProps {
	contents: FileContents;
	viewMode: DiffViewMode;
	hideUnchangedRegions?: boolean;
	filePath: string;
	className?: string;
	style?: CSSProperties;
}

export function LightDiffViewer({
	contents,
	viewMode,
	hideUnchangedRegions,
	filePath,
	className,
	style,
}: LightDiffViewerProps) {
	const activeTheme = useThemeStore((s) => s.activeTheme);
	const themeType = useThemeStore((s) =>
		s.activeTheme?.type === "light" ? ("light" as const) : ("dark" as const),
	);
	const { data: fontSettings } = electronTrpc.settings.getFontSettings.useQuery(
		undefined,
		{
			staleTime: 30_000,
		},
	);
	const shikiTheme = getDiffsTheme(activeTheme);
	const diffStyle = getDiffViewerStyle(activeTheme, {
		fontFamily: fontSettings?.editorFontFamily ?? undefined,
		fontSize: fontSettings?.editorFontSize ?? undefined,
	});

	return (
		<MultiFileDiff
			oldFile={{ name: filePath, contents: contents.original }}
			newFile={{ name: filePath, contents: contents.modified }}
			className={cn("bg-background", className)}
			style={{
				...diffStyle,
				...style,
			}}
			options={{
				diffStyle: viewMode === "side-by-side" ? "split" : "unified",
				expandUnchanged: !hideUnchangedRegions,
				theme: shikiTheme,
				themeType,
				overflow: "wrap",
				disableFileHeader: true,
			}}
		/>
	);
}
