import { invalidateFileSaveQueries } from "renderer/lib/invalidate-file-save-queries";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { AddFileViewerPaneOptions } from "renderer/stores/tabs/types";
import { resolveFileViewerMode } from "renderer/stores/tabs/utils";
import { getPathBaseName } from "shared/absolute-paths";
import {
	deleteDocumentBuffer,
	discardDocumentCurrentContent,
	getDocumentBaselineContent,
	getDocumentCurrentContent,
	hasInitializedDocumentBuffer,
	markDocumentSavedContent,
	setDocumentCurrentContent,
	setDocumentLoadedContent,
	transferDocumentBuffer,
} from "./editorBufferRegistry";
import {
	buildEditorDocumentKey,
	type EditorDocumentState,
	type EditorPendingIntent,
	type EditorSaveResult,
	type FileViewerDocumentIdentity,
	isEditableFileViewerDocument,
} from "./types";
import { useEditorDocumentsStore } from "./useEditorDocumentsStore";
import { useEditorSessionsStore } from "./useEditorSessionsStore";

const MAX_FILE_SIZE = 2 * 1024 * 1024;

function getDocumentState(
	documentKey: string,
): EditorDocumentState | undefined {
	return useEditorDocumentsStore.getState().documents[documentKey];
}

function focusPane(paneId: string): void {
	const tabsState = useTabsStore.getState();
	const pane = tabsState.panes[paneId];
	if (!pane) {
		return;
	}

	const tab = tabsState.tabs.find((item) => item.id === pane.tabId);
	if (tab) {
		tabsState.setActiveTab(tab.workspaceId, tab.id);
	}
	tabsState.setFocusedPane(pane.tabId, paneId);
}

function cleanupDocumentIfOrphaned(documentKey: string): void {
	const document = getDocumentState(documentKey);
	if (document && document.sessionPaneIds.length > 0) {
		return;
	}

	useEditorDocumentsStore.getState().removeDocument(documentKey);
	deleteDocumentBuffer(documentKey);
}

function applyFileViewerReplacement(
	paneId: string,
	workspaceId: string,
	options: AddFileViewerPaneOptions,
): void {
	const tabsState = useTabsStore.getState();
	const pane = tabsState.panes[paneId];
	if (!pane?.fileViewer) {
		return;
	}

	const fileName = options.displayName ?? getPathBaseName(options.filePath);
	const viewMode = resolveFileViewerMode({
		filePath: options.filePath,
		diffCategory: options.diffCategory,
		viewMode: options.viewMode,
		fileStatus: options.fileStatus,
	});

	useTabsStore.setState((state) => ({
		panes: {
			...state.panes,
			[paneId]: {
				...pane,
				name: fileName,
				fileViewer: {
					...pane.fileViewer,
					filePath: options.filePath,
					viewMode,
					isPinned: options.isPinned ?? false,
					diffLayout: "inline",
					diffCategory: options.diffCategory,
					commitHash: options.commitHash,
					oldPath: options.oldPath,
					initialLine: options.line,
					initialColumn: options.column,
					displayName: options.displayName,
				},
			},
		},
		focusedPaneIds: {
			...state.focusedPaneIds,
			[pane.tabId]: paneId,
		},
		activeTabIds: {
			...state.activeTabIds,
			[workspaceId]: pane.tabId,
		},
	}));
}

function executePendingIntent(
	paneId: string,
	intent: EditorPendingIntent,
): void {
	switch (intent.type) {
		case "close-pane":
			useTabsStore.getState().removePane(paneId);
			return;
		case "close-tab":
			useTabsStore.getState().removeTab(intent.tabId);
			return;
		case "change-view-mode": {
			const panes = useTabsStore.getState().panes;
			const pane = panes[paneId];
			if (!pane?.fileViewer) {
				return;
			}

			useTabsStore.setState({
				panes: {
					...panes,
					[paneId]: {
						...pane,
						fileViewer: {
							...pane.fileViewer,
							viewMode: intent.nextMode,
						},
					},
				},
			});
			return;
		}
		case "replace-preview":
			applyFileViewerReplacement(paneId, intent.workspaceId, intent.options);
			return;
		case "quit-app":
			return;
	}
}

