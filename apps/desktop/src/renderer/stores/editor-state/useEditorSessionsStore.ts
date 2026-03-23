import { create } from "zustand";
import type {
	EditorDialogState,
	EditorPendingIntent,
	EditorSessionMeta,
	PendingTabCloseState,
} from "./types";

type EditorSessionPatch = Partial<
	Pick<EditorSessionMeta, "pendingIntent" | "autoPinnedBecauseDirty" | "dialog">
>;

interface EditorSessionsStoreState {
	sessions: Record<string, EditorSessionMeta>;
	pendingTabClose: PendingTabCloseState | null;
	bindSession: (paneId: string, documentKey: string) => void;
	replaceDocumentKey: (
		previousDocumentKey: string,
		nextDocumentKey: string,
	) => void;
	patchSession: (paneId: string, patch: EditorSessionPatch) => void;
	setPendingIntent: (
		paneId: string,
		intent: EditorPendingIntent | null,
		dialog?: EditorDialogState,
	) => void;
	clearSession: (paneId: string) => void;
	setPendingTabClose: (pending: PendingTabCloseState | null) => void;
}

export const useEditorSessionsStore = create<EditorSessionsStoreState>(
	(set) => ({
		sessions: {},
		pendingTabClose: null,
		bindSession: (paneId, documentKey) => {
			set((state) => {
				const existing = state.sessions[paneId];
				if (existing?.documentKey === documentKey) {
					return state;
				}

				return {
					sessions: {
						...state.sessions,
						[paneId]: {
							paneId,
							documentKey,
							generation: (existing?.generation ?? 0) + 1,
							pendingIntent: null,
							autoPinnedBecauseDirty: false,
							dialog: "none",
						},
					},
				};
			});
		},
		replaceDocumentKey: (previousDocumentKey, nextDocumentKey) => {
			set((state) => {
				let hasChanges = false;
				const sessions = { ...state.sessions };
				for (const [paneId, session] of Object.entries(state.sessions)) {
					if (session.documentKey !== previousDocumentKey) {
						continue;
					}

					hasChanges = true;
					sessions[paneId] = {
						...session,
						documentKey: nextDocumentKey,
					};
				}

				return hasChanges ? { sessions } : state;
			});
		},
		patchSession: (paneId, patch) => {
			set((state) => {
				const existing = state.sessions[paneId];
				if (!existing) {
					return state;
				}

				return {
					sessions: {
						...state.sessions,
						[paneId]: {
							...existing,
							...patch,
						},
					},
				};
			});
		},
		setPendingIntent: (paneId, intent, dialog = "none") => {
			set((state) => {
				const existing = state.sessions[paneId];
				if (!existing) {
					return state;
				}

				return {
					sessions: {
						...state.sessions,
						[paneId]: {
							...existing,
							pendingIntent: intent,
							dialog,
						},
					},
				};
			});
		},
		clearSession: (paneId) => {
			set((state) => {
				if (!state.sessions[paneId]) {
					return state;
				}

				const sessions = { ...state.sessions };
				delete sessions[paneId];
				return { sessions };
			});
		},
		setPendingTabClose: (pendingTabClose) => set({ pendingTabClose }),
	}),
);
