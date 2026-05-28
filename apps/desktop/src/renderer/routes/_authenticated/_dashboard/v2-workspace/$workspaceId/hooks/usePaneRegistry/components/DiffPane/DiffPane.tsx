import type {
	CodeViewItem,
	CodeViewLineSelection,
	DiffLineAnnotation,
	LineAnnotation,
	SelectedLineRange,
} from "@pierre/diffs";
import { CodeView, type CodeViewHandle } from "@pierre/diffs/react";
import type { RendererContext } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { useCallback, useMemo, useRef, useState } from "react";
import {
	formatAgentPromptWithFileContext,
	useSendToTerminalAgent,
} from "renderer/hooks/host-service/useSendToTerminalAgent";
import type { DiffPaneData, PaneViewerData } from "../../../../types";
import { useChangeset } from "../../../useChangeset";
import { useOpenInExternalEditor } from "../../../useOpenInExternalEditor";
import { useSidebarDiffRef } from "../../../useSidebarDiffRef";
import { useViewedFiles } from "../../../useViewedFiles";
import {
	AgentCommentComposer,
	type AgentTarget,
} from "./components/AgentCommentComposer";
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

interface ComposerState {
	itemId: string;
	range: SelectedLineRange;
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
	const [composer, setComposer] = useState<ComposerState | null>(null);

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

	const handleClearSelection = useCallback(() => {
		setComposer(null);
		codeViewRef.current?.clearSelectedLines();
	}, []);

	const handleSelectedLinesChange = useCallback(
		(selection: CodeViewLineSelection | null) => {
			if (!selection) {
				setComposer(null);
				return;
			}
			setComposer({ itemId: selection.id, range: selection.range });
		},
		[],
	);

	// Synthetic composer annotation pinned to the end of the live selection.
	const composerAnnotationsByItemId = useMemo(() => {
		if (!composer) return null;
		const endSide =
			composer.range.endSide ?? composer.range.side ?? "additions";
		const startSide = composer.range.side ?? endSide;
		const map = new Map<string, DiffLineAnnotation<DiffAnnotationMetadata>[]>();
		map.set(composer.itemId, [
			{
				side: endSide,
				lineNumber: composer.range.end,
				metadata: {
					kind: "composer",
					itemId: composer.itemId,
					startLine: composer.range.start,
					endLine: composer.range.end,
					startSide,
					endSide,
				},
			},
		]);
		return map;
	}, [composer]);

	const { items, fileByItemId, pathToItemId, hasPendingDiff, hasDiffError } =
		useDiffCodeViewItems({
			workspaceId,
			files,
			collapsedSet,
			annotationsByPath: threadAnnotationsByPath,
			extraAnnotationsByItemId: composerAnnotationsByItemId,
		});

	const { send: sendToTerminalAgent } = useSendToTerminalAgent();

	const handleSubmitComposer = useCallback(
		async (input: { comment: string; target: AgentTarget }) => {
			if (!composer) return;
			const file = fileByItemId.get(composer.itemId);
			if (!file) return;

			const text = formatAgentPromptWithFileContext({
				comment: input.comment,
				file: {
					path: file.path,
					startLine: composer.range.start,
					endLine: composer.range.end,
				},
			});

			if (input.target.kind === "new") {
				if (!onCreateNewAgentSession) {
					toast.error("Couldn't start a new agent session");
					return;
				}
				// Host bakes the prompt into the launch command (argv/stdin per
				// the agent config), so we don't follow up with writeInput here.
				const result = await onCreateNewAgentSession({
					configId: input.target.configId,
					placement: input.target.placement,
					prompt: text,
				});
				if (result) handleClearSelection();
				return;
			}

			try {
				await sendToTerminalAgent({
					workspaceId,
					terminalId: input.target.terminalId,
					text,
				});
				handleClearSelection();
			} catch {
				// Toast is shown by the hook; keep composer open so the user
				// can retry or edit.
			}
		},
		[
			composer,
			fileByItemId,
			workspaceId,
			sendToTerminalAgent,
			handleClearSelection,
			onCreateNewAgentSession,
		],
	);

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

	// Pierre gates the gutter "+" button's pointer flow behind a non-null
	// onGutterUtilityClick — without it, clicks/drags on the button itself
	// no-op (InteractionManager.startGutterSelectionFromPointerDown returns
	// early). Drag on the gutter (line numbers) is handled by enableLineSelection
	// and fires onSelectedLinesChange directly; the button uses this callback
	// instead, so we mirror the open here from the CodeView's current selection.
	const handleGutterUtilityClick = useCallback(() => {
		const selection = codeViewRef.current?.getSelectedLines();
		if (selection) {
			setComposer({ itemId: selection.id, range: selection.range });
		}
	}, []);

	const codeViewOptions = useMemo(
		() => ({
			...options,
			enableLineSelection: true,
			enableGutterUtility: true,
			onGutterUtilityClick: handleGutterUtilityClick,
		}),
		[options, handleGutterUtilityClick],
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

	// Pierre fires onSelectedLinesChange when the user clicks the gutter
	// button (single-line selection) or drags through line numbers — so the
	// gutter just needs the visual affordance.

	const renderAnnotation = useCallback(
		(
			annotation:
				| LineAnnotation<DiffAnnotationMetadata>
				| DiffLineAnnotation<DiffAnnotationMetadata>,
			item: CodeViewItem<DiffAnnotationMetadata>,
		) => {
			if (item.type !== "diff") return null;
			const m = annotation.metadata;
			if (m.kind === "composer") {
				return (
					<AgentCommentComposer
						workspaceId={workspaceId}
						startLine={m.startLine}
						endLine={m.endLine}
						onCancel={handleClearSelection}
						onSubmit={handleSubmitComposer}
					/>
				);
			}
			const annotationSide = "side" in annotation ? annotation.side : undefined;
			const focused =
				item.id === targetItemId &&
				data.focusLine != null &&
				annotation.lineNumber === data.focusLine &&
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
			handleClearSelection,
			handleSubmitComposer,
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
			onSelectedLinesChange={handleSelectedLinesChange}
			renderHeaderPrefix={renderHeaderPrefix}
			renderHeaderMetadata={renderHeaderMetadata}
			renderAnnotation={renderAnnotation}
		/>
	);
}
