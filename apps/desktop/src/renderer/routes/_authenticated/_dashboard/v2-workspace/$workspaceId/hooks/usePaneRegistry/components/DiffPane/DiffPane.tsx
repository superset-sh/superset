import type {
	CodeViewItem,
	DiffLineAnnotation,
	LineAnnotation,
} from "@pierre/diffs";
import { CodeView, type CodeViewHandle } from "@pierre/diffs/react";
import type { RendererContext } from "@superset/panes";
import { useCallback, useMemo, useRef, useState } from "react";
import { useSettings } from "renderer/stores/settings";
import type { DiffPaneData, PaneViewerData } from "../../../../types";
import { useChangeset } from "../../../useChangeset";
import { useOpenInExternalEditor } from "../../../useOpenInExternalEditor";
import { useSidebarDiffRef } from "../../../useSidebarDiffRef";
import { useViewedFiles } from "../../../useViewedFiles";
import { CommentThread } from "./components/CommentThread";
import { DiffCodeViewHeader } from "./components/DiffCodeViewHeader";
import {
	type DiffCommentThread,
	useDiffAnnotationsByPath,
} from "./hooks/useDiffAnnotations";
import { useDiffCodeViewItems } from "./hooks/useDiffCodeViewItems";
import { useDiffCodeViewScroll } from "./hooks/useDiffCodeViewScroll";
import { useDiffCodeViewTheme } from "./hooks/useDiffCodeViewTheme";

interface DiffPaneProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
}

export function DiffPane({ context, workspaceId, onOpenFile }: DiffPaneProps) {
	const data = context.pane.data as DiffPaneData;
	const codeViewRef = useRef<CodeViewHandle<DiffCommentThread>>(null);

	const diffStyle = useSettings((s) => s.diffStyle);
	const ref = useSidebarDiffRef(workspaceId);
	const { files, isLoading } = useChangeset({ workspaceId, ref });
	const { viewedSet, setViewed } = useViewedFiles(workspaceId);
	const openInExternalEditor = useOpenInExternalEditor(workspaceId);
	const annotationsByPath = useDiffAnnotationsByPath({ workspaceId });
	const [expandUnchanged, setExpandUnchanged] = useState(false);
	const { options, style } = useDiffCodeViewTheme({
		diffStyle,
		expandUnchanged,
	});

	const collapsedSet = useMemo(
		() => new Set(data.collapsedFiles ?? []),
		[data.collapsedFiles],
	);

	const dataRef = useRef(data);
	dataRef.current = data;
	const updateData = context.actions.updateData;
	const setCollapsed = useCallback(
		(path: string, value: boolean) => {
			const current = dataRef.current;
			const collapsed = current.collapsedFiles ?? [];
			const has = collapsed.includes(path);
			if (value === has) return;
			const next = value
				? [...collapsed, path]
				: collapsed.filter((p) => p !== path);
			updateData({ ...current, collapsedFiles: next } as PaneViewerData);
		},
		[updateData],
	);

	const { items, fileByItemId, pathToItemId, hasPendingDiff, hasDiffError } =
		useDiffCodeViewItems({
			workspaceId,
			files,
			collapsedSet,
			annotationsByPath,
		});

	const { targetItemId } = useDiffCodeViewScroll({
		codeViewRef,
		data,
		fileByItemId,
		pathToItemId,
		items,
		collapsedSet,
		setCollapsed,
	});

	const renderCustomHeader = useCallback(
		(item: CodeViewItem<DiffCommentThread>) => {
			const file = fileByItemId.get(item.id);
			if (!file) return null;

			return (
				<DiffCodeViewHeader
					file={file}
					workspaceId={workspaceId}
					collapsed={collapsedSet.has(file.path)}
					onSetCollapsed={setCollapsed}
					expandUnchanged={expandUnchanged}
					onToggleExpandUnchanged={() =>
						setExpandUnchanged((current) => !current)
					}
					viewed={viewedSet.has(file.path)}
					onSetViewed={setViewed}
					onOpenFile={onOpenFile}
					onOpenInExternalEditor={openInExternalEditor}
				/>
			);
		},
		[
			fileByItemId,
			workspaceId,
			collapsedSet,
			setCollapsed,
			expandUnchanged,
			viewedSet,
			setViewed,
			onOpenFile,
			openInExternalEditor,
		],
	);

	const renderAnnotation = useCallback(
		(
			annotation:
				| LineAnnotation<DiffCommentThread>
				| DiffLineAnnotation<DiffCommentThread>,
			item: CodeViewItem<DiffCommentThread>,
		) => {
			if (item.type !== "diff") return null;
			const annotationSide = "side" in annotation ? annotation.side : undefined;
			const focused =
				item.id === targetItemId &&
				data.focusLine != null &&
				annotation.lineNumber === data.focusLine &&
				(data.focusSide == null || annotationSide === data.focusSide);

			return (
				<CommentThread
					workspaceId={workspaceId}
					threadId={annotation.metadata.threadId}
					isResolved={annotation.metadata.isResolved}
					isOutdated={annotation.metadata.isOutdated}
					url={annotation.metadata.url}
					comments={annotation.metadata.comments}
					focusTick={focused ? data.focusTick : undefined}
				/>
			);
		},
		[workspaceId, targetItemId, data.focusLine, data.focusSide, data.focusTick],
	);

	if (files.length === 0) {
		return (
			<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
				{isLoading ? "Loading…" : "No changes"}
			</div>
		);
	}

	if (items.length === 0) {
		return (
			<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
				{hasPendingDiff
					? "Loading…"
					: hasDiffError
						? "Unable to load diff"
						: null}
			</div>
		);
	}

	return (
		<CodeView<DiffCommentThread>
			ref={codeViewRef}
			className="h-full w-full overflow-y-auto overflow-x-clip overscroll-contain [overflow-anchor:none]"
			style={style}
			items={items}
			options={options}
			renderCustomHeader={renderCustomHeader}
			renderAnnotation={renderAnnotation}
		/>
	);
}
