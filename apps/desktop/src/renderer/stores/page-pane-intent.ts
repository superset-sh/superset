import { create } from "zustand";

export interface PagePaneIntent {
	workspaceId: string;
	pageId?: string;
	slug: string;
	title?: string;
}

interface PagePaneIntentState {
	intent: PagePaneIntent | null;
	request: (intent: PagePaneIntent) => void;
	consume: (workspaceId: string) => PagePaneIntent | null;
}

export const usePagePaneIntent = create<PagePaneIntentState>((set, get) => ({
	intent: null,
	request: (intent) => set({ intent }),
	consume: (workspaceId) => {
		const { intent } = get();
		if (!intent || intent.workspaceId !== workspaceId) return null;
		set({ intent: null });
		return intent;
	},
}));
