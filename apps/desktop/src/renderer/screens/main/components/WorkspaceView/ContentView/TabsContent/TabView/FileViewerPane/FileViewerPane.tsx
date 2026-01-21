import type * as Monaco from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { useChangesStore } from "renderer/stores/changes";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Tab } from "renderer/stores/tabs/types";
import type { FileViewerMode } from "shared/tabs-types";
import { BasePaneWindow } from "../components";
import { FileViewerContent } from "./components/FileViewerContent";
import { FileViewerToolbar } from "./components/FileViewerToolbar";
import { useFileContent } from "./hooks/useFileContent";
import { useFileSave } from "./hooks/useFileSave";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

interface FileViewerPaneProps {
	paneId: string;
	path: MosaicBranch[];
	isActive: boolean;
	tabId: string;
	worktreePath: string;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
	) => void;
	splitPaneHorizontal: (
		tabId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
	) => void;
	splitPaneVertical: (
		tabId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
	availableTabs: Tab[];
	onMoveToTab: (targetTabId: string) => void;
	onMoveToNewTab: () => void;
}

export function FileViewerPane({
	paneId,
	path,
	isActive,
	tabId,
	worktreePath,
	splitPaneAuto,
	splitPaneHorizontal,
	splitPaneVertical,
	removePane,
	setFocusedPane,
	availableTabs,
	onMoveToTab,
	onMoveToNewTab,
}: FileViewerPaneProps) {
	// Use granular selector to only get this pane's fileViewer data
	const fileViewer = useTabsStore((s) => s.panes[paneId]?.fileViewer);
	const {
		viewMode: diffViewMode,
		setViewMode: setDiffViewMode,
		hideUnchangedRegions,
		toggleHideUnchangedRegions,
	} = useChangesStore();

	const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
	const [isDirty, setIsDirty] = useState(false);
	const originalContentRef = useRef<string>("");
	const draftContentRef = useRef<string | null>(null);
	const originalDiffContentRef = useRef<string>("");
	const currentDiffContentRef = useRef<string>("");
	const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
	const [isSavingAndSwitching, setIsSavingAndSwitching] = useState(false);
	const pendingModeRef = useRef<FileViewerMode | null>(null);
	const filePath = fileViewer?.filePath ?? "";
	const viewMode = fileViewer?.viewMode ?? "raw";
	const isPinned = fileViewer?.isPinned ?? false;
	const diffCategory = fileViewer?.diffCategory;
	const commitHash = fileViewer?.commitHash;
	const oldPath = fileViewer?.oldPath;
	const initialLine = fileViewer?.initialLine;
	const initialColumn = fileViewer?.initialColumn;

	const pinPane = useTabsStore((s) => s.pinPane);

	const { handleSaveRaw, handleSaveDiff } = useFileSave({
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
		originalDiffContentRef.current = "";
		currentDiffContentRef.current = "";
		draftContentRef.current = null;
	}, [filePath]);

	// Auto-pin when user makes edits (converts preview to pinned)
	useEffect(() => {
		if (isDirty && !isPinned) {
			pinPane(paneId);
		}
	}, [isDirty, isPinned, paneId, pinPane]);

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
			<BasePaneWindow
				paneId={paneId}
				path={path}
				tabId={tabId}
				isActive={isActive}
				splitPaneAuto={splitPaneAuto}
				removePane={removePane}
				setFocusedPane={setFocusedPane}
				renderToolbar={() => <div className="h-full w-full" />}
			>
				<div className="flex items-center justify-center h-full text-muted-foreground">
					No file viewer state
				</div>
			</BasePaneWindow>
		);
	}

	const handlePin = () => {
		pinPane(paneId);
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

	return (
		<>
			<BasePaneWindow
				paneId={paneId}
				path={path}
				tabId={tabId}
				isActive={isActive}
				splitPaneAuto={splitPaneAuto}
				removePane={removePane}
				setFocusedPane={setFocusedPane}
				contentClassName="w-full h-full overflow-hidden bg-background"
				renderToolbar={(handlers) => (
					<div className="flex h-full w-full">
						<FileViewerToolbar
							fileName={fileName}
							isDirty={isDirty}
							viewMode={viewMode}
							isPinned={isPinned}
							isMarkdown={isMarkdown}
							hasDiff={hasDiff}
							splitOrientation={handlers.splitOrientation}
							diffViewMode={diffViewMode}
							hideUnchangedRegions={hideUnchangedRegions}
							onViewModeChange={handleViewModeChange}
							onDiffViewModeChange={setDiffViewMode}
							onToggleHideUnchangedRegions={toggleHideUnchangedRegions}
							onSplitPane={handlers.onSplitPane}
							onPin={handlePin}
							onClosePane={handlers.onClosePane}
						/>
					</div>
				)}
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
					diffViewMode={diffViewMode}
					hideUnchangedRegions={hideUnchangedRegions}
					onSaveRaw={handleSaveRaw}
					onSaveDiff={isDiffEditable ? handleSaveDiff : undefined}
					onEditorChange={handleEditorChange}
					onDiffChange={isDiffEditable ? handleDiffChange : undefined}
					setIsDirty={setIsDirty}
					// Context menu props
					onSplitHorizontal={() => splitPaneHorizontal(tabId, paneId, path)}
					onSplitVertical={() => splitPaneVertical(tabId, paneId, path)}
					onClosePane={() => removePane(paneId)}
					currentTabId={tabId}
					availableTabs={availableTabs}
					onMoveToTab={onMoveToTab}
					onMoveToNewTab={onMoveToNewTab}
				/>
			</BasePaneWindow>
			<UnsavedChangesDialog
				open={showUnsavedDialog}
				onOpenChange={setShowUnsavedDialog}
				onSaveAndSwitch={handleSaveAndSwitch}
				onDiscardAndSwitch={handleDiscardAndSwitch}
				isSaving={isSavingAndSwitching}
			/>
		</>
	);
}
