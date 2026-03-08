import {
	type MutableRefObject,
	type RefObject,
	useEffect,
	useRef,
} from "react";
import { LuLoader } from "react-icons/lu";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { LightDiffViewer } from "renderer/screens/main/components/WorkspaceView/ChangesContent/components/LightDiffViewer";
import type { CodeEditorAdapter } from "renderer/screens/main/components/WorkspaceView/ContentView/components";
import { CodeEditor } from "renderer/screens/main/components/WorkspaceView/components/CodeEditor";
import type { Tab } from "renderer/stores/tabs/types";
import type { DiffViewMode } from "shared/changes-types";
import { detectLanguage } from "shared/detect-language";
import { isImageFile } from "shared/file-types";
import type { FileViewerMode } from "shared/tabs-types";
import { DiffViewerContextMenu } from "../DiffViewerContextMenu";
import { FileEditorContextMenu } from "../FileEditorContextMenu";
import { MarkdownSearch } from "../MarkdownSearch";
import {
	getColumnFromDiffSelection,
	getDiffLocationFromTarget,
	mapDiffLocationToRawPosition,
} from "./utils/diff-location";

interface RawFileData {
	ok: true;
	content: string;
}

interface RawFileError {
	ok: false;
	reason:
		| "too-large"
		| "binary"
		| "outside-worktree"
		| "symlink-escape"
		| "not-found";
}

type RawFileResult = RawFileData | RawFileError | undefined;

interface ImageData {
	ok: true;
	dataUrl: string;
	byteLength: number;
}

interface ImageError {
	ok: false;
	reason:
		| "too-large"
		| "not-image"
		| "outside-worktree"
		| "symlink-escape"
		| "not-found";
}

type ImageResult = ImageData | ImageError | undefined;

interface DiffData {
	original: string;
	modified: string;
	language: string;
}

function getSelectionDebugState(element: HTMLDivElement | null) {
	const selection = window.getSelection();
	const text = selection?.toString() ?? "";
	const range =
		selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

	return {
		hasSelection:
			!!selection && !selection.isCollapsed && selection.rangeCount > 0,
		isCollapsed: selection?.isCollapsed ?? true,
		rangeCount: selection?.rangeCount ?? 0,
		textLength: text.length,
		textPreview: text.slice(0, 80),
		insideDiffContainer:
			!!element && !!range && element.contains(range.commonAncestorContainer),
		commonAncestor:
			range?.commonAncestorContainer instanceof HTMLElement
				? {
						tagName: range.commonAncestorContainer.tagName,
						className: range.commonAncestorContainer.className,
						dataset: { ...range.commonAncestorContainer.dataset },
					}
				: range?.commonAncestorContainer.nodeName,
	};
}

function logDiffSelectionDebug(
	element: HTMLDivElement | null,
	label: string,
	extra?: Record<string, unknown>,
) {
	console.log("[DiffSelectionDebug]", {
		label,
		...getSelectionDebugState(element),
		...extra,
	});
}

function hasActiveSelectionWithinElement(
	element: HTMLDivElement | null,
): boolean {
	if (!element) {
		return false;
	}

	const selection = window.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
		return false;
	}

	for (let index = 0; index < selection.rangeCount; index += 1) {
		const range = selection.getRangeAt(index);
		if (element.contains(range.commonAncestorContainer)) {
			return true;
		}
	}

	return false;
}

