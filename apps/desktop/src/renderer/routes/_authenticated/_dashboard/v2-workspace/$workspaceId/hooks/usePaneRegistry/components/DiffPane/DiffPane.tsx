import type {
	CodeViewItem,
	DiffLineAnnotation,
	LineAnnotation,
} from "@pierre/diffs";
import { CodeView, type CodeViewHandle } from "@pierre/diffs/react";
import type { RendererContext } from "@superset/panes";
import { Button } from "@superset/ui/button";
import { useCallback, useMemo, useRef } from "react";
import { LuFileCode } from "react-icons/lu";
import type { DiffPaneData, PaneViewerData } from "../../../../types";
import { type ChangesetFile, useChangeset } from "../../../useChangeset";
import { useOpenInExternalEditor } from "../../../useOpenInExternalEditor";
import { useSidebarDiffRef } from "../../../useSidebarDiffRef";
import { useViewedFiles } from "../../../useViewedFiles";
import { AgentCommentComposer } from "./components/AgentCommentComposer";
import { CommentThread } from "./components/CommentThread";
import { DiffHeaderMetadata } from "./components/DiffHeaderMetadata";
import { DiffHeaderPrefix } from "./components/DiffHeaderPrefix";
import {
	type DiffAnnotationMetadata,
	useDiffAnnotationsByPath,
} from "./hooks/useDiffAnnotations";
import { useDiffCodeViewItems } from "./hooks/useDiffCodeViewItems";
import { useDiffCodeViewScroll } from "./hooks/useDiffCodeViewScroll";
import { useDiffCodeViewTheme } from "./hooks/useDiffCodeViewTheme";
import { useDiffCommentComposer } from "./hooks/useDiffCommentComposer";

interface CreateNewAgentSessionInput {
	configId: string;
	placement: "split-pane" | "new-tab";
	prompt: string;
}

interface DiffPaneProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
	onCreateNewAgentSession?: (
		input: CreateNewAgentSessionInput,
	) => Promise<{ terminalId: string } | null>;
}

