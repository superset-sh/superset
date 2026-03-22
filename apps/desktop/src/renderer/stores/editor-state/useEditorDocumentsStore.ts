import { create } from "zustand";
import type { EditorDocumentState } from "./types";

type EditorDocumentPatch = Partial<Omit<EditorDocumentState, "documentKey">>;

interface EditorDocumentsStoreState {
	documents: Record<string, EditorDocumentState>;
	upsertDocument: (
		document: Omit<EditorDocumentState, "sessionPaneIds" | "contentVersion"> &
			Partial<Pick<EditorDocumentState, "sessionPaneIds" | "contentVersion">>,
	) => void;
	patchDocument: (documentKey: string, patch: EditorDocumentPatch) => void;
	addSessionBinding: (documentKey: string, paneId: string) => void;
	removeSessionBinding: (documentKey: string, paneId: string) => void;
	replaceDocumentKey: (
		previousDocumentKey: string,
		nextDocument: Omit<
			EditorDocumentState,
			"sessionPaneIds" | "contentVersion"
		> &
			Partial<Pick<EditorDocumentState, "sessionPaneIds" | "contentVersion">>,
	) => void;
	removeDocument: (documentKey: string) => void;
}

export const useEditorDocumentsStore = create<EditorDocumentsStoreState>(
	(set) => ({
		documents: {},
		upsertDocument: (document) => {
			set((state) => {
				const existing = state.documents[document.documentKey];
				return {
					documents: {
						...state.documents,
						[document.documentKey]: {
							documentKey: document.documentKey,
							workspaceId: document.workspaceId,
							filePath: document.filePath,
							status: document.status,
							dirty: document.dirty,
							baselineRevision: document.baselineRevision,
							hasExternalDiskChange: document.hasExternalDiskChange,
							conflict: document.conflict,
							isEditable: document.isEditable,
							sessionPaneIds:
								document.sessionPaneIds ?? existing?.sessionPaneIds ?? [],
							contentVersion:
								document.contentVersion ?? existing?.contentVersion ?? 0,
						},
					},
				};
			});
		},
		patchDocument: (documentKey, patch) => {
			set((state) => {
				const existing = state.documents[documentKey];
				if (!existing) {
					return state;
				}

				return {
					documents: {
						...state.documents,
						[documentKey]: {
							...existing,
							...patch,
							documentKey,
						},
					},
				};
			});
		},
		addSessionBinding: (documentKey, paneId) => {
			set((state) => {
				const existing = state.documents[documentKey];
				if (!existing || existing.sessionPaneIds.includes(paneId)) {
					return state;
				}

				return {
					documents: {
						...state.documents,
						[documentKey]: {
							...existing,
							sessionPaneIds: [...existing.sessionPaneIds, paneId],
						},
					},
				};
			});
		},
		removeSessionBinding: (documentKey, paneId) => {
			set((state) => {
				const existing = state.documents[documentKey];
				if (!existing || !existing.sessionPaneIds.includes(paneId)) {
					return state;
				}

				return {
					documents: {
						...state.documents,
						[documentKey]: {
							...existing,
							sessionPaneIds: existing.sessionPaneIds.filter(
								(id) => id !== paneId,
							),
						},
					},
				};
			});
		},
		replaceDocumentKey: (previousDocumentKey, nextDocument) => {
			set((state) => {
				const previous = state.documents[previousDocumentKey];
				const destination = state.documents[nextDocument.documentKey];
				const documents = { ...state.documents };
				delete documents[previousDocumentKey];

				const mergedConflict =
					nextDocument.conflict ??
					destination?.conflict ??
					previous?.conflict ??
					null;
				const mergedDirty = Boolean(
					destination?.dirty || nextDocument.dirty || previous?.dirty,
				);
				const mergedSessionPaneIds = Array.from(
					new Set([
						...(destination?.sessionPaneIds ?? []),
						...(nextDocument.sessionPaneIds ?? previous?.sessionPaneIds ?? []),
					]),
				);
				const mergedContentVersion = Math.max(
					destination?.contentVersion ?? 0,
					nextDocument.contentVersion ?? previous?.contentVersion ?? 0,
				);

				documents[nextDocument.documentKey] = {
					documentKey: nextDocument.documentKey,
					workspaceId: nextDocument.workspaceId,
					filePath: nextDocument.filePath,
					status:
						mergedConflict !== null
							? "conflict"
							: nextDocument.status === "saving" ||
									destination?.status === "saving"
								? "saving"
								: nextDocument.status,
					dirty: mergedDirty,
					baselineRevision:
						nextDocument.baselineRevision ??
						destination?.baselineRevision ??
						previous?.baselineRevision ??
						null,
					hasExternalDiskChange: Boolean(
						destination?.hasExternalDiskChange ||
							nextDocument.hasExternalDiskChange ||
							previous?.hasExternalDiskChange,
					),
					conflict: mergedConflict,
					isEditable: nextDocument.isEditable,
					sessionPaneIds: mergedSessionPaneIds,
					contentVersion: mergedContentVersion,
				};

				return { documents };
			});
		},
		removeDocument: (documentKey) => {
			set((state) => {
				if (!state.documents[documentKey]) {
					return state;
				}

				const documents = { ...state.documents };
				delete documents[documentKey];
				return { documents };
			});
		},
	}),
);
