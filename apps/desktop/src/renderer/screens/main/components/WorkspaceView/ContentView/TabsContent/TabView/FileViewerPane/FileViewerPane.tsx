import { Alert, AlertDescription, AlertTitle } from "@superset/ui/alert";
import { Button } from "@superset/ui/button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import type { MarkdownEditorAdapter } from "renderer/components/MarkdownRenderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { FileSaveConflictDialog } from "renderer/screens/main/components/WorkspaceView/components/FileSaveConflictDialog";
import { useWorkspaceFileEvents } from "renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceFileEvents";
import { useChangesStore } from "renderer/stores/changes";
import {
	applyLoadedDocumentContent,
	bindFileViewerSession,
	cancelPendingIntent,
	clearDocumentConflict,
	discardDocumentChanges,
	getEditorDocumentBaselineContent,
	getEditorDocumentCurrentContent,
	hasEditorDocumentInitialized,
	markDocumentSaved,
	requestPaneClose,
	requestViewModeChange,
	resumePendingIntent,
	setDocumentConflict,
	setDocumentExternalDiskChange,
	updateDocumentDraft,
} from "renderer/stores/editor-state/editorCoordinator";
import {
	buildEditorDocumentKey,
	type EditorPendingIntent,
} from "renderer/stores/editor-state/types";
import { useEditorDocumentsStore } from "renderer/stores/editor-state/useEditorDocumentsStore";
import { useEditorSessionsStore } from "renderer/stores/editor-state/useEditorSessionsStore";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { SplitPaneOptions, Tab } from "renderer/stores/tabs/types";
import {
	pathsMatch,
	retargetAbsolutePath,
	toAbsoluteWorkspacePath,
} from "shared/absolute-paths";
import { isImageFile, isMarkdownFile } from "shared/file-types";
import type { FileViewerMode } from "shared/tabs-types";
import type { CodeEditorAdapter } from "../../../components";
import { BasePaneWindow } from "../components";
import { FileViewerContent } from "./components/FileViewerContent";
import { FileViewerToolbar } from "./components/FileViewerToolbar";
import { useDiffSearch } from "./hooks/useDiffSearch";
import { useFileContent } from "./hooks/useFileContent";
import { useFileSave } from "./hooks/useFileSave";
import { useMarkdownSearch } from "./hooks/useMarkdownSearch";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

interface FileViewerPaneProps {
	paneId: string;
	path: MosaicBranch[];
	tabId: string;
	workspaceId: string;
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
		options?: SplitPaneOptions,
	) => void;
	splitPaneVertical: (
		tabId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
		options?: SplitPaneOptions,
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
	availableTabs: Tab[];
	onMoveToTab: (targetTabId: string) => void;
	onMoveToNewTab: () => void;
}

function getUnsavedDialogCopy(intent: EditorPendingIntent | null) {
	switch (intent?.type) {
		case "close-pane":
			return {
				description:
					"You have unsaved changes in this file. What would you like to do before closing the pane?",
				discardLabel: "Discard & Close Pane",
				saveLabel: "Save & Close Pane",
			};
		case "close-tab":
			return {
				description:
					"You have unsaved changes in this file. What would you like to do before closing the tab?",
				discardLabel: "Discard & Close Tab",
				saveLabel: "Save & Close Tab",
			};
		case "replace-preview":
			return {
				description:
					"You have unsaved changes in this preview pane. What would you like to do before opening a different file here?",
				discardLabel: "Discard & Open File",
				saveLabel: "Save & Open File",
			};
		default:
			return {
				description:
					"You have unsaved changes. What would you like to do before switching views?",
				discardLabel: "Discard & Switch",
				saveLabel: "Save & Switch",
			};
	}
}

