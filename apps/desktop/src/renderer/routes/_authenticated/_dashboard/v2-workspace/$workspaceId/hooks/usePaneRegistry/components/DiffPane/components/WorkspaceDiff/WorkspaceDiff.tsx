import { MultiFileDiff } from "@pierre/diffs/react";
import { workspaceTrpc } from "@superset/workspace-client";
import { useQuery } from "@tanstack/react-query";
import { memo, useCallback, useMemo } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	getDiffsTheme,
	getDiffViewerStyle,
} from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { useResolvedTheme, useTerminalTheme } from "renderer/stores/theme";
import type { DiffFileSource } from "../../../../../useChangeset";
import { CommentThread } from "../CommentThread";
import { DiffFileHeader } from "../DiffFileHeader";
import {
	type DiffCommentThread,
	useDiffAnnotations,
} from "./hooks/useDiffAnnotations";

interface WorkspaceDiffProps {
	workspaceId: string;
	path: string;
	status: string;
	source: DiffFileSource;
	additions: number;
	deletions: number;
	diffStyle: "split" | "unified";
	expandUnchanged: boolean;
	onToggleExpandUnchanged: () => void;
	collapsed: boolean;
	onToggleCollapsed: () => void;
	viewed: boolean;
	onToggleViewed: () => void;
	onOpenFile?: (openInNewTab?: boolean) => void;
	onOpenInExternalEditor?: () => void;
	onDiscard?: () => void;
	focusLine?: number;
	focusTick?: number;
}

export const WorkspaceDiff = memo(function WorkspaceDiff({
	workspaceId,
	path,
	status,
	source,
	additions,
	deletions,
	diffStyle,
	expandUnchanged,
	onToggleExpandUnchanged,
	collapsed,
	onToggleCollapsed,
	viewed,
	onToggleViewed,
	onOpenFile,
	onOpenInExternalEditor,
	onDiscard,
	focusLine,
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

	const lineAnnotations = useDiffAnnotations({ workspaceId, path });
	const renderAnnotation = useCallback(
		(annotation: { lineNumber: number; metadata: DiffCommentThread }) => (
			<CommentThread
				workspaceId={workspaceId}
				threadId={annotation.metadata.threadId}
				isResolved={annotation.metadata.isResolved}
				isOutdated={annotation.metadata.isOutdated}
				url={annotation.metadata.url}
				comments={annotation.metadata.comments}
				focusTick={
					focusLine != null && annotation.lineNumber === focusLine
						? focusTick
						: undefined
				}
			/>
		),
		[workspaceId, focusLine, focusTick],
	);

	return (
		<div className="flex flex-col">
			<DiffFileHeader
				path={path}
				status={status}
				additions={additions}
				deletions={deletions}
				expandUnchanged={expandUnchanged}
				onToggleExpandUnchanged={onToggleExpandUnchanged}
				collapsed={collapsed}
				onToggleCollapsed={onToggleCollapsed}
				viewed={viewed}
				onToggleViewed={onToggleViewed}
				onOpenFile={onOpenFile}
				onOpenInExternalEditor={onOpenInExternalEditor}
				onDiscard={onDiscard}
			/>
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
