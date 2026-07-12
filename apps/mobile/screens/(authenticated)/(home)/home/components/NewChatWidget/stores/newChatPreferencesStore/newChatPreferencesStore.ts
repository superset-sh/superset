import AsyncStorage from "@react-native-async-storage/async-storage";
import { SUPERSET_CHAT_MODELS } from "@superset/shared/agent-models";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const DEFAULT_MODEL_ID =
	SUPERSET_CHAT_MODELS[0]?.id ?? "anthropic/claude-opus-4-8";

interface NewChatPreferencesStore {
	modelId: string;
	/** "projectId:machineId" of the last used target. */
	targetKey: string | null;
	/** Draft base branch for the next chat; null = default branch. */
	baseBranch: string | null;
	setModelId: (modelId: string) => void;
	setTargetKey: (targetKey: string) => void;
	setBaseBranch: (baseBranch: string | null) => void;
}

export const useNewChatPreferencesStore = create<NewChatPreferencesStore>()(
	persist(
		(set) => ({
			modelId: DEFAULT_MODEL_ID,
			targetKey: null,
			baseBranch: null,
			setModelId: (modelId) => set({ modelId }),
			setTargetKey: (targetKey) => set({ targetKey, baseBranch: null }),
			setBaseBranch: (baseBranch) => set({ baseBranch }),
		}),
		{
			name: "new-chat-preferences",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: (state) => ({
				modelId: state.modelId,
				targetKey: state.targetKey,
			}),
		},
	),
);