interface FileViewerContentProps {
	viewMode: FileViewerMode;
	filePath: string;
	isLoadingRaw: boolean;
	isLoadingImage?: boolean;
	isLoadingDiff: boolean;
	rawFileData: RawFileResult;
	imageData?: ImageResult;
	diffData: DiffData | undefined;
	editorRef: MutableRefObject<CodeEditorAdapter | null>;
	originalContentRef: MutableRefObject<string>;
	draftContentRef: MutableRefObject<string | null>;
	initialLine?: number;
	initialColumn?: number;
	diffViewMode: DiffViewMode;
	hideUnchangedRegions: boolean;
	onSaveRaw: () => Promise<void>;
	onEditorChange: (value: string | undefined) => void;
	setIsDirty: (dirty: boolean) => void;
	onSwitchToRawAtLocation: (line: number, column: number) => void;
	onSplitHorizontal: () => void;
	onSplitVertical: () => void;
	onSplitWithNewChat?: () => void;
	onSplitWithNewBrowser?: () => void;
	onClosePane: () => void;
	currentTabId: string;
	availableTabs: Tab[];
	onMoveToTab: (tabId: string) => void;
	onMoveToNewTab: () => void;
	markdownContainerRef: RefObject<HTMLDivElement | null>;
	markdownSearch: {
		isSearchOpen: boolean;
		query: string;
		caseSensitive: boolean;
		matchCount: number;
		activeMatchIndex: number;
		setQuery: (query: string) => void;
		setCaseSensitive: (caseSensitive: boolean) => void;
		findNext: () => void;
		findPrevious: () => void;
		closeSearch: () => void;
	};
}