function collectDirtyTabDocuments(tabId: string): Array<{
	documentKey: string;
	paneId: string;
}> {
	const tabsState = useTabsStore.getState();
	const panes = Object.values(tabsState.panes).filter(
		(pane) => pane.tabId === tabId,
	);
	const sessions = useEditorSessionsStore.getState().sessions;
	const documents = useEditorDocumentsStore.getState().documents;
	const seen = new Set<string>();
	const dirtyDocs: Array<{ documentKey: string; paneId: string }> = [];

	for (const pane of panes) {
		if (pane.type !== "file-viewer") {
			continue;
		}

		const session = sessions[pane.id];
		if (!session) {
			continue;
		}

		const document = documents[session.documentKey];
		if (!document?.dirty || seen.has(session.documentKey)) {
			continue;
		}

		seen.add(session.documentKey);
		dirtyDocs.push({
			documentKey: session.documentKey,
			paneId: pane.id,
		});
	}

	return dirtyDocs;
}

function isDocumentExclusivelyBoundToTab(
	documentKey: string,
	tabId: string,
): boolean {
	const document = getDocumentState(documentKey);
	if (!document) {
		return true;
	}

	const panes = useTabsStore.getState().panes;
	return document.sessionPaneIds.every(
		(paneId) => panes[paneId]?.tabId === tabId,
	);
}

export function bindFileViewerSession(
	paneId: string,
	identity: FileViewerDocumentIdentity,
	options?: {
		preserveDocumentState?: boolean;
	},
): string {
	const documentKey = buildEditorDocumentKey(identity);
	const documentsStore = useEditorDocumentsStore.getState();
	const sessionsStore = useEditorSessionsStore.getState();
	const currentSession = sessionsStore.sessions[paneId];
	const previousDocumentKey = currentSession?.documentKey;
	const previousDocument = previousDocumentKey
		? documentsStore.documents[previousDocumentKey]
		: undefined;
	const shouldPreserveDocumentState = Boolean(
		previousDocumentKey &&
			previousDocumentKey !== documentKey &&
			previousDocument &&
			options?.preserveDocumentState,
	);

	if (previousDocumentKey && previousDocumentKey !== documentKey) {
		if (shouldPreserveDocumentState && previousDocument) {
			documentsStore.replaceDocumentKey(previousDocumentKey, {
				...previousDocument,
				documentKey,
				workspaceId: identity.workspaceId,
				filePath: identity.filePath,
				isEditable: isEditableFileViewerDocument(identity),
			});
			sessionsStore.replaceDocumentKey(previousDocumentKey, documentKey);
			transferDocumentBuffer(previousDocumentKey, documentKey);
		} else {
			documentsStore.removeSessionBinding(previousDocumentKey, paneId);
			cleanupDocumentIfOrphaned(previousDocumentKey);
		}
	}

	documentsStore.upsertDocument({
		documentKey,
		workspaceId: identity.workspaceId,
		filePath: identity.filePath,
		status: getDocumentState(documentKey)?.status ?? "loading",
		dirty: getDocumentState(documentKey)?.dirty ?? false,
		baselineRevision: getDocumentState(documentKey)?.baselineRevision ?? null,
		hasExternalDiskChange:
			getDocumentState(documentKey)?.hasExternalDiskChange ?? false,
		conflict: getDocumentState(documentKey)?.conflict ?? null,
		isEditable: isEditableFileViewerDocument(identity),
	});
	documentsStore.addSessionBinding(documentKey, paneId);
	sessionsStore.bindSession(paneId, documentKey);

	return documentKey;
}

export function unbindFileViewerSession(paneId: string): void {
	const session = useEditorSessionsStore.getState().sessions[paneId];
	if (!session) {
		return;
	}

	useEditorDocumentsStore
		.getState()
		.removeSessionBinding(session.documentKey, paneId);
	useEditorSessionsStore.getState().clearSession(paneId);
	cleanupDocumentIfOrphaned(session.documentKey);
}

