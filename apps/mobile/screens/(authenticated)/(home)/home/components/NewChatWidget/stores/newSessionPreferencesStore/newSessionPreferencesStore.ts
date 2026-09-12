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
	/**
	 * Last-picked model and effort per launch preset ("claude", "codex", …).
	 * No entry means the agent's own default: nothing is sent at launch. Keyed
	 * by preset rather than host config id so a pick survives host switches,
	 * same as the desktop's per-preset maps.
	 */
	modelByAgent: Record<string, string>;
	effortByAgent: Record<string, string>;
	/** False until AsyncStorage has answered — the saved picks aren't here yet. */
	hasHydrated: boolean;
	setAgentId: (agentId: string) => void;
	setTargetKey: (targetKey: string) => void;
	setBaseBranch: (baseBranch: string | null) => void;
	setEnvironmentId: (environmentId: string) => void;
	/** Null clears the pick back to the agent default. */
	setModel: (presetId: string, model: string | null) => void;
	setEffort: (presetId: string, effort: string | null) => void;
}

function withPick(
	picks: Record<string, string>,
	presetId: string,
	pick: string | null,
): Record<string, string> {
	const rest = Object.fromEntries(
		Object.entries(picks).filter(([key]) => key !== presetId),
	);
	return pick ? { ...rest, [presetId]: pick } : rest;
}

export const useNewSessionPreferencesStore =
	create<NewSessionPreferencesStore>()(
		persist(
			(set) => ({
				agentId: DEFAULT_AGENT_ID,
				targetKey: null,
				baseBranch: null,
				environmentId: null,
				modelByAgent: {},
				effortByAgent: {},
				hasHydrated: false,
				setAgentId: (agentId) => set({ agentId }),
				setTargetKey: (targetKey) => set({ targetKey, baseBranch: null }),
				setBaseBranch: (baseBranch) => set({ baseBranch }),
				setEnvironmentId: (environmentId) => set({ environmentId }),
				setModel: (presetId, model) =>
					set((state) => ({
						modelByAgent: withPick(state.modelByAgent, presetId, model),
					})),
				setEffort: (presetId, effort) =>
					set((state) => ({
						effortByAgent: withPick(state.effortByAgent, presetId, effort),
					})),
			}),
			{
				name: "new-session-preferences",
				storage: createJSONStorage(() => AsyncStorage),
				partialize: (state) => ({
					agentId: state.agentId,
					targetKey: state.targetKey,
					environmentId: state.environmentId,
					modelByAgent: state.modelByAgent,
					effortByAgent: state.effortByAgent,
				}),
				// Same async-rehydration window as the filter store: until this
				// flips, the composer would fall back to a default target instead
				// of the last used one.
				onRehydrateStorage: () => () =>
					useNewSessionPreferencesStore.setState({ hasHydrated: true }),
			},
		),
	);
