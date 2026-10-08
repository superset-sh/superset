import type { BackgroundTask } from "@superset/chat/protocol";
import { create } from "zustand";

interface ChatMode {
	id: string;
	label: string;
}

export interface ActiveChat {
	modes: ChatMode[];
	currentModeId: string | undefined;
	backgroundTasks: BackgroundTask[];
	running: boolean;
	selectMode: (modeId: string) => void;
	stopTask: (taskId: string) => void;
	stop: () => void;
}

const noop = () => {};

const EMPTY: ActiveChat = {
	modes: [],
	currentModeId: undefined,
	backgroundTasks: [],
	running: false,
	selectMode: noop,
	stopTask: noop,
	stop: noop,
};

interface ActiveChatStore {
	bySessionId: Record<string, ActiveChat>;
	publish: (sessionId: string, chat: ActiveChat) => void;
	clear: (sessionId: string) => void;
}

export const useActiveChatStore = create<ActiveChatStore>()((set) => ({
	bySessionId: {},
	publish: (sessionId, chat) =>
		set((state) => ({
			bySessionId: { ...state.bySessionId, [sessionId]: chat },
		})),
	clear: (sessionId) =>
		set((state) => {
			const { [sessionId]: _cleared, ...bySessionId } = state.bySessionId;
			return { bySessionId };
		}),
}));

export function useActiveChat(
	sessionId: string | null | undefined,
): ActiveChat {
	return useActiveChatStore((state) =>
		sessionId ? (state.bySessionId[sessionId] ?? EMPTY) : EMPTY,
	);
}
