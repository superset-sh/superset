import type { ThinkingLevel } from "@superset/ui/ai-elements/thinking-toggle";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface ChatPreferencesState {
	selectedModelId: string | null;
	setSelectedModelId: (modelId: string | null) => void;
	thinkingLevel: ThinkingLevel;
	setThinkingLevel: (level: ThinkingLevel) => void;
	/**
	 * Phase 0 feature flag for the OpenCode-style chat rebuild. When true,
	 * the v2 workspace ChatPane renders the new ChatSurface; when false,
	 * the existing WorkspaceChatInterface is used.
	 *
	 * See apps/desktop/plans/20260421-v2-chat-refactor-phased-plan.md §0.4.
	 * Removed entirely in Phase 8 once the legacy tree is deleted.
	 */
	chatV2OpencodeRebuild: boolean;
	setChatV2OpencodeRebuild: (enabled: boolean) => void;
}

export const useChatPreferencesStore = create<ChatPreferencesState>()(
	devtools(
		persist(
			(set) => ({
				selectedModelId: null,
				thinkingLevel: "off" as ThinkingLevel,
				// Default ON while the Phase 0+ rebuild is actively being
				// developed. Flip back to false before shipping to users, or
				// when testing the legacy chat pane.
				chatV2OpencodeRebuild: true,

				setSelectedModelId: (modelId) => {
					set({ selectedModelId: modelId });
				},

				setThinkingLevel: (thinkingLevel) => {
					set({ thinkingLevel });
				},

				setChatV2OpencodeRebuild: (chatV2OpencodeRebuild) => {
					set({ chatV2OpencodeRebuild });
				},
			}),
			{
				name: "chat-preferences",
			},
		),
		{ name: "ChatPreferencesStore" },
	),
);
