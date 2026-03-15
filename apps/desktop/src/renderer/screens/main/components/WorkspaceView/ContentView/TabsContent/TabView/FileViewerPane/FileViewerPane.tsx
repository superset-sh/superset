import { Alert, AlertDescription, AlertTitle } from "@superset/ui/alert";
import { Button } from "@superset/ui/button";
import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { FileSaveConflictDialog } from "renderer/screens/main/components/WorkspaceView/components/FileSaveConflictDialog";
import { useWorkspaceFileEvents } from "renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceFileEvents";
import { useChangesStore } from "renderer/stores/changes";
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
import { useFileContent } from "./hooks/useFileContent";
import { useFileSave } from "./hooks/useFileSave";
import { useMarkdownSearch } from "./hooks/useMarkdownSearch";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

interface FileViewerPaneProps {
	paneId: string;
	path: MosaicBranch[];
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

export function FileViewerPane({
	paneId,
	path,
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
	const { workspaceId } = useParams({ strict: false });
	const fileViewer = useTabsStore((s) => s.panes[paneId]?.fileViewer);
	const isFocused = useTabsStore((s) => s.focusedPaneIds[tabId] === paneId);
	const equalizePaneSplits = useTabsStore((s) => s.equalizePaneSplits);
	const {
		viewMode: diffViewMode,
		setViewMode: setDiffViewMode,
		hideUnchangedRegions,
		toggleHideUnchangedRegions,
	} = useChangesStore();

	const editorRef = useRef<CodeEditorAdapter | null>(null);
	const markdownContainerRef = useRef<HTMLDivElement>(null);
	const storedDraft = fileViewer?.draftContent ?? null;
	const [isDirty, setIsDirty] = useState(!!storedDraft);
	const originalContentRef = useRef<string>("");
	const draftContentRef = useRef<string | null>(storedDraft);
	const originalDiffContentRef = useRef<string>("");
	const revisionRef = useRef<string>("");
	const restoringDraftRef = useRef(!!storedDraft);
	const isDirtyRef = useRef(isDirty);
	isDirtyRef.current = isDirty;
	const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
	const [isSavingAndSwitching, setIsSavingAndSwitching] = useState(false);
	const [saveConflict, setSaveConflict] = useState<{
		localContent: string;
		diskContent: string | null;
	} | null>(null);
	const pendingModeRef = useRef<FileViewerMode | null>(null);
	const pendingRenamePathRef = useRef<string | null>(null);
	const filePath = fileViewer?.filePath ?? "";
	const viewMode = fileViewer?.viewMode ?? "raw";
	const isPinned = fileViewer?.isPinned ?? false;
	const diffCategory = fileViewer?.diffCategory;
	const commitHash = fileViewer?.commitHash;
	const oldPath = fileViewer?.oldPath;
	const initialLine = fileViewer?.initialLine;
	const initialColumn = fileViewer?.initialColumn;

	const pinPane = useTabsStore((s) => s.pinPane);
	const trpcUtils = electronTrpc.useUtils();

	const markdownSearch = useMarkdownSearch({
		containerRef: markdownContainerRef,
		isFocused,
		isRenderedMode: viewMode === "rendered",
		filePath,
	});

	const { handleSaveRaw, isSaving } = useFileSave({
		workspaceId,
		filePath,
		paneId,
		diffCategory,
		editorRef,
		originalContentRef,
		originalDiffContentRef,
		draftContentRef,
		revisionRef,
		setIsDirty,
	});

	const {
		rawFileData,
		isLoadingRaw,
		imageData,
		isLoadingImage,
		diffData,
		isLoadingDiff,
	} = useFileContent({
		workspaceId,
		worktreePath,
		filePath,
		viewMode,
		diffCategory,
		commitHash,
		oldPath,
		isDirty,
		originalContentRef,
		originalDiffContentRef,
		revisionRef,
	});
	const absoluteFilePath = useMemo(
		() => toAbsoluteWorkspacePath(worktreePath, filePath),
		[worktreePath, filePath],
	);
	const hasExternalDiskChange =
		isDirty &&
		viewMode === "raw" &&
		((rawFileData?.ok === true &&
			rawFileData.content !== originalContentRef.current) ||
			(rawFileData?.ok === false && rawFileData.reason === "not-found"));

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

	const updateStoreDraft = useCallback(
		(draft: string | undefined) => {
			const panes = useTabsStore.getState().panes;
			const pane = panes[paneId];
			if (!pane?.fileViewer) return;
			if (pane.fileViewer.draftContent === draft) return;
			useTabsStore.setState({
				panes: {
					...panes,
					[paneId]: {
						...pane,
						fileViewer: { ...pane.fileViewer, draftContent: draft },
					},
				},
			});
		},
		[paneId],
	);

	const handleEditorChange = useCallback((value: string | undefined) => {
		if (value === undefined) return;
		draftContentRef.current = value;
		if (originalContentRef.current === "") {
			if (!restoringDraftRef.current) {
				originalContentRef.current = value;
			}
			return;
		}
		restoringDraftRef.current = false;
		setIsDirty(value !== originalContentRef.current);
	}, []);

	useEffect(() => {
		if (
			pendingRenamePathRef.current &&
			pathsMatch(pendingRenamePathRef.current, filePath)
		) {
			pendingRenamePathRef.current = null;
			return;
		}

		pendingRenamePathRef.current = null;
		setIsDirty(false);
		originalContentRef.current = "";
		originalDiffContentRef.current = "";
		draftContentRef.current = null;
		restoringDraftRef.current = false;
		updateStoreDraft(undefined);
		setSaveConflict(null);
	}, [filePath, updateStoreDraft]);

	// Save draft to store on unmount so it survives tab switches
	// biome-ignore lint/correctness/useExhaustiveDependencies: cleanup-only effect keyed to paneId lifetime
	useEffect(() => {
		return () => {
			if (isDirtyRef.current && draftContentRef.current !== null) {
				updateStoreDraft(draftContentRef.current);
			} else {
				updateStoreDraft(undefined);
			}
		};
	}, [paneId, updateStoreDraft]);

	// When restoring a draft, set originalContent from rawFileData once available
	useEffect(() => {
		if (
			restoringDraftRef.current &&
			rawFileData?.ok &&
			originalContentRef.current === ""
		) {
			originalContentRef.current = rawFileData.content;
			restoringDraftRef.current = false;
			if (draftContentRef.current !== null) {
				setIsDirty(draftContentRef.current !== rawFileData.content);
			}
		}
	}, [rawFileData]);

	useEffect(() => {
		if (isDirty && !isPinned) {
			pinPane(paneId);
		}
	}, [isDirty, isPinned, paneId, pinPane]);

	useEffect(() => {
		if (!isDirty) {
			setSaveConflict(null);
		}
	}, [isDirty]);

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
			if (currentPane?.fileViewer) {
				useTabsStore.setState({
					panes: {
						...panes,
						[paneId]: {
							...currentPane,
							fileViewer: {
								...currentPane.fileViewer,
								viewMode: newMode,
								initialLine:
									location?.line ?? currentPane.fileViewer.initialLine,
								initialColumn:
									location?.column ?? currentPane.fileViewer.initialColumn,
							},
						},
					},
				});
			}
		},
		[paneId],
	);

