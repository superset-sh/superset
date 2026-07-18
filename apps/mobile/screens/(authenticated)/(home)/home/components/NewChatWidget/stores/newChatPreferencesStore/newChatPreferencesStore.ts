import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_CHAT_MODEL_ID } from "@/screens/(authenticated)/(home)/utils/chatModels";

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
			modelId: DEFAULT_CHAT_MODEL_ID,
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
