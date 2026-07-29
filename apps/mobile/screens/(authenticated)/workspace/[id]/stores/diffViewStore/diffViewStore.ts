import { create } from "zustand";

export type ExpandedRange = [start: number, end: number];

interface DiffViewStore {
	expansionsByWorkspace: Record<string, Record<string, ExpandedRange[]>>;
	jumpTarget: { path: string; nonce: number } | null;
	addExpansion: (
		workspaceId: string,
		path: string,
		range: ExpandedRange,
	) => void;
	resetFileExpansions: (workspaceId: string, path: string) => void;
	requestJump: (path: string) => void;
	clearJump: () => void;
}

function mergeRanges(ranges: ExpandedRange[]): ExpandedRange[] {
	const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
	const merged: ExpandedRange[] = [];
	for (const range of sorted) {
		const last = merged[merged.length - 1];
		if (last && range[0] <= last[1] + 1) {
			last[1] = Math.max(last[1], range[1]);
		} else {
			merged.push([range[0], range[1]]);
		}
	}
	return merged;
}

export const useDiffViewStore = create<DiffViewStore>()((set) => ({
	expansionsByWorkspace: {},
	jumpTarget: null,
	addExpansion: (workspaceId, path, range) =>
		set((state) => {
			const workspace = state.expansionsByWorkspace[workspaceId] ?? {};
			const next = mergeRanges([...(workspace[path] ?? []), range]);
			return {
				expansionsByWorkspace: {
					...state.expansionsByWorkspace,
					[workspaceId]: { ...workspace, [path]: next },
				},
			};
		}),
	resetFileExpansions: (workspaceId, path) =>
		set((state) => {
			const workspace = state.expansionsByWorkspace[workspaceId];
			if (!workspace?.[path]) return state;
			const { [path]: _removed, ...rest } = workspace;
			return {
				expansionsByWorkspace: {
					...state.expansionsByWorkspace,
					[workspaceId]: rest,
				},
			};
		}),
	requestJump: (path) =>
		set((state) => ({
			jumpTarget: { path, nonce: (state.jumpTarget?.nonce ?? 0) + 1 },
		})),
	clearJump: () => set({ jumpTarget: null }),
}));

export const NO_EXPANSIONS: Record<string, ExpandedRange[]> = {};
