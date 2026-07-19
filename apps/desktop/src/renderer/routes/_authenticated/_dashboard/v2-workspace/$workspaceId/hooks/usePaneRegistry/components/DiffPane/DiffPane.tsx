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
import {
	createPaneScrollStateKey,
	getPaneScrollState,
	savePaneScrollState,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/paneScrollStateCache";
import { MarkdownSearch } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/FileViewerPane/components/MarkdownSearch";
import type { DiffPaneData, PaneViewerData } from "../../../../types";
import {
	type ChangesetFile,
	getChangesetFileKey,
	useChangeset,
} from "../../../useChangeset";
import { useOpenInExternalEditor } from "../../../useOpenInExternalEditor";
import { useSidebarDiffRef } from "../../../useSidebarDiffRef";
import { useViewedFiles } from "../../../useViewedFiles";
import { AgentCommentComposer } from "./components/AgentCommentComposer";
import { CommentThread } from "./components/CommentThread";
import { DiffHeaderMetadata } from "./components/DiffHeaderMetadata";
import { DiffHeaderPrefix } from "./components/DiffHeaderPrefix";
import { DiffSectionBar } from "./components/DiffSectionBar";
import { useDiffActiveSection } from "./hooks/useDiffActiveSection";
import {
	type DiffAnnotationMetadata,
	useDiffAnnotationsByPath,
} from "./hooks/useDiffAnnotations";
import { useDiffCodeViewItems } from "./hooks/useDiffCodeViewItems";
import { useDiffCodeViewScroll } from "./hooks/useDiffCodeViewScroll";
import { useDiffCodeViewTheme } from "./hooks/useDiffCodeViewTheme";
import { useDiffCommentComposer } from "./hooks/useDiffCommentComposer";
import { useDiffPaneSearch } from "./hooks/useDiffPaneSearch";

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
	const searchContainerRef = useRef<HTMLDivElement>(null);

	const ref = useSidebarDiffRef(workspaceId);
	const scrollStateKey = useMemo(
		() =>
			createPaneScrollStateKey({
				workspaceId,
				paneId: context.pane.id,
				viewId: "diff",
				resourceId: JSON.stringify(ref),
			}),
		[workspaceId, context.pane.id, ref],
	);
	const initialScrollState = useMemo(
		() => getPaneScrollState(scrollStateKey),
		[scrollStateKey],
	);
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
		(changeKey: string, value: boolean) => {
			const current = dataRef.current;
			const collapsed = current.collapsedFiles ?? [];
			const has = collapsed.includes(changeKey);
			if (value === has) return;
			const next = value
				? [...collapsed, changeKey]
				: collapsed.filter((key) => key !== changeKey);
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

	const { items, fileByItemId, hasPendingDiff, hasDiffError } =
		useDiffCodeViewItems({
			workspaceId,
			files,
			collapsedSet,
			annotationsByPath: threadAnnotationsByPath,
			extraAnnotationsByItemId: composerAnnotationsByItemId,
		});
	fileByItemIdRef.current = fileByItemId;

	const search = useDiffPaneSearch({
		containerRef: searchContainerRef,
		codeViewRef,
		items,
		fileByItemId,
		collapsedSet,
		setCollapsed,
		isActive: context.isActive,
		paneId: context.pane.id,
	});

	const { targetItemId } = useDiffCodeViewScroll({
		codeViewRef,
		data,
		fileByItemId,
		items,
		collapsedSet,
		setCollapsed,
		scrollStateKey,
		initialScrollState,
	});

	// The section bar lives outside the scroller: Pierre pins one header at a
	// time within its own box, so a body-less in-flow section item couldn't stay
	// pinned across its group.
	const { currentSection, onScroll } = useDiffActiveSection({
		codeViewRef,
		items,
		fileByItemId,
		files,
	});
	const handleScroll = useCallback(
		(scrollTop: number) => {
			savePaneScrollState(scrollStateKey, { scrollTop, scrollLeft: 0 });
			onScroll();
		},
		[scrollStateKey, onScroll],
	);
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
			const changeKey = getChangesetFileKey(file);
			return (
				<DiffHeaderPrefix
					file={file}
					collapsed={collapsedSet.has(changeKey)}
					onSetCollapsed={(value) => setCollapsed(changeKey, value)}
				/>
			);
		},
		[fileByItemId, collapsedSet, setCollapsed],
	);

	const renderHeaderMetadata = useCallback(
		(item: CodeViewItem<DiffAnnotationMetadata>) => {
			const file = fileByItemId.get(item.id);
			if (!file) return null;
			const changeKey = getChangesetFileKey(file);
			return (
				<DiffHeaderMetadata
					file={file}
					workspaceId={workspaceId}
					onSetCollapsed={(value) => setCollapsed(changeKey, value)}
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
		<div className="flex h-full w-full flex-col">
			{currentSection ? (
				<DiffSectionBar
					kind={currentSection.kind}
					count={currentSection.count}
				/>
			) : null}
			<div ref={searchContainerRef} className="relative min-h-0 w-full flex-1">
				<MarkdownSearch
					isOpen={search.isSearchOpen}
					query={search.query}
					caseSensitive={search.caseSensitive}
					matchCount={search.matchCount}
					activeMatchIndex={search.activeMatchIndex}
					onQueryChange={search.setQuery}
					onCaseSensitiveChange={search.setCaseSensitive}
					onFindNext={search.findNext}
					onFindPrevious={search.findPrevious}
					onClose={search.closeSearch}
				/>
				<CodeView<DiffAnnotationMetadata>
					ref={codeViewRef}
					className="h-full w-full overflow-y-auto overflow-x-clip overscroll-contain [overflow-anchor:none]"
					style={style}
					items={items}
					options={codeViewOptions}
					onScroll={handleScroll}
					renderHeaderPrefix={renderHeaderPrefix}
					renderHeaderMetadata={renderHeaderMetadata}
					renderAnnotation={renderAnnotation}
				/>
			</div>
		</div>
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
