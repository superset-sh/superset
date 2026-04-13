import {
	type MutableRefObject,
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from "react";
import { LuLoader } from "react-icons/lu";
import {
	type MarkdownEditorAdapter,
	TipTapMarkdownRenderer,
} from "renderer/components/MarkdownRenderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { getTrustedMemoRootPath } from "renderer/lib/workspace-memos";
import type { CodeEditorAdapter } from "renderer/screens/main/components/WorkspaceView/ContentView/components";
import { CodeEditor } from "renderer/screens/main/components/WorkspaceView/components/CodeEditor";
import type {
	SymbolHoverResult,
	SymbolPosition,
} from "renderer/screens/main/components/WorkspaceView/components/CodeEditor/createSymbolInteractions";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Tab } from "renderer/stores/tabs/types";
import { pathsMatch, toAbsoluteWorkspacePath } from "shared/absolute-paths";
import { type DiffViewMode, isDiffEditable } from "shared/changes-types";
import { detectLanguage } from "shared/detect-language";
import { isHtmlFile, isImageFile, isSpreadsheetFile } from "shared/file-types";
import type { FileViewerMode } from "shared/tabs-types";
import { useNextEditCompletion } from "../../hooks/useNextEditCompletion";
import { useScrollToFirstDiffChange } from "../../hooks/useScrollToFirstDiffChange";
import { CodeMirrorDiffViewer } from "../CodeMirrorDiffViewer";
import { ConflictViewer } from "../ConflictViewer";
import { DiffViewerContextMenu } from "../DiffViewerContextMenu";
import { FileEditorContextMenu } from "../FileEditorContextMenu";
import { MarkdownSearch } from "../MarkdownSearch";
import { SpreadsheetDiffViewer, SpreadsheetViewer } from "../SpreadsheetViewer";
import {
	type DiffDomLocation,
	getColumnFromDiffPoint,
	getDiffLocationFromEvent,
	mapDiffLocationToRawPosition,
} from "./utils/diff-location";

export interface HtmlPreviewHandle {
	reload: () => void;
}

function HtmlPreviewWebview({
	absolutePath,
	zoomLevel,
	handleRef,
}: {
	absolutePath: string;
	zoomLevel: number;
	handleRef?: MutableRefObject<HtmlPreviewHandle | null>;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const webviewRef = useRef<Electron.WebviewTag | null>(null);
	const zoomLevelRef = useRef(zoomLevel);
	zoomLevelRef.current = zoomLevel;
	const pendingReloadRef = useRef(false);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || !absolutePath) return;

		const webview = document.createElement("webview") as Electron.WebviewTag;
		webview.src = `file://${absolutePath}`;
		webview.setAttribute(
			"webpreferences",
			"sandbox=true,nodeIntegration=false,contextIsolation=true",
		);
		webview.style.width = "100%";
		webview.style.height = "100%";
		webview.style.border = "none";

		webview.addEventListener("will-navigate", (e) => {
			e.preventDefault();
		});

		if (handleRef) {
			handleRef.current = {
				reload: () => {
					if (webviewRef.current) {
						webviewRef.current.reload();
					} else {
						pendingReloadRef.current = true;
					}
				},
			};
		}

		webview.addEventListener("dom-ready", () => {
			webviewRef.current = webview;
			webview.setZoomLevel(zoomLevelRef.current);
			if (pendingReloadRef.current) {
				pendingReloadRef.current = false;
				webview.reload();
			}
		});

		container.appendChild(webview);

		return () => {
			if (handleRef) {
				handleRef.current = null;
			}
			pendingReloadRef.current = false;
			webviewRef.current = null;
			try {
				if (webview.isConnected) {
					webview.stop();
				}
				container.removeChild(webview);
			} catch {
				// already removed
			}
		};
	}, [absolutePath, handleRef]);

	useEffect(() => {
		if (webviewRef.current) {
			webviewRef.current.setZoomLevel(zoomLevel);
		}
	}, [zoomLevel]);

	return <div ref={containerRef} className="h-full w-full bg-white" />;
}

interface RawFileData {
	ok: true;
	content: string;
}

interface RawFileError {
	ok: false;
	reason: "too-large" | "binary" | "not-found" | "is-directory";
}

type RawFileResult = RawFileData | RawFileError | undefined;

interface ImageData {
	ok: true;
	dataUrl: string;
	byteLength: number;
}

