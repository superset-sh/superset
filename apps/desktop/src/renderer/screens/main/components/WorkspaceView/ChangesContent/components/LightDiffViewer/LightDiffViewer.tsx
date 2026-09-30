import { MultiFileDiff } from "@pierre/diffs/react";
import { cn } from "@superset/ui/utils";
import { type CSSProperties, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	getDiffsTheme,
	getDiffViewerStyle,
} from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { useResolvedTheme } from "renderer/stores/theme";
import type { DiffViewMode, FileContents } from "shared/changes-types";

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
	const activeTheme = useResolvedTheme();
	const { data: fontSettings } = electronTrpc.settings.getFontSettings.useQuery(
		undefined,
		{
			staleTime: 30_000,
		},
	);
	const shikiTheme = getDiffsTheme(activeTheme);
	const parsedEditorFontSize =
		typeof fontSettings?.editorFontSize === "number"
			? fontSettings.editorFontSize
			: typeof fontSettings?.editorFontSize === "string"
				? Number.parseFloat(fontSettings.editorFontSize)
				: Number.NaN;
	const diffStyle = getDiffViewerStyle(activeTheme, {
		fontFamily: fontSettings?.editorFontFamily ?? undefined,
		fontSize: Number.isFinite(parsedEditorFontSize)
			? parsedEditorFontSize
			: undefined,
	});

	// @pierre/diffs memoizes the parsed diff on the identity of these objects.
	// Re-creating them on every render makes it re-parse and rebuild the whole
	// diff DOM, which resets the container's scroll position back to the top.
	const oldFile = useMemo(
		() => ({ name: filePath, contents: contents.original }),
		[filePath, contents.original],
	);
	const newFile = useMemo(
		() => ({ name: filePath, contents: contents.modified }),
		[filePath, contents.modified],
	);

	return (
		<MultiFileDiff
			oldFile={oldFile}
			newFile={newFile}
			className={cn(className)}
			style={{
				...diffStyle,
				...style,
			}}
			options={{
				diffStyle: viewMode === "side-by-side" ? "split" : "unified",
				expandUnchanged: !hideUnchangedRegions,
				theme: shikiTheme,
				themeType: activeTheme.type,
				overflow: "wrap",
				disableFileHeader: true,
				unsafeCSS: `
					* {
						user-select: text;
						-webkit-user-select: text;
					}
				`,
			}}
		/>
	);
}
