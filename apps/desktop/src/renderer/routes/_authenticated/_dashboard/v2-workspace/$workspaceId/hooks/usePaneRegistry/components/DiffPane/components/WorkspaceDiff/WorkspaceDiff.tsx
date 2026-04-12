import { MultiFileDiff } from "@pierre/diffs/react";
import { workspaceTrpc } from "@superset/workspace-client";
import { memo, useMemo } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	getDiffsTheme,
	getDiffViewerStyle,
} from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { useResolvedTheme } from "renderer/stores/theme";
import { DiffFileHeader } from "../DiffFileHeader";

interface ThreadAnnotation {
	side: "deletions" | "additions";
	lineNumber: number;
	metadata: {
		threadId: string;
		isResolved: boolean;
		comments: Array<{
			id: string;
			authorLogin: string;
			avatarUrl?: string;
			body: string;
			createdAt?: number;
		}>;
	};
}

interface WorkspaceDiffProps {
	workspaceId: string;
	path: string;
	category: "against-base" | "staged" | "unstaged";
	additions: number;
	deletions: number;
	annotations?: ThreadAnnotation[];
	diffStyle: "split" | "unified";
	expandUnchanged: boolean;
	onToggleExpandUnchanged: () => void;
	collapsed: boolean;
	onToggleCollapsed: () => void;
	viewed: boolean;
	onToggleViewed: () => void;
}

export const WorkspaceDiff = memo(function WorkspaceDiff({
	workspaceId,
	path,
	category,
	additions,
	deletions,
	diffStyle,
	expandUnchanged,
	onToggleExpandUnchanged,
	collapsed,
	onToggleCollapsed,
	viewed,
	onToggleViewed,
}: WorkspaceDiffProps) {
	const activeTheme = useResolvedTheme();
	const { data: fontSettings } = electronTrpc.settings.getFontSettings.useQuery(
		undefined,
		{ staleTime: 30_000 },
	);
	const shikiTheme = getDiffsTheme(activeTheme);
	const parsedEditorFontSize =
		typeof fontSettings?.editorFontSize === "number"
			? fontSettings.editorFontSize
			: typeof fontSettings?.editorFontSize === "string"
				? Number.parseFloat(fontSettings.editorFontSize)
				: Number.NaN;
	const baseThemeVars = getDiffViewerStyle(activeTheme, {
		fontFamily: fontSettings?.editorFontFamily ?? undefined,
		fontSize: Number.isFinite(parsedEditorFontSize)
			? parsedEditorFontSize
			: undefined,
	});
	// Match the file tree's git decoration colors (v2 WorkspaceFilesTreeItem)
	// so addition/deletion/modified highlights read the same across the pane.
	const gitDecorationColors =
		activeTheme.type === "dark"
			? {
					addition: "var(--color-green-400)",
					deletion: "var(--color-red-500)",
					modified: "var(--color-yellow-400)",
				}
			: {
					addition: "var(--color-green-700)",
					deletion: "var(--color-red-700)",
					modified: "var(--color-yellow-600)",
				};
	const themeVars = {
		...baseThemeVars,
		"--diffs-addition-color-override": gitDecorationColors.addition,
		"--diffs-deletion-color-override": gitDecorationColors.deletion,
		"--diffs-modified-color-override": gitDecorationColors.modified,
	};

	const diffQuery = workspaceTrpc.git.getDiff.useQuery(
		{ workspaceId, path, category },
		{ staleTime: Number.POSITIVE_INFINITY },
	);

	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const worktreePath = workspaceQuery.data?.worktreePath;

	const { copyToClipboard } = useCopyToClipboard();
	const newContents = diffQuery.data?.newFile.contents;
	const handleCopyContents = useMemo(
		() =>
			newContents != null ? () => copyToClipboard(newContents) : undefined,
		[newContents, copyToClipboard],
	);

	const discardMutation = electronTrpc.changes.discardChanges.useMutation();
	const handleDiscard = useMemo(() => {
		if (category !== "unstaged" || !worktreePath) return undefined;
		return () => {
			discardMutation.mutate({ worktreePath, filePath: path });
		};
	}, [category, worktreePath, discardMutation, path]);

	return (
		<div className="flex flex-col overflow-hidden rounded-md border border-border">
			<DiffFileHeader
				path={path}
				additions={additions}
				deletions={deletions}
				expandUnchanged={expandUnchanged}
				onToggleExpandUnchanged={onToggleExpandUnchanged}
				collapsed={collapsed}
				onToggleCollapsed={onToggleCollapsed}
				viewed={viewed}
				onToggleViewed={onToggleViewed}
				onCopyContents={handleCopyContents}
				onDiscard={handleDiscard}
			/>
			{diffQuery.data ? (
				<MultiFileDiff
					oldFile={diffQuery.data.oldFile}
					newFile={diffQuery.data.newFile}
					style={themeVars}
					options={{
						diffStyle,
						expandUnchanged,
						overflow: "wrap",
						collapsed,
						disableFileHeader: true,
						theme: shikiTheme,
						themeType: activeTheme.type,
						unsafeCSS: `
							* {
								user-select: text;
								-webkit-user-select: text;
							}
						`,
					}}
				/>
			) : null}
		</div>
	);
});
