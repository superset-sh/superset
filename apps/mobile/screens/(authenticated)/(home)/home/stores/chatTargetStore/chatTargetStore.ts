import { create } from "zustand";

export interface ChatTarget {
	workspaceId: string;
	workspaceName: string;
	branch: string;
	hostId: string;
}

interface ChatTargetStore {
	target: ChatTarget | null;
	setTarget: (target: ChatTarget) => void;
	clearTarget: () => void;
}

export const useChatTargetStore = create<ChatTargetStore>()((set) => ({
	target: null,
	setTarget: (target) => set({ target }),
	clearTarget: () => set({ target: null }),
}));