export function DiffPane({
	context,
	workspaceId,
	onOpenFile,
	onCreateNewAgentSession,
}: DiffPaneProps) {
	const data = context.pane.data as DiffPaneData;
	const codeViewRef = useRef<CodeViewHandle<DiffAnnotationMetadata>>(null);

	const ref = useSidebarDiffRef(workspaceId);
	const { files, isLoading } = useChangeset({ workspaceId, ref });
	const { viewedSet, setViewed } = useViewedFiles(workspaceId);
	const openInExternalEditor = useOpenInExternalEditor(workspaceId);
	const threadAnnotationsByPath = useDiffAnnotationsByPath({ workspaceId });

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

	// fileByItemId is produced by useDiffCodeViewItems below, but the composer
	// hook needs access to look files up at submit time. Funnel through a
	// stable ref so the composer hook can be wired before items are computed
	// and still read the latest map when its submit callback fires.
	const fileByItemIdRef = useRef<ReadonlyMap<string, ChangesetFile>>(new Map());
	const getFile = useCallback(
		(itemId: string) => fileByItemIdRef.current.get(itemId),
		[],
	);

	const {
		composerAnnotationsByItemId,
		onLineSelectionEnd,
		onGutterUtilityClick,
		clear: clearComposer,
		submit: submitComposer,
	} = useDiffCommentComposer({
		workspaceId,
		codeViewRef,
		getFile,
		onCreateNewAgentSession,
	});

	const { items, fileByItemId, pathToItemId, hasPendingDiff, hasDiffError } =
		useDiffCodeViewItems({
			workspaceId,
			files,
			collapsedSet,
			annotationsByPath: threadAnnotationsByPath,
			extraAnnotationsByItemId: composerAnnotationsByItemId,
		});
	fileByItemIdRef.current = fileByItemId;

	const { targetItemId } = useDiffCodeViewScroll({
		codeViewRef,
		data,
		fileByItemId,
		pathToItemId,
		items,
		collapsedSet,
		setCollapsed,
	});

	const { options, style } = useDiffCodeViewTheme();

	const codeViewOptions = useMemo(
		() => ({
			...options,
			enableLineSelection: true,
			enableGutterUtility: true,
			onGutterUtilityClick,
			onLineSelectionEnd,
		}),
		[options, onGutterUtilityClick, onLineSelectionEnd],
	);

	const renderHeaderPrefix = useCallback(
		(item: CodeViewItem<DiffAnnotationMetadata>) => {
			const file = fileByItemId.get(item.id);
			if (!file) return null;
			return (
				<DiffHeaderPrefix
					file={file}
					collapsed={collapsedSet.has(file.path)}
					onSetCollapsed={setCollapsed}
				/>
			);
		},
		[fileByItemId, collapsedSet, setCollapsed],
	);

	const renderHeaderMetadata = useCallback(
		(item: CodeViewItem<DiffAnnotationMetadata>) => {
			const file = fileByItemId.get(item.id);
			if (!file) return null;
			return (
				<DiffHeaderMetadata
					file={file}
					workspaceId={workspaceId}
					onSetCollapsed={setCollapsed}
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
			setCollapsed,
			viewedSet,
			setViewed,
			onOpenFile,
			openInExternalEditor,
		],
	);

	const renderAnnotation = useCallback(
		(
			annotation:
				| LineAnnotation<DiffAnnotationMetadata>
				| DiffLineAnnotation<DiffAnnotationMetadata>,
			item: CodeViewItem<DiffAnnotationMetadata>,
		) => {
			const m = annotation.metadata;
			if (m.kind === "binary-placeholder") {
				if (item.type !== "file") return null;
				const file = fileByItemId.get(item.id);
				if (!file) return null;
				return <BinaryDiffPlaceholder file={file} onOpenFile={onOpenFile} />;
			}
			if (m.kind === "composer") {
				if (item.type !== "diff") return null;
				return (
					<AgentCommentComposer
						workspaceId={workspaceId}
						startLine={m.startLine}
						endLine={m.endLine}
						onCancel={clearComposer}
						onSubmit={submitComposer}
					/>
				);
			}
			if (m.kind !== "thread") return null;
			const annotationSide = "side" in annotation ? annotation.side : undefined;
			const focusLine = m.sourceLine ?? annotation.lineNumber;
			const focused =
				item.id === targetItemId &&
				data.focusLine != null &&
				focusLine === data.focusLine &&
				(data.focusSide == null || annotationSide === data.focusSide);

			return (
				<CommentThread
					workspaceId={workspaceId}
					threadId={m.threadId}
					isResolved={m.isResolved}
					isOutdated={m.isOutdated}
					url={m.url}
					comments={m.comments}
					focusTick={focused ? data.focusTick : undefined}
				/>
			);
		},
		[
			workspaceId,
			targetItemId,
			data.focusLine,
			data.focusSide,
			data.focusTick,
			clearComposer,
			submitComposer,
			fileByItemId,
			onOpenFile,
		],
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
			<div className="flex h-full w-full cursor-text select-text items-center justify-center text-sm text-muted-foreground">
				{hasPendingDiff
					? "Loading…"
					: hasDiffError
						? "Unable to load diff"
						: null}
			</div>
		);
	}

	return (
		<CodeView<DiffAnnotationMetadata>
			ref={codeViewRef}
			className="h-full w-full overflow-y-auto overflow-x-clip overscroll-contain [overflow-anchor:none]"
			style={style}
			items={items}
			options={codeViewOptions}
			renderHeaderPrefix={renderHeaderPrefix}
			renderHeaderMetadata={renderHeaderMetadata}
			renderAnnotation={renderAnnotation}
		/>
	);
}

function BinaryDiffPlaceholder({
	file,
	onOpenFile,
}: {
	file: ChangesetFile;
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
}) {
	const canOpen = file.status !== "deleted";

	return (
		<div className="flex flex-col items-center justify-center gap-3 bg-muted/30 py-8 text-muted-foreground">
			<LuFileCode className="size-8" />
			<p className="cursor-text select-text text-sm">Binary file hidden</p>
			{canOpen ? (
				<Button
					variant="outline"
					size="sm"
					onClick={() => onOpenFile(file.path)}
				>
					Open file
				</Button>
			) : null}
		</div>
	);
}
