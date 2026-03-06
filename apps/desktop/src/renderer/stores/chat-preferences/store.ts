import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface ChatPreferencesState {
	selectedModelId: string | null;
	setSelectedModelId: (modelId: string | null) => void;
}

export const useChatPreferencesStore = create<ChatPreferencesState>()(
	devtools(
		persist(
			(set) => ({
				selectedModelId: null,

				setSelectedModelId: (modelId) => {
					set({ selectedModelId: modelId });
				},
			}),
			{
				name: "chat-preferences",
			},
		),
		{ name: "ChatPreferencesStore" },
	),
);
