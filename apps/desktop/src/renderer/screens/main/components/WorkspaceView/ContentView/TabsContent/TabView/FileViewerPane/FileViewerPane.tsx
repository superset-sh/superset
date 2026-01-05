import type * as Monaco from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { MosaicWindow } from "react-mosaic-component";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Pane } from "renderer/stores/tabs/types";
import type { FileViewerMode } from "shared/tabs-types";
import { FileViewerContent } from "./components/FileViewerContent";
import { FileViewerToolbar } from "./components/FileViewerToolbar";
import { useFileContent } from "./hooks/useFileContent";
import { useFileSave } from "./hooks/useFileSave";
import { useSplitOrientation } from "./hooks/useSplitOrientation";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

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
	const splitOrientation = useSplitOrientation(containerRef);
	const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
	const [isDirty, setIsDirty] = useState(false);
	const originalContentRef = useRef<string>("");
	const draftContentRef = useRef<string | null>(null);
	const originalDiffContentRef = useRef<string>("");
	const currentDiffContentRef = useRef<string>("");
	const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
	const [isSavingAndSwitching, setIsSavingAndSwitching] = useState(false);
	const pendingModeRef = useRef<FileViewerMode | null>(null);

	const fileViewer = pane.fileViewer;
	const filePath = fileViewer?.filePath ?? "";
	const viewMode = fileViewer?.viewMode ?? "raw";
	const isLocked = fileViewer?.isLocked ?? false;
	const diffCategory = fileViewer?.diffCategory;
	const commitHash = fileViewer?.commitHash;
	const oldPath = fileViewer?.oldPath;
	const initialLine = fileViewer?.initialLine;
	const initialColumn = fileViewer?.initialColumn;

	const { handleSaveRaw, handleSaveDiff, isSaving } = useFileSave({
		worktreePath,
		filePath,
		paneId,
		diffCategory,
		editorRef,
		originalContentRef,
		originalDiffContentRef,
		draftContentRef,
		setIsDirty,
	});

	const { rawFileData, isLoadingRaw, diffData, isLoadingDiff } = useFileContent(
		{
			worktreePath,
			filePath,
			viewMode,
			diffCategory,
			commitHash,
			oldPath,
			isDirty,
			originalContentRef,
			originalDiffContentRef,
		},
	);

	const handleEditorChange = useCallback((value: string | undefined) => {
		if (value === undefined) return;
		if (originalContentRef.current === "") {
			originalContentRef.current = value;
			return;
		}
		setIsDirty(value !== originalContentRef.current);
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset on file change only
	useEffect(() => {
		setIsDirty(false);
		originalContentRef.current = "";
		draftContentRef.current = null;
	}, [filePath]);

	const handleDiffChange = useCallback((content: string) => {
		currentDiffContentRef.current = content;
		if (originalDiffContentRef.current === "") {
			originalDiffContentRef.current = content;
			return;
		}
		setIsDirty(content !== originalDiffContentRef.current);
	}, []);

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

	const switchToMode = (newMode: FileViewerMode) => {
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

	const handleViewModeChange = (value: string) => {
		if (!value) return;
		const newMode = value as FileViewerMode;

		if (isDirty && newMode !== viewMode) {
			pendingModeRef.current = newMode;
			setShowUnsavedDialog(true);
			return;
		}

		switchToMode(newMode);
	};

	const handleSaveAndSwitch = async () => {
		if (!pendingModeRef.current) return;

		setIsSavingAndSwitching(true);
		try {
			if (viewMode === "raw" && editorRef.current) {
				const savedContent = editorRef.current.getValue();
				await handleSaveRaw();
				originalContentRef.current = savedContent;
				originalDiffContentRef.current = "";
			} else if (
				viewMode === "diff" &&
				currentDiffContentRef.current !== undefined
			) {
				const savedContent = currentDiffContentRef.current;
				await handleSaveDiff(savedContent);
				originalDiffContentRef.current = savedContent;
				originalContentRef.current = "";
			}

			setIsDirty(false);
			draftContentRef.current = null;
			currentDiffContentRef.current = "";

			switchToMode(pendingModeRef.current);
			pendingModeRef.current = null;
			setShowUnsavedDialog(false);
		} catch (error) {
			console.error("[FileViewerPane] Save failed:", error);
		} finally {
			setIsSavingAndSwitching(false);
		}
	};

	const handleDiscardAndSwitch = () => {
		if (!pendingModeRef.current) return;

		if (viewMode === "raw" && editorRef.current) {
			editorRef.current.setValue(originalContentRef.current);
		}

		setIsDirty(false);
		draftContentRef.current = null;
		currentDiffContentRef.current = "";

		switchToMode(pendingModeRef.current);
		pendingModeRef.current = null;
	};

	const fileName = filePath.split("/").pop() || filePath;
	const isMarkdown =
		filePath.endsWith(".md") ||
		filePath.endsWith(".markdown") ||
		filePath.endsWith(".mdx");
	const hasDiff = !!diffCategory;
	const hasDraft = draftContentRef.current !== null;
	const isDiffEditable =
		(diffCategory === "staged" || diffCategory === "unstaged") && !hasDraft;
	const showEditableBadge =
		viewMode === "raw" || (viewMode === "diff" && isDiffEditable);

	return (
		<MosaicWindow<string>
			path={path}
			title=""
			renderToolbar={() => (
				<div className="flex h-full w-full">
					<FileViewerToolbar
						fileName={fileName}
						isDirty={isDirty}
						isSaving={isSaving}
						viewMode={viewMode}
						isLocked={isLocked}
						isMarkdown={isMarkdown}
						hasDiff={hasDiff}
						showEditableBadge={showEditableBadge}
						splitOrientation={splitOrientation}
						onViewModeChange={handleViewModeChange}
						onSplitPane={handleSplitPane}
						onToggleLock={handleToggleLock}
						onClosePane={handleClosePane}
					/>
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
				<FileViewerContent
					viewMode={viewMode}
					filePath={filePath}
					isLoadingRaw={isLoadingRaw}
					isLoadingDiff={isLoadingDiff}
					rawFileData={rawFileData}
					diffData={diffData}
					isDiffEditable={isDiffEditable}
					editorRef={editorRef}
					originalContentRef={originalContentRef}
					draftContentRef={draftContentRef}
					initialLine={initialLine}
					initialColumn={initialColumn}
					onSaveRaw={handleSaveRaw}
					onSaveDiff={isDiffEditable ? handleSaveDiff : undefined}
					onEditorChange={handleEditorChange}
					onDiffChange={isDiffEditable ? handleDiffChange : undefined}
					setIsDirty={setIsDirty}
				/>
			</div>
			<UnsavedChangesDialog
				open={showUnsavedDialog}
				onOpenChange={setShowUnsavedDialog}
				onSaveAndSwitch={handleSaveAndSwitch}
				onDiscardAndSwitch={handleDiscardAndSwitch}
				isSaving={isSavingAndSwitching}
			/>
		</MosaicWindow>
	);
}