export function FileViewerPane({
	paneId,
	path,
	tabId,
	workspaceId,
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
	const fileViewer = useTabsStore((s) => s.panes[paneId]?.fileViewer);
	const isFocused = useTabsStore((s) => s.focusedPaneIds[tabId] === paneId);
	const equalizePaneSplits = useTabsStore((s) => s.equalizePaneSplits);
	const pinPane = useTabsStore((s) => s.pinPane);
	const {
		viewMode: diffViewMode,
		setViewMode: setDiffViewMode,
		hideUnchangedRegions,
		toggleHideUnchangedRegions,
	} = useChangesStore();

	const editorRef = useRef<CodeEditorAdapter | null>(null);
	const markdownEditorRef = useRef<MarkdownEditorAdapter | null>(null);
	const markdownContainerRef = useRef<HTMLDivElement>(null);
	const diffContainerRef = useRef<HTMLDivElement>(null);
	const pendingRenamePathRef = useRef<string | null>(null);
	const preserveDocumentStateRef = useRef(false);
	const [isResolvingIntent, setIsResolvingIntent] = useState(false);

	const filePath = fileViewer?.filePath ?? "";
	const viewMode = fileViewer?.viewMode ?? "raw";
	const isPinned = fileViewer?.isPinned ?? false;
	const diffCategory = fileViewer?.diffCategory;
	const commitHash = fileViewer?.commitHash;
	const oldPath = fileViewer?.oldPath;
	const initialLine = fileViewer?.initialLine;
	const initialColumn = fileViewer?.initialColumn;

	const documentKey = useMemo(
		() =>
			buildEditorDocumentKey({
				workspaceId,
				filePath,
				diffCategory,
				commitHash,
				oldPath,
			}),
		[workspaceId, filePath, diffCategory, commitHash, oldPath],
	);
	const documentState = useEditorDocumentsStore(
		(state) => state.documents[documentKey],
	);
	const session = useEditorSessionsStore((state) => state.sessions[paneId]);
	const isDirty = documentState?.dirty ?? false;
	const saveConflict = documentState?.conflict ?? null;
	const hasExternalDiskChange = documentState?.hasExternalDiskChange ?? false;
	const unsavedDialogOpen = session?.dialog === "unsaved";
	const conflictDialogOpen =
		session?.dialog === "conflict" && saveConflict !== null;

	const markdownSearch = useMarkdownSearch({
		containerRef: markdownContainerRef,
		isFocused,
		isRenderedMode: viewMode === "rendered",
		filePath,
	});

	const diffSearch = useDiffSearch({
		containerRef: diffContainerRef,
		isFocused,
		isDiffMode: viewMode === "diff",
		filePath,
	});

	const getCurrentContent = useCallback(() => {
		if (hasEditorDocumentInitialized(documentKey)) {
			return getEditorDocumentCurrentContent(documentKey);
		}

		if (viewMode === "rendered") {
			return markdownEditorRef.current?.getValue() ?? "";
		}

		return editorRef.current?.getValue() ?? "";
	}, [documentKey, viewMode]);

	const {
		rawFileData,
		isLoadingRaw,
		imageData,
		isLoadingImage,
		diffData,
		isLoadingDiff,
		rawRevision,
		workingCopyRevision,
	} = useFileContent({
		workspaceId,
		worktreePath,
		filePath,
		viewMode,
		diffCategory,
		commitHash,
		oldPath,
	});

	useEffect(() => {
		if (!fileViewer) {
			return;
		}

		const preserveDocumentState =
			preserveDocumentStateRef.current ||
			(pendingRenamePathRef.current !== null &&
				pathsMatch(pendingRenamePathRef.current, filePath));

		bindFileViewerSession(
			paneId,
			{
				workspaceId,
				filePath,
				diffCategory,
				commitHash,
				oldPath,
			},
			{
				preserveDocumentState,
			},
		);

		if (preserveDocumentState) {
			preserveDocumentStateRef.current = false;
			pendingRenamePathRef.current = null;
		}
	}, [
		paneId,
		fileViewer,
		workspaceId,
		filePath,
		diffCategory,
		commitHash,
		oldPath,
	]);

	const { handleSaveFile, isSaving } = useFileSave({
		workspaceId,
		filePath,
		paneId,
		diffCategory,
		getCurrentContent,
		getRevision: () =>
			useEditorDocumentsStore.getState().documents[documentKey]
				?.baselineRevision ?? null,
		onSaveSuccess: ({ savedContent, currentContent, revision }) => {
			if (diffCategory === "staged") {
				preserveDocumentStateRef.current = true;
			}
			markDocumentSaved(documentKey, {
				savedContent,
				currentContent,
				revision,
			});
		},
	});

	const performFileSave = useCallback(
		async (options?: { force?: boolean }) => {
			try {
				const result = await handleSaveFile(options);
				if (result?.status === "conflict") {
					setDocumentConflict(documentKey, result.currentContent, paneId);
				}
				return result;
			} catch (error) {
				console.error("[FileViewerPane] Save failed:", error);
				return undefined;
			}
		},
		[documentKey, handleSaveFile, paneId],
	);

	useEffect(() => {
		if (viewMode === "diff" || isLoadingRaw || !rawFileData?.ok || isDirty) {
			return;
		}

		applyLoadedDocumentContent(
			documentKey,
			rawFileData.content,
			rawRevision ?? workingCopyRevision ?? null,
		);
	}, [
		documentKey,
		isDirty,
		isLoadingRaw,
		rawFileData,
		rawRevision,
		viewMode,
		workingCopyRevision,
	]);

	const absoluteFilePath = useMemo(
		() => toAbsoluteWorkspacePath(worktreePath, filePath),
		[worktreePath, filePath],
	);
	const baselineContent = getEditorDocumentBaselineContent(documentKey);

	useEffect(() => {
		const nextHasExternalDiskChange =
			isDirty &&
			viewMode !== "diff" &&
			((rawFileData?.ok === true && rawFileData.content !== baselineContent) ||
				(rawFileData?.ok === false && rawFileData.reason === "not-found"));

		setDocumentExternalDiskChange(documentKey, nextHasExternalDiskChange);
	}, [baselineContent, documentKey, isDirty, rawFileData, viewMode]);

	const trpcUtils = electronTrpc.useUtils();
	const invalidateCurrentFile = useCallback(() => {
		if (!filePath) {
			return;
		}

		const invalidations: Promise<unknown>[] = [];
		if (viewMode === "diff") {
			invalidations.push(
				trpcUtils.changes.getGitFileContents.invalidate({
					worktreePath,
					absolutePath: absoluteFilePath,
					oldAbsolutePath: oldPath,
				}),
				trpcUtils.changes.getGitOriginalContent.invalidate({
					worktreePath,
					absolutePath: absoluteFilePath,
					oldAbsolutePath: oldPath,
				}),
			);
		}

		if (workspaceId) {
			invalidations.push(
				trpcUtils.filesystem.readFile.invalidate({
					workspaceId,
					absolutePath: absoluteFilePath,
				}),
			);
		}

		Promise.all(invalidations).catch((error) => {
			console.error("[FileViewerPane] Failed to invalidate file queries:", {
				absolutePath: absoluteFilePath,
				error,
			});
		});
	}, [
		absoluteFilePath,
		filePath,
		oldPath,
		trpcUtils,
		viewMode,
		workspaceId,
		worktreePath,
	]);

	const handleContentChange = useCallback(
		(value: string | undefined) => {
			if (value === undefined) {
				return;
			}

			const dirty = updateDocumentDraft(documentKey, value);
			if (dirty && !isPinned) {
				pinPane(paneId);
				useEditorSessionsStore.getState().patchSession(paneId, {
					autoPinnedBecauseDirty: true,
				});
			}
		},
		[documentKey, isPinned, paneId, pinPane],
	);

	useEffect(() => {
		if (!isDirty) {
			clearDocumentConflict(documentKey);
		}
	}, [documentKey, isDirty]);

	useWorkspaceFileEvents(
		workspaceId ?? "",
		(event) => {
			if (event.type === "overflow") {
				invalidateCurrentFile();
				return;
			}

			if (event.type === "rename") {
				if (!event.absolutePath || !event.oldAbsolutePath) {
					return;
				}

				const nextFilePath = retargetAbsolutePath(
					absoluteFilePath,
					event.oldAbsolutePath,
					event.absolutePath,
					Boolean(event.isDirectory),
				);
				if (!nextFilePath) {
					return;
				}

				pendingRenamePathRef.current = nextFilePath;
				return;
			}

			if (
				!event.absolutePath ||
				!pathsMatch(event.absolutePath, absoluteFilePath)
			) {
				return;
			}

			invalidateCurrentFile();
		},
		Boolean(workspaceId && worktreePath && absoluteFilePath),
	);

	const handlePin = () => {
		pinPane(paneId);
	};

	const switchToMode = useCallback(
		(
			newMode: FileViewerMode,
			location?: {
				line?: number;
				column?: number;
			},
		) => {
			const panes = useTabsStore.getState().panes;
			const currentPane = panes[paneId];
			if (!currentPane?.fileViewer) {
				return;
			}

			useTabsStore.setState({
				panes: {
					...panes,
					[paneId]: {
						...currentPane,
						fileViewer: {
							...currentPane.fileViewer,
							viewMode: newMode,
							initialLine: location?.line ?? currentPane.fileViewer.initialLine,
							initialColumn:
								location?.column ?? currentPane.fileViewer.initialColumn,
						},
					},
				},
			});
		},
		[paneId],
	);

	const handleSwitchToRawAtLocation = (line: number, column: number) => {
		switchToMode("raw", { line, column });
	};

	const handleViewModeChange = (value: string) => {
		if (!value) return;
		void requestViewModeChange(paneId, value as FileViewerMode);
	};

	const handleEditorSave = useCallback(() => {
		void performFileSave();
	}, [performFileSave]);

	const handleSavePendingIntent = useCallback(async () => {
		setIsResolvingIntent(true);
		const result = await performFileSave();
		if (result?.status === "saved") {
			resumePendingIntent(paneId);
		}
		setIsResolvingIntent(false);
	}, [paneId, performFileSave]);

	const handleDiscardPendingIntent = useCallback(() => {
		if (
			session?.pendingIntent?.type === "change-view-mode" ||
			(documentState?.sessionPaneIds.length ?? 0) <= 1
		) {
			discardDocumentChanges(documentKey);
		}
		resumePendingIntent(paneId);
	}, [
		documentKey,
		documentState?.sessionPaneIds.length,
		paneId,
		session?.pendingIntent?.type,
	]);

	const handleCloseUnsavedDialog = useCallback(
		(open: boolean) => {
			if (!open) {
				cancelPendingIntent(paneId);
			}
		},
		[paneId],
	);

	const handleReloadFromDisk = useCallback(() => {
		const nextDiskContent =
			saveConflict?.diskContent ??
			(rawFileData?.ok === true ? rawFileData.content : "");

		applyLoadedDocumentContent(
			documentKey,
			nextDiskContent,
			rawRevision ?? workingCopyRevision ?? null,
		);
		clearDocumentConflict(documentKey);
		useEditorSessionsStore.getState().patchSession(paneId, {
			dialog: "none",
		});
		invalidateCurrentFile();

		if (useEditorSessionsStore.getState().sessions[paneId]?.pendingIntent) {
			resumePendingIntent(paneId);
		}
	}, [
		documentKey,
		invalidateCurrentFile,
		paneId,
		rawFileData,
		rawRevision,
		saveConflict,
		workingCopyRevision,
	]);

	const handleOverwriteSave = useCallback(async () => {
		const result = await performFileSave({ force: true });
		if (result?.status !== "saved") {
			return;
		}

		clearDocumentConflict(documentKey);
		useEditorSessionsStore.getState().patchSession(paneId, {
			dialog: "none",
		});
		if (useEditorSessionsStore.getState().sessions[paneId]?.pendingIntent) {
			resumePendingIntent(paneId);
		}
	}, [documentKey, paneId, performFileSave]);

	const fileName = filePath.split("/").pop() || filePath;
	const currentDocumentContent = getEditorDocumentCurrentContent(documentKey);
	const renderedContent = useMemo(() => {
		if (hasEditorDocumentInitialized(documentKey)) {
			return currentDocumentContent;
		}

		if (rawFileData?.ok === true) {
			return rawFileData.content;
		}

		return "";
	}, [currentDocumentContent, documentKey, rawFileData]);
	const hasRenderedMode = isMarkdownFile(filePath) || isImageFile(filePath);
	const hasDiff = !!diffCategory;
	const unsavedDialogCopy = getUnsavedDialogCopy(
		session?.pendingIntent ?? null,
	);

	if (!fileViewer) {
		return (
			<BasePaneWindow
				paneId={paneId}
				path={path}
				tabId={tabId}
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

	return (
		<>
			<BasePaneWindow
				paneId={paneId}
				path={path}
				tabId={tabId}
				splitPaneAuto={splitPaneAuto}
				removePane={requestPaneClose}
				setFocusedPane={setFocusedPane}
				contentClassName="w-full h-full overflow-hidden bg-background"
				renderToolbar={(handlers) => (
					<div className="flex h-full w-full">
						<FileViewerToolbar
							fileName={fileName}
							filePath={filePath}
							isDirty={isDirty}
							viewMode={viewMode}
							isPinned={isPinned}
							hasRenderedMode={hasRenderedMode}
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
				<div className="flex h-full min-h-0 flex-col">
					{hasExternalDiskChange && (
						<div className="border-b px-3 py-2">
							<Alert variant="destructive">
								<AlertTitle>File changed on disk</AlertTitle>
								<AlertDescription>
									This editor has unsaved changes. Saving now will require
									confirming the diff before overwriting the file.
									<div className="mt-2 flex gap-2">
										<Button
											size="sm"
											variant="outline"
											onClick={handleReloadFromDisk}
										>
											Reload From Disk
										</Button>
										<Button
											size="sm"
											onClick={() => {
												setDocumentConflict(
													documentKey,
													rawFileData?.ok === true ? rawFileData.content : null,
													paneId,
												);
											}}
										>
											Review Diff
										</Button>
									</div>
								</AlertDescription>
							</Alert>
						</div>
					)}
					<div className="min-h-0 flex-1">
						<FileViewerContent
							viewMode={viewMode}
							filePath={filePath}
							isLoadingRaw={isLoadingRaw}
							isLoadingImage={isLoadingImage}
							isLoadingDiff={isLoadingDiff}
							rawFileData={rawFileData}
							imageData={imageData}
							diffData={diffData}
							editorRef={editorRef}
							markdownEditorRef={markdownEditorRef}
							renderedContent={renderedContent}
							initialLine={initialLine}
							initialColumn={initialColumn}
							diffViewMode={diffViewMode}
							hideUnchangedRegions={hideUnchangedRegions}
							onSaveFile={handleEditorSave}
							onContentChange={handleContentChange}
							onSwitchToRawAtLocation={handleSwitchToRawAtLocation}
							onSplitHorizontal={() => splitPaneHorizontal(tabId, paneId, path)}
							onSplitVertical={() => splitPaneVertical(tabId, paneId, path)}
							onSplitWithNewChat={() =>
								splitPaneVertical(tabId, paneId, path, {
									paneType: "chat",
								})
							}
							onSplitWithNewBrowser={() =>
								splitPaneVertical(tabId, paneId, path, { paneType: "webview" })
							}
							onEqualizePaneSplits={() => equalizePaneSplits(tabId)}
							onClosePane={() => requestPaneClose(paneId)}
							currentTabId={tabId}
							availableTabs={availableTabs}
							onMoveToTab={onMoveToTab}
							onMoveToNewTab={onMoveToNewTab}
							diffContainerRef={diffContainerRef}
							diffSearch={diffSearch}
							markdownContainerRef={markdownContainerRef}
							markdownSearch={markdownSearch}
						/>
					</div>
				</div>
			</BasePaneWindow>
			<UnsavedChangesDialog
				open={unsavedDialogOpen}
				onOpenChange={handleCloseUnsavedDialog}
				onSave={handleSavePendingIntent}
				onDiscard={handleDiscardPendingIntent}
				isSaving={isResolvingIntent}
				description={unsavedDialogCopy.description}
				discardLabel={unsavedDialogCopy.discardLabel}
				saveLabel={unsavedDialogCopy.saveLabel}
			/>
			<FileSaveConflictDialog
				open={conflictDialogOpen}
				onOpenChange={(open) => {
					if (!open) {
						clearDocumentConflict(documentKey);
						useEditorSessionsStore.getState().patchSession(paneId, {
							dialog: "none",
						});
					}
				}}
				filePath={filePath}
				localContent={getCurrentContent()}
				diskContent={saveConflict?.diskContent ?? null}
				isSaving={isSaving}
				onKeepEditing={() => {
					clearDocumentConflict(documentKey);
					useEditorSessionsStore.getState().patchSession(paneId, {
						dialog: "none",
					});
				}}
				onReloadFromDisk={handleReloadFromDisk}
				onOverwrite={() => {
					void handleOverwriteSave();
				}}
			/>
		</>
	);
}
