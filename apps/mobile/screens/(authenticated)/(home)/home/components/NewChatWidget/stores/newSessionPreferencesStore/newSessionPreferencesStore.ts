import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const DEFAULT_AGENT_ID = "claude";

interface NewSessionPreferencesStore {
	/** Host agent config id (e.g. "claude", "codex") the next session launches. */
	agentId: string;
	/** "projectId:machineId" of the last used target. */
	targetKey: string | null;
	/** Draft base branch for the next session; null = default branch. */
	baseBranch: string | null;
	/** Cloud only. Null until picked; create falls back to the first. */
	environmentId: string | null;
	/** False until AsyncStorage has answered — the saved picks aren't here yet. */
	hasHydrated: boolean;
	setAgentId: (agentId: string) => void;
	setTargetKey: (targetKey: string) => void;
	setBaseBranch: (baseBranch: string | null) => void;
	setEnvironmentId: (environmentId: string) => void;
}

export const useNewSessionPreferencesStore =
	create<NewSessionPreferencesStore>()(
		persist(
			(set) => ({
				agentId: DEFAULT_AGENT_ID,
				targetKey: null,
				baseBranch: null,
				environmentId: null,
				hasHydrated: false,
				setAgentId: (agentId) => set({ agentId }),
				setTargetKey: (targetKey) => set({ targetKey, baseBranch: null }),
				setBaseBranch: (baseBranch) => set({ baseBranch }),
				setEnvironmentId: (environmentId) => set({ environmentId }),
			}),
			{
				name: "new-session-preferences",
				storage: createJSONStorage(() => AsyncStorage),
				partialize: (state) => ({
					agentId: state.agentId,
					targetKey: state.targetKey,
					environmentId: state.environmentId,
				}),
				// Same async-rehydration window as the filter store: until this
				// flips, the composer would fall back to a default target instead
				// of the last used one.
				onRehydrateStorage: () => () =>
					useNewSessionPreferencesStore.setState({ hasHydrated: true }),
			},
		),
	);
