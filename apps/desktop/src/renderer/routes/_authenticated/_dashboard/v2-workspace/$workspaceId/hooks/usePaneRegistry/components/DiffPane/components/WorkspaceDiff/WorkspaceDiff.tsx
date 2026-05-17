import { type DiffLineAnnotation, MultiFileDiff } from "@pierre/diffs/react";
import { workspaceTrpc } from "@superset/workspace-client";
import { useQuery } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useMemo } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	getDiffsTheme,
	getDiffViewerStyle,
} from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { useResolvedTheme, useTerminalTheme } from "renderer/stores/theme";
import type { DiffFileSource } from "../../../../../useChangeset";
import { CommentThread } from "../CommentThread";
import {
	type DiffCommentThread,
	useDiffAnnotations,
} from "./hooks/useDiffAnnotations";
import { getRenderedDiffLineIndex } from "./utils/getRenderedDiffLineIndex";

type DiffFocusSide = "deletions" | "additions";

interface WorkspaceDiffProps {
	workspaceId: string;
	path: string;
	oldPath?: string;
	source: DiffFileSource;
	diffStyle: "split" | "unified";
	expandUnchanged: boolean;
	collapsed: boolean;
	focusLine?: number;
	focusSide?: DiffFocusSide;
	focusTick?: number;
}

export const WorkspaceDiff = memo(function WorkspaceDiff({
	workspaceId,
	path,
	oldPath,
	source,
	diffStyle,
	expandUnchanged,
	collapsed,
	focusLine,
	focusSide,
	focusTick,
}: WorkspaceDiffProps) {
	const activeTheme = useResolvedTheme();
	const terminalTheme = useTerminalTheme();
	const { data: fontSettings } = useQuery({
		queryKey: ["electron", "settings", "getFontSettings"],
		queryFn: () => electronTrpcClient.settings.getFontSettings.query(),
		staleTime: 30_000,
	});
	const shikiTheme = getDiffsTheme(activeTheme);
	const parsedEditorFontSize =
		typeof fontSettings?.editorFontSize === "number"
			? fontSettings.editorFontSize
			: typeof fontSettings?.editorFontSize === "string"
				? Number.parseFloat(fontSettings.editorFontSize)
				: Number.NaN;
	// Match the terminal pane's surface color so the diff body blends with
	// the chrome. The actual override happens in unsafeCSS below — this just
	// paints the wrapper before the diff mounts.
	const surfaceBg = terminalTheme?.background ?? "var(--background)";
	const themeVars = {
		...getDiffViewerStyle(activeTheme, {
			fontFamily: fontSettings?.editorFontFamily ?? undefined,
			fontSize: Number.isFinite(parsedEditorFontSize)
				? parsedEditorFontSize
				: undefined,
		}),
		backgroundColor: surfaceBg,
	};

	const diffInput = useMemo(() => {
		if (source.kind === "against-base") {
			return {
				workspaceId,
				path,
				category: "against-base" as const,
				baseBranch: source.baseBranch ?? undefined,
			};
		}
		if (source.kind === "commit") {
			return {
				workspaceId,
				path,
				category: "commit" as const,
				commitHash: source.commitHash,
				fromHash: source.fromHash,
			};
		}
		return { workspaceId, path, category: source.kind };
	}, [workspaceId, path, source]);

	const diffQuery = workspaceTrpc.git.getDiff.useQuery(diffInput, {
		staleTime: Number.POSITIVE_INFINITY,
	});
	const focusRenderedLineIndex = useMemo(() => {
		if (!diffQuery.data || focusLine == null) return undefined;
		return getRenderedDiffLineIndex({
			oldFile: diffQuery.data.oldFile,
			newFile: diffQuery.data.newFile,
			lineNumber: focusLine,
			side: focusSide,
			diffStyle,
		});
	}, [diffQuery.data, diffStyle, focusLine, focusSide]);
	useEffect(() => {
		if (focusRenderedLineIndex == null) return;
		debugReviewDiffJump("computed rendered line index", {
			path,
			focusLine,
			focusSide,
			diffStyle,
			focusRenderedLineIndex,
		});
	}, [diffStyle, focusLine, focusRenderedLineIndex, focusSide, path]);

	const lineAnnotations = useDiffAnnotations({ workspaceId, path, oldPath });
	const renderAnnotation = useCallback(
		(annotation: DiffLineAnnotation<DiffCommentThread>) => {
			const shouldFocus =
				focusLine != null &&
				annotation.lineNumber === focusLine &&
				(focusSide == null || annotation.side === focusSide);

			return (
				<CommentThread
					workspaceId={workspaceId}
					threadId={annotation.metadata.threadId}
					isResolved={annotation.metadata.isResolved}
					isOutdated={annotation.metadata.isOutdated}
					url={annotation.metadata.url}
					comments={annotation.metadata.comments}
					focusTick={shouldFocus ? focusTick : undefined}
				/>
			);
		},
		[workspaceId, focusLine, focusSide, focusTick],
	);

	return (
		<div
			className="flex flex-col"
			data-focus-rendered-line-index={focusRenderedLineIndex}
		>
			{diffQuery.data ? (
				<MultiFileDiff<DiffCommentThread>
					oldFile={diffQuery.data.oldFile}
					newFile={diffQuery.data.newFile}
					style={themeVars}
					lineAnnotations={lineAnnotations}
					renderAnnotation={renderAnnotation}
					options={{
						diffStyle,
						expandUnchanged,
						overflow: "wrap",
						collapsed,
						disableFileHeader: true,
						theme: shikiTheme,
						themeType: activeTheme.type,
						unsafeCSS: `
							* { user-select: text; -webkit-user-select: text; }
							/* Pierre sets --diffs-light-bg/--diffs-dark-bg
							 * inline on <pre data-diff> from the Shiki theme;
							 * inline beats :host so we override at the pre. */
							[data-diff] {
								--diffs-light-bg: ${surfaceBg} !important;
								--diffs-dark-bg: ${surfaceBg} !important;
							}
							/* Flatten the "N unmodified lines" strip flush to
							 * the pane edges (kills wrapper/content/expand-
							 * button rounding + inline gap on both
							 * line-info and line-info-basic). */
							[data-separator^='line-info'] [data-separator-wrapper],
							[data-separator^='line-info'] [data-separator-content],
							[data-separator^='line-info'] [data-expand-up],
							[data-separator^='line-info'] [data-expand-down],
							[data-separator^='line-info'] [data-expand-both] {
								border-radius: 0 !important;
								margin-inline: 0 !important;
								padding-inline: 0 !important;
							}
						`,
					}}
				/>
			) : null}
		</div>
	);
});

function debugReviewDiffJump(
	message: string,
	details: Record<string, unknown>,
) {
	if (
		typeof window === "undefined" ||
		window.localStorage.getItem("superset:review-diff-debug") !== "1"
	) {
		return;
	}
	console.debug(`[review-diff-jump] ${message}`, details);
}
