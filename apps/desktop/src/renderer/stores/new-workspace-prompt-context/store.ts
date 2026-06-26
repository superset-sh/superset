import { create } from "zustand";

export type PromptContextBody = { text: string };

type PromptContextKind = "github-issue" | "pr" | "task";

export type PromptContextEntry =
	| { state: "loading"; promise: Promise<PromptContextBody | null> }
	| { state: "ready"; body: PromptContextBody }
	| { state: "failed" };

export function makePromptContextKey(
	kind: PromptContextKind,
	id: string | number,
	scope?: string | null,
): string {
	const base = `${kind}:${id}`;
	return scope ? `${scope}|${base}` : base;
}

export function makePromptContextScope(
	projectId: string | null,
	hostUrl: string | null,
): string | null {
	if (!projectId || !hostUrl) return null;
	return `${projectId}|${hostUrl}`;
}

interface PromptContextState {
	entries: Map<string, PromptContextEntry>;
	register: (
		key: string,
		fetcher: () => Promise<PromptContextBody | null>,
	) => void;
	awaitPending: (timeoutMs: number) => Promise<void>;
}

export const useNewWorkspacePromptContextStore = create<PromptContextState>(
	(set, get) => {
		const setEntry = (key: string, entry: PromptContextEntry) => {
			set((state) => {
				const next = new Map(state.entries);
				next.set(key, entry);
				return { entries: next };
			});
		};
		return {
			entries: new Map(),
			register: (key, fetcher) => {
				if (get().entries.has(key)) return;
				const promise = fetcher().then(
					(body) => {
						if (!body) {
							setEntry(key, { state: "failed" });
							return null;
						}
						setEntry(key, { state: "ready", body });
						return body;
					},
					() => {
						setEntry(key, { state: "failed" });
						return null;
					},
				);
				setEntry(key, { state: "loading", promise });
			},
			awaitPending: async (timeoutMs) => {
				const pending: Promise<PromptContextBody | null>[] = [];
				for (const entry of get().entries.values()) {
					if (entry.state === "loading") pending.push(entry.promise);
				}
				if (pending.length === 0) return;
				const timeout = new Promise<void>((resolve) =>
					setTimeout(resolve, timeoutMs),
				);
				await Promise.race([
					Promise.allSettled(pending).then(() => undefined),
					timeout,
				]);
			},
		};
	},
);
