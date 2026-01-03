import Editor, { type OnMount } from "@monaco-editor/react";
import { Badge } from "@superset/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type * as Monaco from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	HiMiniLockClosed,
	HiMiniLockOpen,
	HiMiniPencil,
	HiMiniXMark,
} from "react-icons/hi2";
import { LuLoader } from "react-icons/lu";
import { TbLayoutColumns, TbLayoutRows } from "react-icons/tb";
import type { MosaicBranch } from "react-mosaic-component";
import { MosaicWindow } from "react-mosaic-component";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import {
	monaco,
	SUPERSET_THEME,
	useMonacoReady,
} from "renderer/contexts/MonacoProvider";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Pane } from "renderer/stores/tabs/types";
import type { FileViewerMode } from "shared/tabs-types";
import { DiffViewer } from "../../../ChangesContent/components/DiffViewer";

type SplitOrientation = "vertical" | "horizontal";

/** Client-side language detection for Monaco editor */
function detectLanguage(filePath: string): string {
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
	const languageMap: Record<string, string> = {
		ts: "typescript",
		tsx: "typescript",
		js: "javascript",
		jsx: "javascript",
		mjs: "javascript",
		cjs: "javascript",
		json: "json",
		md: "markdown",
		mdx: "markdown",
		css: "css",
		scss: "scss",
		less: "less",
		html: "html",
		xml: "xml",
		yaml: "yaml",
		yml: "yaml",
		py: "python",
		rs: "rust",
		go: "go",
		java: "java",
		kt: "kotlin",
		swift: "swift",
		c: "c",
		cpp: "cpp",
		h: "c",
		hpp: "cpp",
		sh: "shell",
		bash: "shell",
		zsh: "shell",
		sql: "sql",
		graphql: "graphql",
		gql: "graphql",
	};
	return languageMap[ext] ?? "plaintext";
}

interface FileViewerPaneProps {
	paneId: string;
	path: MosaicBranch[];
	pane: Pane;
	isActive: boolean;
	tabId: string;
	worktreePath: string;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
}

