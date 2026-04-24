/**
 * Per-session composer draft persistence. Zustand + persist →
 * localStorage via a 300ms-debounced wrapper, with beforeunload flush
 * so drafts survive reloads, crashes, and pane closes.
 *
 * Ported in spirit from t3code's composerDraftStore (kept minimal for
 * the Phase 5.3 MVP — just prompt text per session). Extension slots
 * (attachments / model selection / modes) arrive alongside the Tiptap
 * rebuild in Phase 5.1-5.4.
 *
 * Plan reference: 20260421-v2-chat-refactor-phased-plan.md §5.3.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
	createDebouncedStorage,
	createMemoryStorage,
	type DebouncedStorage,
} from "./debouncedStorage";

export const COMPOSER_DRAFT_STORAGE_KEY = "superset:v2-composer-drafts:v1";
const DEBOUNCE_MS = 300;
const STORE_VERSION = 1;

/** Per-session draft record. Extend this type with attachments/etc. later. */
export interface ComposerDraft {
	prompt: string;
	updatedAt: number;
}

export interface ComposerDraftState {
	drafts: Record<string /* sessionKey */, ComposerDraft>;
	setPrompt: (sessionKey: string, prompt: string) => void;
	clearDraft: (sessionKey: string) => void;
	getPrompt: (sessionKey: string) => string;
}

/**
 * `sessionKey` namespacing: use `workspaceId:sessionId` when a session
 * exists, or `workspaceId:new` for the draft attached to the not-yet-
 * created session. Helper below keeps call sites terse.
 */
export function composerDraftKey(
	workspaceId: string,
	sessionId: string | null,
): string {
	return `${workspaceId}:${sessionId ?? "new"}`;
}

// Build the debounced storage exactly once. In tests or SSR where
// localStorage doesn't exist, fall back to an in-memory map so state
// machinery still works without crashing.
const underlying =
	typeof localStorage !== "undefined"
		? localStorage
		: createMemoryStorage();
const debouncedStorage: DebouncedStorage = createDebouncedStorage(
	underlying,
	DEBOUNCE_MS,
);

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
	window.addEventListener("beforeunload", () => debouncedStorage.flush());
}

/** Exposed for tests and for `onBeforeUnload` callers elsewhere. */
export function flushComposerDraftStorage(): void {
	debouncedStorage.flush();
}

export const useComposerDraftStore = create<ComposerDraftState>()(
	persist(
		(set, get) => ({
			drafts: {},

			setPrompt: (sessionKey, prompt) => {
				const trimmed = prompt;
				const existing = get().drafts[sessionKey];
				if (existing && existing.prompt === trimmed) return;
				if (!trimmed && !existing) return;
				if (!trimmed) {
					const { [sessionKey]: _dropped, ...rest } = get().drafts;
					set({ drafts: rest });
					return;
				}
				set({
					drafts: {
						...get().drafts,
						[sessionKey]: { prompt: trimmed, updatedAt: Date.now() },
					},
				});
			},

			clearDraft: (sessionKey) => {
				const { [sessionKey]: _dropped, ...rest } = get().drafts;
				set({ drafts: rest });
			},

			getPrompt: (sessionKey) => get().drafts[sessionKey]?.prompt ?? "",
		}),
		{
			name: COMPOSER_DRAFT_STORAGE_KEY,
			version: STORE_VERSION,
			storage: createJSONStorage(() => debouncedStorage),
			partialize: (state) => ({ drafts: state.drafts }),
			// Future: add migrate(persistedState, version) here when bumping the
			// version. Keep each migration small and idempotent.
			migrate: (persistedState, version) => {
				// v1 is the first shipped version. Unknown older shapes become
				// empty drafts rather than crashing the app.
				if (version !== STORE_VERSION) {
					return { drafts: {} } as ComposerDraftState;
				}
				return persistedState as ComposerDraftState;
			},
		},
	),
);
