import { type StagedPick, stagedKey } from "@superset/shared/sharing";
import { create } from "zustand";

interface ShareInviteStore {
	/** Who the invite screen will share with, in the order picked. */
	staged: StagedPick[];
	/** Each pick's role, by `stagedKey`. */
	roles: Record<string, string>;
	/** The pick the permission picker is open for. */
	editing: string | null;
	reset: () => void;
	stage: (pick: StagedPick, role: string) => void;
	unstage: (key: string) => void;
	setRole: (key: string, role: string) => void;
	edit: (key: string) => void;
}

export const useShareInviteStore = create<ShareInviteStore>((set) => ({
	staged: [],
	roles: {},
	editing: null,
	reset: () => set({ staged: [], roles: {}, editing: null }),
	stage: (pick, role) =>
		set((state) => {
			const key = stagedKey(pick);
			if (state.staged.some((p) => stagedKey(p) === key)) return state;
			return {
				staged: [...state.staged, pick],
				roles: { ...state.roles, [key]: role },
			};
		}),
	unstage: (key) =>
		set((state) => {
			const { [key]: _removed, ...roles } = state.roles;
			return {
				staged: state.staged.filter((p) => stagedKey(p) !== key),
				roles,
			};
		}),
	setRole: (key, role) =>
		set((state) => ({ roles: { ...state.roles, [key]: role } })),
	edit: (key) => set({ editing: key }),
}));