export function updateDocumentDraft(
	documentKey: string,
	content: string,
): boolean {
	setDocumentCurrentContent(documentKey, content);
	const baseline = getDocumentBaselineContent(documentKey);
	const dirty = content !== baseline;

	useEditorDocumentsStore.getState().patchDocument(documentKey, {
		dirty,
		status: "ready",
		contentVersion: (getDocumentState(documentKey)?.contentVersion ?? 0) + 1,
	});

	return dirty;
}

export function applyLoadedDocumentContent(
	documentKey: string,
	content: string,
	revision: string | null,
): void {
	setDocumentLoadedContent(documentKey, content);
	useEditorDocumentsStore.getState().patchDocument(documentKey, {
		dirty: false,
		baselineRevision: revision,
		status: "ready",
		conflict: null,
		hasExternalDiskChange: false,
		contentVersion: (getDocumentState(documentKey)?.contentVersion ?? 0) + 1,
	});
}

export function markDocumentSaved(
	documentKey: string,
	options: {
		savedContent: string;
		currentContent: string;
		revision: string;
	},
): void {
	markDocumentSavedContent(
		documentKey,
		options.savedContent,
		options.currentContent,
	);
	useEditorDocumentsStore.getState().patchDocument(documentKey, {
		dirty: options.currentContent !== options.savedContent,
		baselineRevision: options.revision,
		status: "ready",
		conflict: null,
		hasExternalDiskChange: false,
		contentVersion: (getDocumentState(documentKey)?.contentVersion ?? 0) + 1,
	});
}

export function discardDocumentChanges(documentKey: string): string {
	const nextContent = discardDocumentCurrentContent(documentKey);
	useEditorDocumentsStore.getState().patchDocument(documentKey, {
		dirty: false,
		status: "ready",
		conflict: null,
		hasExternalDiskChange: false,
		contentVersion: (getDocumentState(documentKey)?.contentVersion ?? 0) + 1,
	});
	return nextContent;
}

export function setDocumentSaving(
	documentKey: string,
	isSaving: boolean,
): void {
	useEditorDocumentsStore.getState().patchDocument(documentKey, {
		status: isSaving ? "saving" : "ready",
	});
}

export function setDocumentConflict(
	documentKey: string,
	diskContent: string | null,
	representativePaneId?: string,
): void {
	useEditorDocumentsStore.getState().patchDocument(documentKey, {
		status: "conflict",
		conflict: {
			diskContent,
		},
	});

	const document = getDocumentState(documentKey);
	const paneId = representativePaneId ?? document?.sessionPaneIds[0];
	if (!paneId) {
		return;
	}

	focusPane(paneId);
	useEditorSessionsStore.getState().patchSession(paneId, {
		dialog: "conflict",
	});
}

export function clearDocumentConflict(documentKey: string): void {
	useEditorDocumentsStore.getState().patchDocument(documentKey, {
		status: "ready",
		conflict: null,
	});
}

export function setDocumentExternalDiskChange(
	documentKey: string,
	hasExternalDiskChange: boolean,
): void {
	useEditorDocumentsStore.getState().patchDocument(documentKey, {
		hasExternalDiskChange,
	});
}

export function getEditorDocumentCurrentContent(documentKey: string): string {
	return getDocumentCurrentContent(documentKey);
}

export function getEditorDocumentBaselineContent(documentKey: string): string {
	return getDocumentBaselineContent(documentKey);
}

export function hasEditorDocumentInitialized(documentKey: string): boolean {
	return hasInitializedDocumentBuffer(documentKey);
}

