import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export interface PromptHistoryEntry {
	id: string;
	prompt: string;
	submittedAt: number;
}

const MAX_ENTRIES = 50;
// Prompts can be many KB of markdown; cap per-entry size so the persisted
// store stays far below the synchronous-localStorage-load failure mode
// documented in renderer/lib/terminal/terminal-buffer-gc.ts.
const MAX_PROMPT_CHARS = 5000;

interface PromptHistoryState {
	entries: PromptHistoryEntry[];
	recordPrompt: (prompt: string) => void;
}

export const usePromptHistoryStore = create<PromptHistoryState>()(
	devtools(
		persist(
			(set) => ({
				entries: [],

				recordPrompt: (prompt) => {
					const trimmed = prompt.trim().slice(0, MAX_PROMPT_CHARS);
					if (!trimmed) return;
					// The persist write is synchronous; a quota failure must never
					// propagate into callers (e.g. the workspace submit path).
					try {
						set((state) => ({
							entries: [
								{
									id: crypto.randomUUID(),
									prompt: trimmed,
									submittedAt: Date.now(),
								},
								// Resubmitting an identical prompt moves it to the front
								// instead of duplicating it.
								...state.entries.filter((entry) => entry.prompt !== trimmed),
							].slice(0, MAX_ENTRIES),
						}));
					} catch {
						// history is best-effort
					}
				},
			}),
			{ name: "prompt-history" },
		),
		{ name: "PromptHistoryStore" },
	),
);