	const handleSwitchToRawAtLocation = (line: number, column: number) => {
		switchToMode("raw", { line, column });
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

	const completePendingModeSwitch = useCallback(() => {
		if (!pendingModeRef.current) {
			return;
		}

		switchToMode(pendingModeRef.current);
		pendingModeRef.current = null;
		setShowUnsavedDialog(false);
	}, [switchToMode]);

	const handleSaveAndSwitch = async () => {
		if (!pendingModeRef.current) return;

		setIsSavingAndSwitching(true);
		try {
			if (viewMode === "raw" && editorRef.current) {
				const result = await handleSaveRaw();
				if (result?.status === "conflict") {
					setSaveConflict({
						localContent: editorRef.current.getValue(),
						diskContent: result.currentContent,
					});
					setShowUnsavedDialog(false);
					return;
				}
			}

			completePendingModeSwitch();
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
		updateStoreDraft(undefined);
		setSaveConflict(null);

		completePendingModeSwitch();
	};

	const handleReloadFromDisk = useCallback(() => {
		const nextDiskContent =
			saveConflict?.diskContent ??
			(rawFileData?.ok === true ? rawFileData.content : null);

		if (editorRef.current) {
			editorRef.current.setValue(nextDiskContent ?? "");
		}

		originalContentRef.current = nextDiskContent ?? "";
		originalDiffContentRef.current = "";
		draftContentRef.current = null;
		updateStoreDraft(undefined);
		setIsDirty(false);
		setSaveConflict(null);
		invalidateCurrentFile();

		if (pendingModeRef.current) {
			completePendingModeSwitch();
		}
	}, [
		completePendingModeSwitch,
		invalidateCurrentFile,
		rawFileData,
		saveConflict,
		updateStoreDraft,
	]);

	const handleOverwriteSave = useCallback(async () => {
		const result = await handleSaveRaw({ force: true });
		if (result?.status !== "saved") {
			return;
		}

		setSaveConflict(null);
		if (pendingModeRef.current) {
			completePendingModeSwitch();
		}
	}, [completePendingModeSwitch, handleSaveRaw]);

	const fileName = filePath.split("/").pop() || filePath;
	const hasRenderedMode = isMarkdownFile(filePath) || isImageFile(filePath);
	const hasDiff = !!diffCategory;

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
				removePane={removePane}
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
												setSaveConflict({
													localContent:
														editorRef.current?.getValue() ??
														draftContentRef.current ??
														"",
													diskContent:
														rawFileData?.ok === true
															? rawFileData.content
															: null,
												});
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
							originalContentRef={originalContentRef}
							draftContentRef={draftContentRef}
							initialLine={initialLine}
							initialColumn={initialColumn}
							diffViewMode={diffViewMode}
							hideUnchangedRegions={hideUnchangedRegions}
							onSaveRaw={handleSaveRaw}
							onEditorChange={handleEditorChange}
							setIsDirty={setIsDirty}
							onSwitchToRawAtLocation={handleSwitchToRawAtLocation}
							// Context menu props
							onSplitHorizontal={() => splitPaneHorizontal(tabId, paneId, path)}
							onSplitVertical={() => splitPaneVertical(tabId, paneId, path)}
							onSplitWithNewChat={() =>
								splitPaneVertical(tabId, paneId, path, {
									paneType: "chat-mastra",
								})
							}
							onSplitWithNewBrowser={() =>
								splitPaneVertical(tabId, paneId, path, { paneType: "webview" })
							}
							onEqualizePaneSplits={() => equalizePaneSplits(tabId)}
							onClosePane={() => removePane(paneId)}
							currentTabId={tabId}
							availableTabs={availableTabs}
							onMoveToTab={onMoveToTab}
							onMoveToNewTab={onMoveToNewTab}
							// Markdown search props
							markdownContainerRef={markdownContainerRef}
							markdownSearch={markdownSearch}
						/>
					</div>
				</div>
			</BasePaneWindow>
			<UnsavedChangesDialog
				open={showUnsavedDialog}
				onOpenChange={setShowUnsavedDialog}
				onSaveAndSwitch={handleSaveAndSwitch}
				onDiscardAndSwitch={handleDiscardAndSwitch}
				isSaving={isSavingAndSwitching}
			/>
			<FileSaveConflictDialog
				open={saveConflict !== null}
				onOpenChange={(open) => {
					if (!open) {
						setSaveConflict(null);
					}
				}}
				filePath={filePath}
				localContent={
					saveConflict?.localContent ??
					editorRef.current?.getValue() ??
					draftContentRef.current ??
					""
				}
				diskContent={saveConflict?.diskContent ?? null}
				isSaving={isSaving}
				onKeepEditing={() => setSaveConflict(null)}
				onReloadFromDisk={handleReloadFromDisk}
				onOverwrite={() => {
					void handleOverwriteSave();
				}}
			/>
		</>
	);
}