export async function saveDocumentForPane(
	paneId: string,
	options?: {
		force?: boolean;
	},
): Promise<EditorSaveResult | undefined> {
	const tabsState = useTabsStore.getState();
	const pane = tabsState.panes[paneId];
	const session = useEditorSessionsStore.getState().sessions[paneId];
	if (!pane?.fileViewer || !session) {
		return undefined;
	}

	const document =
		useEditorDocumentsStore.getState().documents[session.documentKey];
	if (!document?.workspaceId || !document.filePath) {
		return undefined;
	}

	const content = getDocumentCurrentContent(document.documentKey);
	const precondition =
		options?.force || !document.baselineRevision
			? undefined
			: { ifMatch: document.baselineRevision };

	const result = await electronTrpcClient.filesystem.writeFile.mutate({
		workspaceId: document.workspaceId,
		absolutePath: document.filePath,
		content,
		encoding: "utf-8",
		precondition,
	});

	if (!result.ok) {
		if (result.reason === "conflict") {
			try {
				const currentFile = await electronTrpcClient.filesystem.readFile.query({
					workspaceId: document.workspaceId,
					absolutePath: document.filePath,
					encoding: "utf-8",
					maxBytes: MAX_FILE_SIZE,
				});
				setDocumentConflict(
					document.documentKey,
					(currentFile.content as string) ?? null,
					paneId,
				);
				return {
					status: "conflict",
					currentContent: (currentFile.content as string) ?? null,
				};
			} catch (error) {
				console.error(
					"[editorCoordinator] Failed to read disk content after save conflict",
					{
						documentKey: document.documentKey,
						filePath: document.filePath,
						error,
					},
				);
				setDocumentConflict(document.documentKey, null, paneId);
				return { status: "conflict", currentContent: null };
			}
		}
		return undefined;
	}

	const currentContent = getDocumentCurrentContent(document.documentKey);
	markDocumentSaved(document.documentKey, {
		savedContent: content,
		currentContent,
		revision: result.revision,
	});

	if (pane.fileViewer.diffCategory === "staged") {
		useTabsStore.setState((state) => {
			const currentPane = state.panes[paneId];
			if (
				!currentPane?.fileViewer ||
				currentPane.fileViewer.diffCategory !== "staged"
			) {
				return state;
			}

			return {
				panes: {
					...state.panes,
					[paneId]: {
						...currentPane,
						fileViewer: {
							...currentPane.fileViewer,
							diffCategory: "unstaged",
						},
					},
				},
			};
		});
	}

	invalidateFileSaveQueries({
		workspaceId: document.workspaceId,
		filePath: document.filePath,
	});

	return { status: "saved" };
}

export function requestViewModeChange(
	paneId: string,
	nextMode: import("shared/tabs-types").FileViewerMode,
): boolean {
	const pane = useTabsStore.getState().panes[paneId];
	if (!pane?.fileViewer || pane.fileViewer.viewMode === nextMode) {
		return true;
	}

	const session = useEditorSessionsStore.getState().sessions[paneId];
	const document = session
		? useEditorDocumentsStore.getState().documents[session.documentKey]
		: null;

	if (document?.dirty) {
		focusPane(paneId);
		useEditorSessionsStore
			.getState()
			.setPendingIntent(
				paneId,
				{ type: "change-view-mode", nextMode },
				"unsaved",
			);
		return false;
	}

	executePendingIntent(paneId, { type: "change-view-mode", nextMode });
	return true;
}

export function requestPaneClose(paneId: string): boolean {
	const pane = useTabsStore.getState().panes[paneId];
	if (!pane) {
		return true;
	}

	if (pane.type !== "file-viewer") {
		useTabsStore.getState().removePane(paneId);
		return true;
	}

	const session = useEditorSessionsStore.getState().sessions[paneId];
	const document = session
		? useEditorDocumentsStore.getState().documents[session.documentKey]
		: null;

	if (document?.dirty) {
		focusPane(paneId);
		useEditorSessionsStore
			.getState()
			.setPendingIntent(paneId, { type: "close-pane" }, "unsaved");
		return false;
	}

	useTabsStore.getState().removePane(paneId);
	return true;
}

export function requestPreviewReplacement(
	paneId: string,
	workspaceId: string,
	options: AddFileViewerPaneOptions,
): boolean {
	const session = useEditorSessionsStore.getState().sessions[paneId];
	const document = session
		? useEditorDocumentsStore.getState().documents[session.documentKey]
		: null;

	if (document?.dirty) {
		focusPane(paneId);
		useEditorSessionsStore.getState().setPendingIntent(
			paneId,
			{
				type: "replace-preview",
				workspaceId,
				options,
			},
			"unsaved",
		);
		return false;
	}

	applyFileViewerReplacement(paneId, workspaceId, options);
	return true;
}

