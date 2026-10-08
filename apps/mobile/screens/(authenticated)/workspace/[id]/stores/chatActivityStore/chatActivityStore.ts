import { create } from "zustand";
import type { ChatRow } from "../../utils/chatRows";

interface ChatActivityStore {
	openKey: string | null;
	rows: ChatRow[];
	texts: Record<string, string>;
	open: (key: string, rows: ChatRow[], texts: Record<string, string>) => void;
	publish: (rows: ChatRow[], texts: Record<string, string>) => void;
	close: () => void;
}

export const useChatActivityStore = create<ChatActivityStore>()((set) => ({
	openKey: null,
	rows: [],
	texts: {},
	open: (key, rows, texts) => set({ openKey: key, rows, texts }),
	publish: (rows, texts) => set({ rows, texts }),
	close: () => set({ openKey: null, rows: [], texts: {} }),
}));
