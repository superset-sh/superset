import type { ThinkingLevel } from "@superset/ui/ai-elements/thinking-toggle";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface ChatPreferencesState {
	selectedModelId: string | null;
	setSelectedModelId: (modelId: string | null) => void;
	thinkingLevel: ThinkingLevel;
	setThinkingLevel: (level: ThinkingLevel) => void;
}

export const useChatPreferencesStore = create<ChatPreferencesState>()(
	devtools(
		persist(
			(set) => ({
				selectedModelId: null,
				thinkingLevel: "off" as ThinkingLevel,

				setSelectedModelId: (modelId) => {
					set({ selectedModelId: modelId });
				},

				setThinkingLevel: (thinkingLevel) => {
					set({ thinkingLevel });
				},
			}),
			{
				name: "chat-preferences",
			},
		),
		{ name: "ChatPreferencesStore" },
	),
);
