import type { DiffLineAnnotation, DiffsThemeNames } from "@pierre/diffs/react";
import { MultiFileDiff } from "@pierre/diffs/react";
import type { PRCommentThread } from "@superset/local-db";
import { useCallback, useMemo } from "react";
import { useThemeStore } from "renderer/stores/theme";
import type { DiffViewMode, FileContents } from "shared/changes-types";
import { PRCommentThread as PRCommentThreadComponent } from "../PRCommentThread";

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

interface LightDiffViewerProps {
	contents: FileContents;
	viewMode: DiffViewMode;
	hideUnchangedRegions?: boolean;
	filePath: string;
	commentThreads?: PRCommentThread[];
}

export function LightDiffViewer({
	contents,
	viewMode,
	hideUnchangedRegions,
	filePath,
	commentThreads,
}: LightDiffViewerProps) {
	const themeId = useThemeStore((s) => s.activeTheme?.id ?? "dark");
	const themeType = useThemeStore((s) =>
		s.activeTheme?.type === "light" ? ("light" as const) : ("dark" as const),
	);

	const theme = SHIKI_THEME_MAP[themeId] ?? DEFAULT_THEMES;

	const lineAnnotations = useMemo(() => {
		if (!commentThreads || commentThreads.length === 0) return undefined;

		const annotations: DiffLineAnnotation<PRCommentThread>[] = [];
		for (const thread of commentThreads) {
			const side =
				thread.side === "LEFT"
					? ("deletions" as const)
					: ("additions" as const);
			const lineNumber =
				side === "additions" ? thread.line : thread.originalLine;
			if (lineNumber == null) continue;

			annotations.push({ side, lineNumber, metadata: thread });
		}
		return annotations.length > 0 ? annotations : undefined;
	}, [commentThreads]);

	const renderAnnotation = useCallback(
		(annotation: DiffLineAnnotation<PRCommentThread>) => {
			return <PRCommentThreadComponent thread={annotation.metadata} />;
		},
		[],
	);

	return (
		<MultiFileDiff<PRCommentThread>
			oldFile={{ name: filePath, contents: contents.original }}
			newFile={{ name: filePath, contents: contents.modified }}
			options={{
				diffStyle: viewMode === "side-by-side" ? "split" : "unified",
				expandUnchanged: !hideUnchangedRegions,
				theme,
				themeType,
				overflow: "wrap",
				disableFileHeader: true,
			}}
			lineAnnotations={lineAnnotations}
			renderAnnotation={lineAnnotations ? renderAnnotation : undefined}
		/>
	);
}
