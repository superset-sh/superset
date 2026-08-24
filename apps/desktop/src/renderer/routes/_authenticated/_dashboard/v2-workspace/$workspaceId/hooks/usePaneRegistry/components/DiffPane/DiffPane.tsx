import type {
	CodeViewItem,
	DiffLineAnnotation,
	LineAnnotation,
	FileContents as PierreFileContents,
} from "@pierre/diffs";
import { Editor, type EditorOptions } from "@pierre/diffs/edit";
import {
	CodeView,
	type CodeViewHandle,
	EditProvider,
} from "@pierre/diffs/react";

import type { RendererContext } from "@superset/panes";
import { alert } from "@superset/ui/atoms/Alert";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuFileCode } from "react-icons/lu";
import {
	createPaneScrollStateKey,
	getPaneScrollState,
	savePaneScrollState,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/paneScrollStateCache";
import { MarkdownSearch } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/FileViewerPane/components/MarkdownSearch";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import type { DiffPaneData, PaneViewerData } from "../../../../types";
import {
	type ChangesetFile,
	getChangesetFileKey,
	useChangeset,
} from "../../../useChangeset";
import { useOpenInExternalEditor } from "../../../useOpenInExternalEditor";
import { useSidebarDiffRef } from "../../../useSidebarDiffRef";
import { useViewedFiles } from "../../../useViewedFiles";
import { AgentCommentComposer } from "../AgentCommentComposer";
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
import { getCharacterOffsetAtClientX } from "./utils/getCharacterOffsetAtClientX";

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

function canEditDiffFile(
	file: ChangesetFile | undefined,
): file is ChangesetFile {
	return (
		file != null &&
		!file.isBinary &&
		file.status !== "deleted" &&
		(file.source.kind === "staged" || file.source.kind === "unstaged")
	);
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
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const writeFile = workspaceTrpc.filesystem.writeFile.useMutation();
	const utils = workspaceTrpc.useUtils();
	const [editingSet, setEditingSet] = useState<ReadonlySet<string>>(new Set());
	const [dirtyItemIds, setDirtyItemIds] = useState<ReadonlySet<string>>(
		new Set(),
	);
	const [editorRevisionByItemId, setEditorRevisionByItemId] = useState<
		ReadonlyMap<string, number>
	>(new Map());
	const editedFilesRef = useRef(new Map<string, PierreFileContents>());
	const pendingEditorFocusRef = useRef<{
		itemId: string;
		lineNumber: number;
		character: number;
	} | null>(null);

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
			editingSet,
			editorRevisionByItemId,
			annotationsByPath: threadAnnotationsByPath,
			extraAnnotationsByItemId: composerAnnotationsByItemId,
		});
	fileByItemIdRef.current = fileByItemId;

	const saveEditedItem = useCallback(
		async (itemId: string): Promise<boolean> => {
			const editedFile = editedFilesRef.current.get(itemId);
			const file = fileByItemId.get(itemId);
			const worktreePath = workspaceQuery.data?.worktreePath;
			if (!editedFile) return true;
			if (!file || !worktreePath) {
				toast.error("Couldn't save edits", {
					description: "The workspace is not ready yet. Try again.",
				});
				return false;
			}
			try {
				const result = await writeFile.mutateAsync({
					workspaceId,
					absolutePath: toAbsoluteWorkspacePath(worktreePath, file.path),
					content: editedFile.contents,
					encoding: "utf-8",
				});
				if (!result.ok) {
					toast.error("Couldn't save edits", {
						description:
							result.reason === "conflict"
								? "The file changed on disk. Review it before saving again."
								: "The file could not be written.",
					});
					return false;
				}
				setDirtyItemIds((current) => {
					const next = new Set(current);
					next.delete(itemId);
					return next;
				});
				void utils.git.getStatus.invalidate({ workspaceId });
				void utils.git.getDiff.invalidate({ workspaceId });
				void utils.git.getDiffBulk.invalidate({ workspaceId });
				return true;
			} catch (error) {
				toast.error("Couldn't save edits", {
					description: error instanceof Error ? error.message : String(error),
				});
				return false;
			}
		},
		[
			fileByItemId,
			workspaceQuery.data?.worktreePath,
			writeFile,
			workspaceId,
			utils,
		],
	);

	const exitEditing = useCallback((itemId: string) => {
		editedFilesRef.current.delete(itemId);
		setDirtyItemIds((current) => {
			const next = new Set(current);
			next.delete(itemId);
			return next;
		});
		setEditingSet(new Set());
	}, []);

	const discardEditing = useCallback(
		(itemId: string) => {
			// Pierre retains editor documents by item id. Rotate the item's version
			// so reopening starts from the diff contents instead of the discarded
			// in-memory document.
			setEditorRevisionByItemId((current) => {
				const next = new Map(current);
				next.set(itemId, (next.get(itemId) ?? 0) + 1);
				return next;
			});
			exitEditing(itemId);
		},
		[exitEditing],
	);

	const requestExitEditing = useCallback(
		(itemId: string) => {
			if (!dirtyItemIds.has(itemId)) {
				discardEditing(itemId);
				return;
			}
			const file = fileByItemId.get(itemId);
			alert({
				title: `Do you want to save the changes you made to ${file?.path.split("/").pop() ?? "this file"}?`,
				description: "Your changes will be lost if you don't save them.",
				actions: [
					{
						label: "Save",
						onClick: () => {
							void saveEditedItem(itemId).then((saved) => {
								if (saved) exitEditing(itemId);
							});
						},
					},
					{
						label: "Don't Save",
						variant: "secondary",
						onClick: () => discardEditing(itemId),
					},
					{ label: "Cancel", variant: "ghost", onClick: () => {} },
				],
			});
		},
		[dirtyItemIds, discardEditing, exitEditing, fileByItemId, saveEditedItem],
	);

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

	const { targetItemId, notifyScroll } = useDiffCodeViewScroll({
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
			notifyScroll();
		},
		[scrollStateKey, onScroll, notifyScroll],
	);
	const { options, style } = useDiffCodeViewTheme();

	const codeViewOptions = useMemo(
		() => ({
			...options,
			enableLineSelection: true,
			enableGutterUtility: true,
			onGutterUtilityClick,
			onLineSelectionEnd,
			onLineClick: (
				line: {
					annotationSide?: string;
					event: PointerEvent;
					lineElement: HTMLElement;
					lineNumber: number;
					numberColumn: boolean;
				},
				itemContext: { item: CodeViewItem<DiffAnnotationMetadata> },
			) => {
				if (
					line.numberColumn ||
					(line.annotationSide != null &&
						line.annotationSide !== "additions") ||
					editingSet.size > 0
				)
					return;
				const file = fileByItemId.get(itemContext.item.id);
				if (!canEditDiffFile(file)) return;
				pendingEditorFocusRef.current = {
					itemId: itemContext.item.id,
					lineNumber: line.lineNumber,
					character: getCharacterOffsetAtClientX(
						line.lineElement,
						line.event.clientX,
					),
				};
				setEditingSet(new Set([getChangesetFileKey(file)]));
			},
			onLineEnter: (
				line: {
					annotationSide?: string;
					lineElement: HTMLElement;
					numberColumn: boolean;
				},
				itemContext: { item: CodeViewItem<DiffAnnotationMetadata> },
			) => {
				const file = fileByItemId.get(itemContext.item.id);
				if (
					!line.numberColumn &&
					(line.annotationSide == null ||
						line.annotationSide === "additions") &&
					canEditDiffFile(file)
				) {
					line.lineElement.style.cursor = "text";
				}
			},
			onLineLeave: (line: { lineElement: HTMLElement }) => {
				line.lineElement.style.removeProperty("cursor");
			},
		}),
		[
			options,
			onGutterUtilityClick,
			onLineSelectionEnd,
			editingSet,
			fileByItemId,
		],
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
			const isEditing = editingSet.has(changeKey);
			return (
				<DiffHeaderMetadata
					file={file}
					workspaceId={workspaceId}
					onSetCollapsed={(value) => setCollapsed(changeKey, value)}
					viewed={viewedSet.has(file.path)}
					onSetViewed={setViewed}
					onOpenFile={onOpenFile}
					onOpenInExternalEditor={openInExternalEditor}
					isEditing={isEditing}
					isDirty={dirtyItemIds.has(item.id)}
					isSaving={writeFile.isPending}
					onSaveEditing={
						isEditing ? () => void saveEditedItem(item.id) : undefined
					}
					onCancelEditing={
						isEditing ? () => requestExitEditing(item.id) : undefined
					}
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
			editingSet,
			dirtyItemIds,
			writeFile.isPending,
			saveEditedItem,
			requestExitEditing,
		],
	);

	const createEditor = useCallback(
		(options: EditorOptions<DiffAnnotationMetadata>) =>
			new Editor<DiffAnnotationMetadata>(options),
		[],
	);
	const handleItemEditChange = useCallback(
		(
			item: CodeViewItem<DiffAnnotationMetadata>,
			editedFile: PierreFileContents,
		) => {
			editedFilesRef.current.set(item.id, editedFile);
			setDirtyItemIds((current) => new Set(current).add(item.id));
		},
		[],
	);

	// The activating click happens before Pierre mounts its editor. Restore that
	// click's line intent as soon as the controlled item enters edit mode.
	useEffect(() => {
		const pending = pendingEditorFocusRef.current;
		if (!pending || editingSet.size === 0) return;
		const frame = requestAnimationFrame(() => {
			const editor = codeViewRef.current?.getEditor(pending.itemId);
			if (!(editor instanceof Editor)) return;
			pendingEditorFocusRef.current = null;
			editor.focus({
				lineNumber: pending.lineNumber,
				character: pending.character,
			});
		});
		return () => cancelAnimationFrame(frame);
	}, [editingSet]);

	const activeEditingItemId = items.find((item) => item.edit)?.id;
	const handleEditorKeyDownCapture = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (!activeEditingItemId) return;
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
				event.preventDefault();
				event.stopPropagation();
				void saveEditedItem(activeEditingItemId);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				requestExitEditing(activeEditingItemId);
			}
		},
		[activeEditingItemId, requestExitEditing, saveEditedItem],
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
						contextLabel={
							m.startLine === m.endLine
								? `Line ${m.startLine}`
								: `Lines ${m.startLine}–${m.endLine}`
						}
						placeholder="Ask the AI about these lines…"
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
			<div
				ref={searchContainerRef}
				className="relative min-h-0 w-full flex-1"
				onKeyDownCapture={handleEditorKeyDownCapture}
			>
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
				<EditProvider<DiffAnnotationMetadata> createEditor={createEditor}>
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
						onItemEditChange={handleItemEditChange}
					/>
				</EditProvider>
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
