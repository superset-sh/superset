import { create } from "zustand";
import type { EditorDocumentState } from "./types";

interface EditorDocumentsStoreState {
	documents: Record<string, EditorDocumentState>;
	upsertDocument: (
		document: Omit<EditorDocumentState, "sessionPaneIds" | "contentVersion"> &
			Partial<Pick<EditorDocumentState, "sessionPaneIds" | "contentVersion">>,
	) => void;
	patchDocument: (
		documentKey: string,
		patch: Partial<EditorDocumentState>,
	) => void;
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
				const documents = { ...state.documents };
				delete documents[previousDocumentKey];

				documents[nextDocument.documentKey] = {
					documentKey: nextDocument.documentKey,
					workspaceId: nextDocument.workspaceId,
					filePath: nextDocument.filePath,
					status: nextDocument.status,
					dirty: nextDocument.dirty,
					baselineRevision: nextDocument.baselineRevision,
					hasExternalDiskChange: nextDocument.hasExternalDiskChange,
					conflict: nextDocument.conflict,
					isEditable: nextDocument.isEditable,
					sessionPaneIds:
						nextDocument.sessionPaneIds ?? previous?.sessionPaneIds ?? [],
					contentVersion:
						nextDocument.contentVersion ?? previous?.contentVersion ?? 0,
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