export function FileViewerContent({
	viewMode,
	filePath,
	isLoadingRaw,
	isLoadingImage,
	isLoadingDiff,
	rawFileData,
	imageData,
	diffData,
	editorRef,
	originalContentRef,
	draftContentRef,
	initialLine,
	initialColumn,
	diffViewMode,
	hideUnchangedRegions,
	onSaveRaw,
	onEditorChange,
	setIsDirty,
	onSwitchToRawAtLocation,
	onSplitHorizontal,
	onSplitVertical,
	onSplitWithNewChat,
	onSplitWithNewBrowser,
	onClosePane,
	currentTabId,
	availableTabs,
	onMoveToTab,
	onMoveToNewTab,
	markdownContainerRef,
	markdownSearch,
}: FileViewerContentProps) {
	const isImage = isImageFile(filePath);
	const hasAppliedInitialLocationRef = useRef(false);
	const diffContainerRef = useRef<HTMLDivElement | null>(null);
	const lastDiffLocationRef = useRef<{
		lineNumber: number;
		side: "deletions" | "additions";
		lineType:
			| "change-deletion"
			| "change-addition"
			| "context"
			| "context-expanded";
	} | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset on file change only
	useEffect(() => {
		hasAppliedInitialLocationRef.current = false;
	}, [filePath]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset when requested cursor target changes
	useEffect(() => {
		hasAppliedInitialLocationRef.current = false;
	}, [initialLine, initialColumn]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset cached diff interaction when the file changes
	useEffect(() => {
		lastDiffLocationRef.current = null;
	}, [filePath]);

	useEffect(() => {
		if (viewMode !== "diff") {
			return;
		}

		const handleSelectionChange = () => {
			logDiffSelectionDebug(diffContainerRef.current, "selectionchange");
		};

		document.addEventListener("selectionchange", handleSelectionChange);
		return () => {
			document.removeEventListener("selectionchange", handleSelectionChange);
		};
	}, [viewMode]);

	const getDiffSelectionLines = () => {
		if (!diffData || !lastDiffLocationRef.current) {
			return null;
		}

		const position = mapDiffLocationToRawPosition({
			contents: diffData,
			lineNumber: lastDiffLocationRef.current.lineNumber,
			side: lastDiffLocationRef.current.side,
			lineType: lastDiffLocationRef.current.lineType,
		});

		return {
			startLine: position.lineNumber,
			endLine: position.lineNumber,
		};
	};

	const handleDiffLineEnter = ({
		lineNumber,
		annotationSide,
		lineType,
	}: {
		lineNumber: number;
		annotationSide: "deletions" | "additions";
		lineType:
			| "change-deletion"
			| "change-addition"
			| "context"
			| "context-expanded";
	}) => {
		lastDiffLocationRef.current = {
			lineNumber,
			side: annotationSide,
			lineType,
		};
	};

	useEffect(() => {
		if (viewMode !== "raw") return;
		if (isLoadingRaw) return;
		if (!rawFileData?.ok) return;
		if (draftContentRef.current !== null) return;

		originalContentRef.current = rawFileData.content;
		setIsDirty(false);
	}, [
		viewMode,
		isLoadingRaw,
		rawFileData,
		draftContentRef,
		originalContentRef,
		setIsDirty,
	]);

	useEffect(() => {
		if (
			viewMode !== "raw" ||
			!editorRef.current ||
			!initialLine ||
			hasAppliedInitialLocationRef.current ||
			isLoadingRaw ||
			!rawFileData?.ok
		) {
			return;
		}

		editorRef.current.revealPosition(initialLine, initialColumn ?? 1);
		hasAppliedInitialLocationRef.current = true;
	}, [
		viewMode,
		editorRef,
		initialLine,
		initialColumn,
		isLoadingRaw,
		rawFileData,
	]);

	if (viewMode === "diff") {
		if (isLoadingDiff) {
			return (
				<div className="flex h-full items-center justify-center text-muted-foreground">
					Loading diff...
				</div>
			);
		}

		if (!diffData) {
			return (
				<div className="flex h-full items-center justify-center text-muted-foreground">
					No diff available
				</div>
			);
		}

		return (
			<DiffViewerContextMenu
				containerRef={diffContainerRef}
				filePath={filePath}
				getSelectionLines={getDiffSelectionLines}
				onSplitHorizontal={onSplitHorizontal}
				onSplitVertical={onSplitVertical}
				onSplitWithNewChat={onSplitWithNewChat}
				onSplitWithNewBrowser={onSplitWithNewBrowser}
				onClosePane={onClosePane}
				currentTabId={currentTabId}
				availableTabs={availableTabs}
				onMoveToTab={onMoveToTab}
				onMoveToNewTab={onMoveToNewTab}
			>
				{/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: Diff wrapper intercepts mouse clicks to preserve text selection */}
				<div
					ref={diffContainerRef}
					className="h-full min-h-0 overflow-auto bg-background select-text"
					onMouseDownCapture={(event) => {
						logDiffSelectionDebug(diffContainerRef.current, "mousedown", {
							target:
								event.target instanceof HTMLElement
									? {
											tagName: event.target.tagName,
											className: event.target.className,
											dataset: { ...event.target.dataset },
										}
									: undefined,
						});
					}}
					onMouseUpCapture={(event) => {
						logDiffSelectionDebug(diffContainerRef.current, "mouseup", {
							target:
								event.target instanceof HTMLElement
									? {
											tagName: event.target.tagName,
											className: event.target.className,
											dataset: { ...event.target.dataset },
										}
									: undefined,
						});
					}}
					onClickCapture={(event) => {
						logDiffSelectionDebug(diffContainerRef.current, "click-capture", {
							detail: event.detail,
							target:
								event.target instanceof HTMLElement
									? {
											tagName: event.target.tagName,
											className: event.target.className,
											dataset: { ...event.target.dataset },
										}
									: undefined,
						});
					}}
					onContextMenuCapture={(event) => {
						logDiffSelectionDebug(diffContainerRef.current, "contextmenu", {
							target:
								event.target instanceof HTMLElement
									? {
											tagName: event.target.tagName,
											className: event.target.className,
											dataset: { ...event.target.dataset },
										}
									: undefined,
						});
						const location = getDiffLocationFromTarget(event.target);
						if (!location) {
							return;
						}

						lastDiffLocationRef.current = {
							lineNumber: location.lineNumber,
							side: location.side,
							lineType: location.lineType,
						};
					}}
					onDoubleClick={(event) => {
						logDiffSelectionDebug(diffContainerRef.current, "double-click", {
							target:
								event.target instanceof HTMLElement
									? {
											tagName: event.target.tagName,
											className: event.target.className,
											dataset: { ...event.target.dataset },
										}
									: undefined,
						});
						if (!diffData) {
							return;
						}

						const location = getDiffLocationFromTarget(event.target);
						if (!location) {
							return;
						}

						lastDiffLocationRef.current = {
							lineNumber: location.lineNumber,
							side: location.side,
							lineType: location.lineType,
						};

						const position = mapDiffLocationToRawPosition({
							contents: diffData,
							lineNumber: location.lineNumber,
							side: location.side,
							lineType: location.lineType,
							column: getColumnFromDiffSelection({
								lineElement: location.lineElement,
								numberColumn: location.numberColumn,
							}),
						});

						onSwitchToRawAtLocation(position.lineNumber, position.column);
					}}
					onClick={(event) => {
						logDiffSelectionDebug(diffContainerRef.current, "click-bubble", {
							detail: event.detail,
						});
						if (hasActiveSelectionWithinElement(diffContainerRef.current)) {
							console.log("[DiffSelectionDebug]", {
								label: "stop-click-propagation",
							});
							event.stopPropagation();
						}
					}}
				>
					<LightDiffViewer
						key={filePath}
						contents={diffData}
						viewMode={diffViewMode}
						hideUnchangedRegions={hideUnchangedRegions}
						filePath={filePath}
						className="min-h-full"
						onDiffLineEnter={handleDiffLineEnter}
					/>
				</div>
			</DiffViewerContextMenu>
		);
	}

	if (viewMode === "rendered" && isImage) {
		if (isLoadingImage) {
			return (
				<div className="flex h-full items-center justify-center text-muted-foreground">
					<LuLoader className="mr-2 h-4 w-4 animate-spin" />
					<span>Loading image...</span>
				</div>
			);
		}

		if (!imageData?.ok) {
			const errorMessage =
				imageData?.reason === "too-large"
					? "Image is too large to preview (max 10MB)"
					: imageData?.reason === "outside-worktree"
						? "File is outside worktree"
						: imageData?.reason === "symlink-escape"
							? "File is a symlink pointing outside worktree"
							: imageData?.reason === "not-image"
								? "Not a supported image format"
								: "Image not found";

			return (
				<div className="flex h-full items-center justify-center text-muted-foreground">
					{errorMessage}
				</div>
			);
		}

		return (
			<div className="flex h-full items-center justify-center overflow-auto bg-[#0d0d0d] p-4">
				<img
					src={imageData.dataUrl}
					alt={filePath.split("/").pop() || "Image"}
					className="max-h-full max-w-full object-contain"
					style={{ imageRendering: "auto" }}
				/>
			</div>
		);
	}

	if (isLoadingRaw) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				Loading...
			</div>
		);
	}

	if (!rawFileData?.ok) {
		const errorMessage =
			rawFileData?.reason === "too-large"
				? "File is too large to preview"
				: rawFileData?.reason === "binary"
					? "Binary file preview not supported"
					: rawFileData?.reason === "outside-worktree"
						? "File is outside worktree"
						: rawFileData?.reason === "symlink-escape"
							? "File is a symlink pointing outside worktree"
							: "File not found";

		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				{errorMessage}
			</div>
		);
	}

	if (viewMode === "rendered") {
		return (
			<div className="relative h-full">
				<MarkdownSearch
					isOpen={markdownSearch.isSearchOpen}
					query={markdownSearch.query}
					caseSensitive={markdownSearch.caseSensitive}
					matchCount={markdownSearch.matchCount}
					activeMatchIndex={markdownSearch.activeMatchIndex}
					onQueryChange={markdownSearch.setQuery}
					onCaseSensitiveChange={markdownSearch.setCaseSensitive}
					onFindNext={markdownSearch.findNext}
					onFindPrevious={markdownSearch.findPrevious}
					onClose={markdownSearch.closeSearch}
				/>
				<div ref={markdownContainerRef} className="h-full overflow-auto p-4">
					<MarkdownRenderer content={rawFileData.content} />
				</div>
			</div>
		);
	}

	return (
		<FileEditorContextMenu
			editorRef={editorRef}
			filePath={filePath}
			onSplitHorizontal={onSplitHorizontal}
			onSplitVertical={onSplitVertical}
			onSplitWithNewChat={onSplitWithNewChat}
			onSplitWithNewBrowser={onSplitWithNewBrowser}
			onClosePane={onClosePane}
			currentTabId={currentTabId}
			availableTabs={availableTabs}
			onMoveToTab={onMoveToTab}
			onMoveToNewTab={onMoveToNewTab}
		>
			<div className="h-full w-full">
				<CodeEditor
					key={filePath}
					language={detectLanguage(filePath)}
					value={draftContentRef.current ?? rawFileData.content}
					onChange={onEditorChange}
					onSave={() => {
						void onSaveRaw();
					}}
					editorRef={editorRef}
					fillHeight
				/>
			</div>
		</FileEditorContextMenu>
	);
}