export function requestTabClose(tabId: string): boolean {
	const tab = useTabsStore.getState().tabs.find((item) => item.id === tabId);
	if (!tab) {
		return true;
	}

	const dirtyDocs = collectDirtyTabDocuments(tabId);
	if (dirtyDocs.length === 0) {
		useTabsStore.getState().removeTab(tabId);
		return true;
	}

	useEditorSessionsStore.getState().setPendingTabClose({
		workspaceId: tab.workspaceId,
		tabId,
		paneIds: dirtyDocs.map((entry) => entry.paneId),
		documentKeys: dirtyDocs.map((entry) => entry.documentKey),
		isSaving: false,
	});
	return false;
}

export function cancelPendingIntent(paneId: string): void {
	useEditorSessionsStore.getState().setPendingIntent(paneId, null, "none");
}

export function resumePendingIntent(paneId: string): void {
	const session = useEditorSessionsStore.getState().sessions[paneId];
	if (!session?.pendingIntent) {
		return;
	}

	const intent = session.pendingIntent;
	useEditorSessionsStore.getState().setPendingIntent(paneId, null, "none");
	executePendingIntent(paneId, intent);
}

export function getPaneDocumentKey(paneId: string): string | null {
	return (
		useEditorSessionsStore.getState().sessions[paneId]?.documentKey ?? null
	);
}

export function isPaneDocumentDirty(paneId: string): boolean {
	const session = useEditorSessionsStore.getState().sessions[paneId];
	if (!session) {
		return false;
	}

	return Boolean(
		useEditorDocumentsStore.getState().documents[session.documentKey]?.dirty,
	);
}

export async function saveAndClosePendingTab(
	workspaceId: string,
): Promise<void> {
	const pending = useEditorSessionsStore.getState().pendingTabClose;
	if (!pending || pending.isSaving || pending.workspaceId !== workspaceId) {
		return;
	}

	useEditorSessionsStore
		.getState()
		.setPendingTabClose({ ...pending, isSaving: true });

	try {
		for (const paneId of pending.paneIds) {
			const result: EditorSaveResult | undefined =
				await saveDocumentForPane(paneId);
			if (!result) {
				const currentPending =
					useEditorSessionsStore.getState().pendingTabClose;
				if (
					currentPending?.tabId === pending.tabId &&
					currentPending.workspaceId === workspaceId
				) {
					useEditorSessionsStore
						.getState()
						.setPendingTabClose({ ...currentPending, isSaving: false });
				}
				return;
			}

			if (result.status === "conflict") {
				useEditorSessionsStore.getState().setPendingTabClose(null);
				return;
			}
		}
	} catch (error) {
		console.error("[editorCoordinator] Failed to save before closing tab", {
			tabId: pending.tabId,
			workspaceId,
			error,
		});
		const currentPending = useEditorSessionsStore.getState().pendingTabClose;
		if (
			currentPending?.tabId === pending.tabId &&
			currentPending.workspaceId === workspaceId
		) {
			useEditorSessionsStore
				.getState()
				.setPendingTabClose({ ...currentPending, isSaving: false });
		}
		return;
	}

	useEditorSessionsStore.getState().setPendingTabClose(null);
	useTabsStore.getState().removeTab(pending.tabId);
}

export function discardAndClosePendingTab(workspaceId: string): void {
	const pending = useEditorSessionsStore.getState().pendingTabClose;
	if (!pending || pending.workspaceId !== workspaceId) {
		return;
	}

	for (const documentKey of pending.documentKeys) {
		if (isDocumentExclusivelyBoundToTab(documentKey, pending.tabId)) {
			discardDocumentChanges(documentKey);
		}
	}

	useEditorSessionsStore.getState().setPendingTabClose(null);
	useTabsStore.getState().removeTab(pending.tabId);
}

export function cancelPendingTabClose(workspaceId: string): void {
	const pending = useEditorSessionsStore.getState().pendingTabClose;
	if (!pending || pending.workspaceId !== workspaceId) {
		return;
	}

	useEditorSessionsStore.getState().setPendingTabClose(null);
}