export function FileViewerPane({
	paneId,
	path,
	pane,
	isActive,
	tabId,
	worktreePath,
	splitPaneAuto,
	removePane,
	setFocusedPane,
}: FileViewerPaneProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [splitOrientation, setSplitOrientation] =
		useState<SplitOrientation>("vertical");
	const isMonacoReady = useMonacoReady();
	const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
	const [isDirty, setIsDirty] = useState(false);
	const originalContentRef = useRef<string>("");
	// Store draft content to preserve edits across view mode switches
	const draftContentRef = useRef<string | null>(null);
	const utils = trpc.useUtils();

	// Track container dimensions for auto-split orientation
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const updateOrientation = () => {
			const { width, height } = container.getBoundingClientRect();
			setSplitOrientation(width >= height ? "vertical" : "horizontal");
		};

		updateOrientation();

		const resizeObserver = new ResizeObserver(updateOrientation);
		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
		};
	}, []);

	const fileViewer = pane.fileViewer;

	// Extract values with defaults for hooks (hooks must be called unconditionally)
	const filePath = fileViewer?.filePath ?? "";
	const viewMode = fileViewer?.viewMode ?? "raw";
	const isLocked = fileViewer?.isLocked ?? false;
	const diffCategory = fileViewer?.diffCategory;
	const commitHash = fileViewer?.commitHash;
	const oldPath = fileViewer?.oldPath;
	// Line/column for initial scroll position (raw mode only, applied once)
	const initialLine = fileViewer?.initialLine;
	const initialColumn = fileViewer?.initialColumn;

	// Fetch branch info for against-base diffs (P1-1)
	const { data: branchData } = trpc.changes.getBranches.useQuery(
		{ worktreePath },
		{ enabled: !!worktreePath && diffCategory === "against-base" },
	);
	const effectiveBaseBranch = branchData?.defaultBranch ?? "main";

	// Track if we're saving from raw mode to know when to clear draft
	const savingFromRawRef = useRef(false);

	// Track if we've applied initial line/column navigation (reset on file change)
	const hasAppliedInitialLocationRef = useRef(false);

	// Save mutation
	const saveFileMutation = trpc.changes.saveFile.useMutation({
		onSuccess: () => {
			setIsDirty(false);
			// Update original content to current content after save
			if (editorRef.current) {
				originalContentRef.current = editorRef.current.getValue();
			}
			// P1: Only clear draft if we saved from Raw mode (we saved the draft content)
			// Don't clear if saving from Diff mode as that would discard Raw edits
			if (savingFromRawRef.current) {
				draftContentRef.current = null;
			}
			savingFromRawRef.current = false;
			// Invalidate queries to refresh data
			utils.changes.readWorkingFile.invalidate();
			utils.changes.getFileContents.invalidate();
			utils.changes.getStatus.invalidate();

			// P1-2: Switch to unstaged view if saving from staged (edits become unstaged changes)
			if (diffCategory === "staged") {
				const panes = useTabsStore.getState().panes;
				const currentPane = panes[paneId];
				if (currentPane?.fileViewer) {
					useTabsStore.setState({
						panes: {
							...panes,
							[paneId]: {
								...currentPane,
								fileViewer: {
									...currentPane.fileViewer,
									diffCategory: "unstaged",
								},
							},
						},
					});
				}
			}
		},
	});

	// Save handler for raw mode editor
	const handleSaveRaw = useCallback(() => {
		if (!editorRef.current || !filePath || !worktreePath) return;
		// Mark that we're saving from Raw mode so onSuccess knows to clear draft
		savingFromRawRef.current = true;
		saveFileMutation.mutate({
			worktreePath,
			filePath,
			content: editorRef.current.getValue(),
		});
	}, [worktreePath, filePath, saveFileMutation]);

	// Save handler for diff mode
	const handleSaveDiff = useCallback(
		(content: string) => {
			if (!filePath || !worktreePath) return;
			// Not saving from Raw mode - don't clear draft
			savingFromRawRef.current = false;
			saveFileMutation.mutate({
				worktreePath,
				filePath,
				content,
			});
		},
		[worktreePath, filePath, saveFileMutation],
	);

	// Editor mount handler - set up Cmd+S keybinding
	const handleEditorMount: OnMount = useCallback(
		(editor) => {
			editorRef.current = editor;
			// Store original content for dirty tracking (only if not restoring draft)
			// If we have draft content, originalContentRef is already set to the file content
			if (!draftContentRef.current) {
				originalContentRef.current = editor.getValue();
			}
			// P1: Update dirty state based on restored draft content
			setIsDirty(editor.getValue() !== originalContentRef.current);

			// Register save action with Cmd+S / Ctrl+S
			editor.addAction({
				id: "save-file",
				label: "Save File",
				keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
				run: () => {
					handleSaveRaw();
				},
			});
		},
		[handleSaveRaw],
	);

	// Track content changes for dirty state
	const handleEditorChange = useCallback((value: string | undefined) => {
		if (value !== undefined) {
			setIsDirty(value !== originalContentRef.current);
		}
	}, []);

	// Reset dirty state, draft, and initial location tracking when file changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset on file change only
	useEffect(() => {
		setIsDirty(false);
		originalContentRef.current = "";
		draftContentRef.current = null;
		hasAppliedInitialLocationRef.current = false;
	}, [filePath]);

	// P1: Reset navigation flag when line/column changes (e.g., clicking same file from terminal with different line)
	// biome-ignore lint/correctness/useExhaustiveDependencies: Only reset when coordinates change
	useEffect(() => {
		hasAppliedInitialLocationRef.current = false;
	}, [initialLine, initialColumn]);

	// Fetch raw file content - always call hook, use enabled to control fetching
	const { data: rawFileData, isLoading: isLoadingRaw } =
		trpc.changes.readWorkingFile.useQuery(
			{ worktreePath, filePath },
			{
				enabled:
					!!fileViewer && viewMode !== "diff" && !!filePath && !!worktreePath,
			},
		);

	// Fetch diff content - always call hook, use enabled to control fetching
	const { data: diffData, isLoading: isLoadingDiff } =
		trpc.changes.getFileContents.useQuery(
			{
				worktreePath,
				filePath,
				oldPath,
				category: diffCategory ?? "unstaged",
				commitHash,
				// P1-1: Pass defaultBranch for against-base diffs
				defaultBranch:
					diffCategory === "against-base" ? effectiveBaseBranch : undefined,
			},
			{
				enabled:
					!!fileViewer &&
					viewMode === "diff" &&
					!!diffCategory &&
					!!filePath &&
					!!worktreePath,
			},
		);

	// P1-1: Update originalContentRef when raw content loads (dirty tracking fix)
	// biome-ignore lint/correctness/useExhaustiveDependencies: Only update baseline when content loads
	useEffect(() => {
		if (rawFileData?.ok === true && !isDirty) {
			originalContentRef.current = rawFileData.content;
		}
	}, [rawFileData]);

	// Apply initial line/column navigation when raw content is ready
	// NOTE: Line/column navigation only supported in raw mode.
	// Diff mode has different line numbers between sides; rendered mode has no line concept.
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

		const editor = editorRef.current;
		const model = editor.getModel();
		if (!model) return;

		// Clamp to valid range to handle lines that exceed file length
		const lineCount = model.getLineCount();
		const safeLine = Math.max(1, Math.min(initialLine, lineCount));
		const maxColumn = model.getLineMaxColumn(safeLine);
		const safeColumn = Math.max(1, Math.min(initialColumn ?? 1, maxColumn));

		const position = { lineNumber: safeLine, column: safeColumn };
		editor.setPosition(position);
		editor.revealPositionInCenter(position);
		editor.focus();

		hasAppliedInitialLocationRef.current = true;
	}, [viewMode, initialLine, initialColumn, isLoadingRaw, rawFileData]);

	// Early return AFTER hooks
	if (!fileViewer) {
		return (
			<MosaicWindow<string> path={path} title="">
				<div className="flex items-center justify-center h-full text-muted-foreground">
					No file viewer state
				</div>
			</MosaicWindow>
		);
	}

	const handleFocus = () => {
		setFocusedPane(tabId, paneId);
	};

	const handleClosePane = (e: React.MouseEvent) => {
		e.stopPropagation();
		removePane(paneId);
	};

	const handleSplitPane = (e: React.MouseEvent) => {
		e.stopPropagation();
		const container = containerRef.current;
		if (!container) return;

		const { width, height } = container.getBoundingClientRect();
		splitPaneAuto(tabId, paneId, { width, height }, path);
	};

	const handleToggleLock = () => {
		// Update the pane's lock state in the store
		const panes = useTabsStore.getState().panes;
		const currentPane = panes[paneId];
		if (currentPane?.fileViewer) {
			useTabsStore.setState({
				panes: {
					...panes,
					[paneId]: {
						...currentPane,
						fileViewer: {
							...currentPane.fileViewer,
							isLocked: !currentPane.fileViewer.isLocked,
						},
					},
				},
			});
		}
	};

	const handleViewModeChange = (value: string) => {
		if (!value) return;
		const newMode = value as FileViewerMode;

		// P1: Save current editor content before switching away from raw mode
		if (viewMode === "raw" && editorRef.current) {
			draftContentRef.current = editorRef.current.getValue();
		}

		// Update the pane's view mode in the store
		const panes = useTabsStore.getState().panes;
		const currentPane = panes[paneId];
		if (currentPane?.fileViewer) {
			useTabsStore.setState({
				panes: {
					...panes,
					[paneId]: {
						...currentPane,
						fileViewer: {
							...currentPane.fileViewer,
							viewMode: newMode,
						},
					},
				},
			});
		}
	};

	const fileName = filePath.split("/").pop() || filePath;

	// P1-3: Only allow editing for staged/unstaged diffs (not committed/against-main)
	// P1: Also disable Diff editing when a Raw draft exists to prevent silent data loss
	// User must go back to Raw mode to save their unsaved edits first
	const hasDraft = draftContentRef.current !== null;
	const isDiffEditable =
		(diffCategory === "staged" || diffCategory === "unstaged") && !hasDraft;

	// Render content based on view mode
	const renderContent = () => {
		if (viewMode === "diff") {
			if (isLoadingDiff) {
				return (
					<div className="flex items-center justify-center h-full text-muted-foreground">
						Loading diff...
					</div>
				);
			}
			if (!diffData) {
				return (
					<div className="flex items-center justify-center h-full text-muted-foreground">
						No diff available
					</div>
				);
			}
			return (
				<DiffViewer
					key={filePath}
					contents={{
						original: diffData.original,
						modified: diffData.modified,
						language: diffData.language,
					}}
					viewMode="inline"
					filePath={filePath}
					editable={isDiffEditable}
					onSave={isDiffEditable ? handleSaveDiff : undefined}
				/>
			);
		}

		if (isLoadingRaw) {
			return (
				<div className="flex items-center justify-center h-full text-muted-foreground">
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
				<div className="flex items-center justify-center h-full text-muted-foreground">
					{errorMessage}
				</div>
			);
		}

		if (viewMode === "rendered") {
			return (
				<div className="p-4 overflow-auto h-full">
					<MarkdownRenderer content={rawFileData.content} />
				</div>
			);
		}

		// Raw mode - editable Monaco editor
		if (!isMonacoReady) {
			return (
				<div className="flex items-center justify-center h-full text-muted-foreground">
					<LuLoader className="w-4 h-4 animate-spin mr-2" />
					<span>Loading editor...</span>
				</div>
			);
		}

		// P0-2: Key by filePath to force remount and fresh action registration
		// P1: Use draft content if available (preserves edits across view mode switches)
		return (
			<Editor
				key={filePath}
				height="100%"
				language={detectLanguage(filePath)}
				value={draftContentRef.current ?? rawFileData.content}
				theme={SUPERSET_THEME}
				onMount={handleEditorMount}
				onChange={handleEditorChange}
				loading={
					<div className="flex items-center justify-center h-full text-muted-foreground">
						<LuLoader className="w-4 h-4 animate-spin mr-2" />
						<span>Loading editor...</span>
					</div>
				}
				options={{
					minimap: { enabled: false },
					scrollBeyondLastLine: false,
					wordWrap: "on",
					fontSize: 13,
					lineHeight: 20,
					fontFamily:
						"ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace",
					padding: { top: 8, bottom: 8 },
					scrollbar: {
						verticalScrollbarSize: 8,
						horizontalScrollbarSize: 8,
					},
				}}
			/>
		);
	};

	// Determine which view modes are available
	// P1-2: Include .mdx for consistency with default view mode logic
	const isMarkdown =
		filePath.endsWith(".md") ||
		filePath.endsWith(".markdown") ||
		filePath.endsWith(".mdx");
	const hasDiff = !!diffCategory;

	const splitIcon =
		splitOrientation === "vertical" ? (
			<TbLayoutColumns className="size-4" />
		) : (
			<TbLayoutRows className="size-4" />
		);

	// Show editable badge only for editable modes
	const showEditableBadge =
		viewMode === "raw" || (viewMode === "diff" && isDiffEditable);
	const isSaving = saveFileMutation.isPending;

	return (
		<MosaicWindow<string>
			path={path}
			title=""
			renderToolbar={() => (
				<div className="flex h-full w-full items-center justify-between px-2">
					<div className="flex min-w-0 items-center gap-2">
						<span className="truncate text-xs font-medium">
							{isDirty && <span className="text-amber-500 mr-1">●</span>}
							{fileName}
						</span>
						{showEditableBadge && (
							<Badge variant="secondary" className="gap-1 text-[10px] h-4 px-1">
								<HiMiniPencil className="w-2.5 h-2.5" />
								{isSaving ? "Saving..." : "⌘S"}
							</Badge>
						)}
					</div>
					<div className="flex items-center gap-1">
						<ToggleGroup
							type="single"
							value={viewMode}
							onValueChange={handleViewModeChange}
							size="sm"
							className="h-5"
						>
							{isMarkdown && (
								<ToggleGroupItem
									value="rendered"
									className="h-5 px-1.5 text-[10px]"
								>
									Rendered
								</ToggleGroupItem>
							)}
							<ToggleGroupItem value="raw" className="h-5 px-1.5 text-[10px]">
								Raw
							</ToggleGroupItem>
							{hasDiff && (
								<ToggleGroupItem
									value="diff"
									className="h-5 px-1.5 text-[10px]"
								>
									Diff
								</ToggleGroupItem>
							)}
						</ToggleGroup>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={handleSplitPane}
									className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
								>
									{splitIcon}
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" showArrow={false}>
								Split pane
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={handleToggleLock}
									className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
								>
									{isLocked ? (
										<HiMiniLockClosed className="size-3" />
									) : (
										<HiMiniLockOpen className="size-3" />
									)}
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" showArrow={false}>
								{isLocked
									? "Unlock (allow file replacement)"
									: "Lock (prevent file replacement)"}
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={handleClosePane}
									className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
								>
									<HiMiniXMark className="size-4" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" showArrow={false}>
								Close
							</TooltipContent>
						</Tooltip>
					</div>
				</div>
			)}
			className={isActive ? "mosaic-window-focused" : ""}
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: Focus handler */}
			<div
				ref={containerRef}
				className="w-full h-full overflow-hidden bg-background"
				onClick={handleFocus}
			>
				{renderContent()}
			</div>
		</MosaicWindow>
	);
}