interface ImageError {
	ok: false;
	reason: "too-large" | "not-image" | "not-found" | "is-directory";
}

type ImageResult = ImageData | ImageError | undefined;

interface DiffData {
	original: string;
	modified: string;
	language: string;
}

function hasActiveSelectionWithinElement(
	element: HTMLDivElement | null,
): boolean {
	if (!element) {
		return false;
	}

	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) {
		return false;
	}

	const text = selection.toString();
	if (text.length === 0) {
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

interface TextSearchState {
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
}

interface FileViewerContentProps {
	workspaceId?: string;
	worktreePath?: string;
	diffCategory?: import("shared/changes-types").ChangeCategory;
	commitHash?: string;
	viewMode: FileViewerMode;
	filePath: string;
	isLoadingRaw: boolean;
	isLoadingImage?: boolean;
	isLoadingDiff: boolean;
	rawFileData: RawFileResult;
	imageData?: ImageResult;
	diffData: DiffData | undefined;
	editorRef: MutableRefObject<CodeEditorAdapter | null>;
	markdownEditorRef: MutableRefObject<MarkdownEditorAdapter | null>;
	renderedContent: string;
	documentVersion?: number;
	initialLine?: number;
	initialColumn?: number;
	diffViewMode: DiffViewMode;
	hideUnchangedRegions: boolean;
	onSaveFile: () => void;
	onContentChange: (value: string | undefined) => void;
	onSwitchToRawAtLocation: (line: number, column: number) => void;
	onSplitHorizontal: () => void;
	onSplitVertical: () => void;
	onSplitWithNewChat?: () => void;
	onSplitWithNewBrowser?: () => void;
	onEqualizePaneSplits?: () => void;
	onClosePane: () => void;
	currentTabId: string;
	availableTabs: Tab[];
	onMoveToTab: (tabId: string) => void;
	onMoveToNewTab: () => void;
	diffContainerRef: RefObject<HTMLDivElement | null>;
	diffSearch: TextSearchState;
	markdownContainerRef: RefObject<HTMLDivElement | null>;
	markdownSearch: TextSearchState;
	htmlZoomLevel?: number;
	htmlPreviewRef?: MutableRefObject<HtmlPreviewHandle | null>;
	onShowReferenceGraph?: () => void;
}

export function FileViewerContent({
	workspaceId,
	worktreePath,
	diffCategory,
	commitHash,
	viewMode,
	filePath,
	isLoadingRaw,
	isLoadingImage,
	isLoadingDiff,
	rawFileData,
	imageData,
	diffData,
	editorRef,
	markdownEditorRef,
	renderedContent,
	documentVersion,
	initialLine,
	initialColumn,
	diffViewMode,
	hideUnchangedRegions,
	onSaveFile,
	onContentChange,
	onSwitchToRawAtLocation,
	onSplitHorizontal,
	onSplitVertical,
	onSplitWithNewChat,
	onSplitWithNewBrowser,
	onEqualizePaneSplits,
	onClosePane,
	currentTabId,
	availableTabs,
	onMoveToTab,
	onMoveToNewTab,
	diffContainerRef,
	// biome-ignore lint/correctness/noUnusedFunctionParameters: reserved for future use
	diffSearch,
	markdownContainerRef,
	markdownSearch,
	htmlZoomLevel = 0,
	htmlPreviewRef,
	onShowReferenceGraph,
}: FileViewerContentProps) {
	const isImage = isImageFile(filePath);
	const isHtml = isHtmlFile(filePath);
	const {
		isAvailable: isNextEditAvailable,
		requestInlineCompletion,
		syncDocumentSnapshot,
		trackDocumentChange,
	} = useNextEditCompletion({
		filePath,
	});
	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);

	useScrollToFirstDiffChange({
		containerRef: diffContainerRef,
		filePath,
		diffData,
		enabled: viewMode === "diff" && !isLoadingDiff && !!diffData,
	});

	const absoluteFilePath = useMemo(
		() => (worktreePath ? toAbsoluteWorkspacePath(worktreePath, filePath) : ""),
		[worktreePath, filePath],
	);
	const trustedImageRootPath = useMemo(
		() => getTrustedMemoRootPath(absoluteFilePath),
		[absoluteFilePath],
	);
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const projectId = workspace?.projectId ?? workspace?.project?.id;
	const { data: project } = electronTrpc.projects.get.useQuery(
		{ id: projectId ?? "" },
		{ enabled: !!projectId },
	);
	const supersetLinkProject = useMemo(
		() =>
			project
				? {
						githubOwner: project.githubOwner ?? null,
						githubRepoName: null,
						mainRepoPath: project.mainRepoPath,
					}
				: null,
		[project],
	);

	const trpcUtils = electronTrpc.useUtils();
	const { data: workspaceDiagnostics } =
		electronTrpc.languageServices.getWorkspaceDiagnostics.useQuery(
			{ workspaceId: workspaceId ?? "" },
			{
				enabled: Boolean(workspaceId),
				staleTime: Infinity,
			},
		);

	electronTrpc.languageServices.subscribeDiagnostics.useSubscription(
		{ workspaceId: workspaceId ?? "" },
		{
			enabled: Boolean(workspaceId),
			onData: () => {
				if (!workspaceId) {
					return;
				}
				void trpcUtils.languageServices.getWorkspaceDiagnostics.invalidate({
					workspaceId,
				});
			},
		},
	);

	const fileDiagnostics = useMemo(
		() =>
			(workspaceDiagnostics?.problems ?? []).filter(
				(problem) =>
					(problem.absolutePath && absoluteFilePath
						? pathsMatch(problem.absolutePath, absoluteFilePath)
						: false) || problem.relativePath === filePath,
			),
		[workspaceDiagnostics?.problems, absoluteFilePath, filePath],
	);
	const languageId = useMemo(() => detectLanguage(filePath), [filePath]);
	const canResolveSymbols = Boolean(
		workspaceId && absoluteFilePath && languageId,
	);

	const { data: blameData } = electronTrpc.changes.getGitBlame.useQuery(
		{ worktreePath: worktreePath ?? "", absolutePath: absoluteFilePath },
		{
			enabled: Boolean(worktreePath && absoluteFilePath),
			staleTime: 60_000,
		},
	);

	const hasAppliedInitialLocationRef = useRef(false);
	const lastDiffLocationRef = useRef<
		| (DiffDomLocation & {
				column?: number;
		  })
		| null
	>(null);
	const lastModifiedCursorRef = useRef<SymbolPosition | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset on file change only
	useEffect(() => {
		hasAppliedInitialLocationRef.current = false;
	}, [filePath]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset when requested cursor target changes
	useEffect(() => {
		hasAppliedInitialLocationRef.current = false;
	}, [initialLine, initialColumn]);

	const rawFileContent = rawFileData?.ok ? rawFileData.content : null;
	const isEditableDiff = diffCategory ? isDiffEditable(diffCategory) : false;

	useEffect(() => {
		if (viewMode !== "raw" || rawFileContent === null) {
			return;
		}

		syncDocumentSnapshot(rawFileContent);
	}, [rawFileContent, syncDocumentSnapshot, viewMode]);

	useEffect(() => {
		if (viewMode !== "diff" || !isEditableDiff || !diffData) {
			return;
		}

		syncDocumentSnapshot(diffData.modified);
	}, [diffData, isEditableDiff, syncDocumentSnapshot, viewMode]);

	useEffect(() => {
		if (viewMode !== "raw") {
			hasAppliedInitialLocationRef.current = false;
		}
	}, [viewMode]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset cached diff interaction when the rendered diff changes
	useEffect(() => {
		lastDiffLocationRef.current = null;
	}, [
		filePath,
		diffData?.original,
		diffData?.modified,
		diffViewMode,
		hideUnchangedRegions,
	]);

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

	const openRawFromDiffLocation = (
		location: DiffDomLocation & {
			column: number;
		},
	) => {
		if (!diffData) {
			return;
		}

		lastDiffLocationRef.current = location;

		const position = mapDiffLocationToRawPosition({
			contents: diffData,
			lineNumber: location.lineNumber,
			side: location.side,
			lineType: location.lineType,
			column: location.column,
		});

		onSwitchToRawAtLocation(position.lineNumber, position.column);
	};

	const handleRawEditorChange = useCallback(
		(value: string | undefined) => {
			if (typeof value === "string") {
				trackDocumentChange(value);
			}
			onContentChange(value);
		},
		[onContentChange, trackDocumentChange],
	);

	const handleDiffEditorChange = useCallback(
		(value: string | undefined) => {
			if (typeof value === "string") {
				trackDocumentChange(value);
			}
			onContentChange(value);
		},
		[onContentChange, trackDocumentChange],
	);

	const resolveSymbolHover = useCallback(
		async (position: SymbolPosition): Promise<SymbolHoverResult | null> => {
			if (!workspaceId || !absoluteFilePath || !languageId) {
				return null;
			}

			return await electronTrpcClient.languageServices.getHover.query({
				workspaceId,
				absolutePath: absoluteFilePath,
				languageId,
				line: position.line,
				column: position.column,
				content: renderedContent,
				version: documentVersion ?? 0,
			});
		},
		[
			absoluteFilePath,
			documentVersion,
			languageId,
			renderedContent,
			workspaceId,
		],
	);

	const goToDefinition = useCallback(
		async (position: SymbolPosition) => {
			if (!workspaceId || !absoluteFilePath || !languageId) {
				return;
			}

			const definitions =
				await electronTrpcClient.languageServices.getDefinition.query({
					workspaceId,
					absolutePath: absoluteFilePath,
					languageId,
					line: position.line,
					column: position.column,
					content: renderedContent,
					version: documentVersion ?? 0,
				});
			const target = definitions?.[0];
			if (!target) {
				return;
			}

			if (pathsMatch(target.absolutePath, absoluteFilePath)) {
				if (viewMode === "diff") {
					onSwitchToRawAtLocation(target.line, target.column);
					return;
				}

				editorRef.current?.revealPosition(target.line, target.column);
				return;
			}

			addFileViewerPane(workspaceId, {
				filePath: target.absolutePath,
				line: target.line,
				column: target.column,
				isPinned: false,
			});
		},
		[
			absoluteFilePath,
			addFileViewerPane,
			documentVersion,
			editorRef,
			languageId,
			onSwitchToRawAtLocation,
			renderedContent,
			viewMode,
			workspaceId,
		],
	);

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

	if (
		viewMode === "diff" &&
		isSpreadsheetFile(filePath) &&
		workspaceId &&
		worktreePath
	) {
		return (
			<SpreadsheetDiffViewer
				workspaceId={workspaceId}
				worktreePath={worktreePath}
				filePath={filePath}
				absoluteFilePath={absoluteFilePath}
				diffCategory={diffCategory}
				commitHash={commitHash}
			/>
		);
	}

	if (viewMode === "conflict" && workspaceId) {
		return (
			<ConflictViewer
				workspaceId={workspaceId}
				absoluteFilePath={absoluteFilePath}
			/>
		);
	}

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
				branch={workspace?.branch}
				worktreePath={worktreePath}
				supersetLinkProject={supersetLinkProject}
				getSelectionLines={getDiffSelectionLines}
				onSplitHorizontal={onSplitHorizontal}
				onSplitVertical={onSplitVertical}
				onSplitWithNewChat={onSplitWithNewChat}
				onSplitWithNewBrowser={onSplitWithNewBrowser}
				onEqualizePaneSplits={onEqualizePaneSplits}
				onClosePane={onClosePane}
				currentTabId={currentTabId}
				availableTabs={availableTabs}
				onMoveToTab={onMoveToTab}
				onMoveToNewTab={onMoveToNewTab}
				onEditAtLocation={() => {
					const location = lastDiffLocationRef.current;
					if (!location || location.column === undefined) {
						return;
					}

					openRawFromDiffLocation({
						...location,
						column: location.column,
					});
				}}
				onGoToDefinition={
					canResolveSymbols
						? () => {
								if (lastDiffLocationRef.current?.side !== "additions") {
									return;
								}
								const position = lastModifiedCursorRef.current;
								if (!position) {
									return;
								}

								void goToDefinition(position);
							}
						: undefined
				}
			>
				<div className="relative h-full">
					<div
						ref={diffContainerRef}
						className="h-full min-h-0 overflow-auto bg-background select-text"
						onClickCapture={(event) => {
							if (hasActiveSelectionWithinElement(diffContainerRef.current)) {
								event.stopPropagation();
							}
						}}
						onContextMenuCapture={(event) => {
							const nativeEvent = event.nativeEvent;
							const location = getDiffLocationFromEvent(nativeEvent);
							if (!location) {
								lastDiffLocationRef.current = null;
								return;
							}

							const column = getColumnFromDiffPoint({
								lineElement: event.target as HTMLElement,
								clientX: event.clientX,
								clientY: event.clientY,
							});
							lastDiffLocationRef.current = { ...location, column };
						}}
					>
						<CodeMirrorDiffViewer
							original={diffData.original}
							modified={diffData.modified}
							language={diffData.language}
							worktreePath={worktreePath}
							viewMode={diffViewMode}
							onChange={handleDiffEditorChange}
							onSave={onSaveFile}
							blameEntries={blameData?.entries}
							diagnostics={fileDiagnostics}
							inlineCompletionRequest={
								isEditableDiff && isNextEditAvailable
									? requestInlineCompletion
									: null
							}
							resolveSymbolHover={
								canResolveSymbols ? resolveSymbolHover : undefined
							}
							onGoToDefinition={canResolveSymbols ? goToDefinition : undefined}
							onModifiedCursorChange={(position) => {
								lastModifiedCursorRef.current = position;
							}}
						/>
					</div>
				</div>
			</DiffViewerContextMenu>
		);
	}

	if (viewMode === "rendered" && isHtml) {
		if (isLoadingRaw) {
			return (
				<div className="flex h-full items-center justify-center text-muted-foreground">
					Loading...
				</div>
			);
		}

		if (!rawFileData?.ok) {
			return (
				<div className="flex h-full items-center justify-center text-muted-foreground">
					Cannot preview this file
				</div>
			);
		}

		return (
			<HtmlPreviewWebview
				key={filePath}
				absolutePath={absoluteFilePath}
				zoomLevel={htmlZoomLevel}
				handleRef={htmlPreviewRef}
			/>
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
					: imageData?.reason === "not-image"
						? "Not a supported image format"
						: imageData?.reason === "is-directory"
							? "This path is a directory"
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

	if (
		rawFileData?.ok === false &&
		rawFileData.reason === "binary" &&
		isSpreadsheetFile(filePath) &&
		workspaceId
	) {
		return (
			<SpreadsheetViewer
				workspaceId={workspaceId}
				filePath={filePath}
				absoluteFilePath={absoluteFilePath}
			/>
		);
	}

	if (!rawFileData?.ok) {
		const errorMessage =
			rawFileData?.reason === "too-large"
				? "File is too large to preview"
				: rawFileData?.reason === "binary"
					? "Binary file preview not supported"
					: rawFileData?.reason === "is-directory"
						? "This path is a directory"
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
					<TipTapMarkdownRenderer
						value={renderedContent}
						editable
						editorRef={markdownEditorRef}
						onChange={onContentChange}
						onSave={onSaveFile}
						workspaceId={workspaceId}
						filePath={absoluteFilePath}
						trustedImageRootPath={trustedImageRootPath}
					/>
				</div>
			</div>
		);
	}

	return (
		<FileEditorContextMenu
			editorRef={editorRef}
			filePath={filePath}
			branch={workspace?.branch}
			worktreePath={worktreePath}
			supersetLinkProject={supersetLinkProject}
			onSplitHorizontal={onSplitHorizontal}
			onSplitVertical={onSplitVertical}
			onSplitWithNewChat={onSplitWithNewChat}
			onSplitWithNewBrowser={onSplitWithNewBrowser}
			onEqualizePaneSplits={onEqualizePaneSplits}
			onClosePane={onClosePane}
			currentTabId={currentTabId}
			availableTabs={availableTabs}
			onMoveToTab={onMoveToTab}
			onMoveToNewTab={onMoveToNewTab}
			onShowReferenceGraph={onShowReferenceGraph}
			onGoToDefinition={
				canResolveSymbols
					? () => {
							const position = editorRef.current?.getCursorPosition();
							if (!position) {
								return;
							}

							void goToDefinition(position);
						}
					: undefined
			}
		>
			<div className="h-full w-full">
				<CodeEditor
					key={filePath}
					language={detectLanguage(filePath)}
					worktreePath={worktreePath}
					value={renderedContent}
					onChange={handleRawEditorChange}
					onSave={onSaveFile}
					editorRef={editorRef}
					fillHeight
					searchMode="overlay"
					blameEntries={blameData?.entries}
					diagnostics={fileDiagnostics}
					inlineCompletionRequest={
						isNextEditAvailable ? requestInlineCompletion : null
					}
					resolveSymbolHover={
						canResolveSymbols ? resolveSymbolHover : undefined
					}
					onGoToDefinition={canResolveSymbols ? goToDefinition : undefined}
				/>
			</div>
		</FileEditorContextMenu>
	);
}
