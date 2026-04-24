/**
 * Followup queue — messages typed while the assistant is busy land
 * here instead of being sent immediately. A drain effect flushes the
 * head of the queue when the session goes idle.
 *
 * OpenCode port (temp/opencode/packages/app/src/pages/session/composer/
 * session-followup-dock.tsx), trimmed to the essentials for Phase 7:
 * queue / edit / send-now / remove / pause. Persistence is in-memory
 * only for now — composer drafts cover reload-survival separately.
 *
 * Plan reference: 20260421-v2-chat-refactor-phased-plan.md §7.1.
 */

import { create } from "zustand";

export interface FollowupQueueItem {
	id: string;
	sessionID: string;
	prompt: string;
	/** Epoch ms when the item was queued — used to order + age. */
	createdAt: number;
}

export interface FollowupState {
	items: Record<string /* sessionID */, FollowupQueueItem[]>;
	paused: Record<string /* sessionID */, boolean>;

	enqueue: (sessionID: string, prompt: string) => FollowupQueueItem;
	remove: (sessionID: string, id: string) => void;
	editPrompt: (sessionID: string, id: string, prompt: string) => void;
	popHead: (sessionID: string) => FollowupQueueItem | undefined;
	clear: (sessionID: string) => void;
	pause: (sessionID: string) => void;
	resume: (sessionID: string) => void;
	isPaused: (sessionID: string) => boolean;
	getQueue: (sessionID: string) => FollowupQueueItem[];
}

export const useFollowupStore = create<FollowupState>()((set, get) => ({
	items: {},
	paused: {},

	enqueue: (sessionID, prompt) => {
		const item: FollowupQueueItem = {
			id: `fu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			sessionID,
			prompt,
			createdAt: Date.now(),
		};
		set((s) => ({
			items: {
				...s.items,
				[sessionID]: [...(s.items[sessionID] ?? []), item],
			},
		}));
		return item;
	},

	remove: (sessionID, id) => {
		set((s) => {
			const list = s.items[sessionID];
			if (!list) return s;
			const next = list.filter((item) => item.id !== id);
			return { items: { ...s.items, [sessionID]: next } };
		});
	},

	editPrompt: (sessionID, id, prompt) => {
		set((s) => {
			const list = s.items[sessionID];
			if (!list) return s;
			const next = list.map((item) =>
				item.id === id ? { ...item, prompt } : item,
			);
			return { items: { ...s.items, [sessionID]: next } };
		});
	},

	popHead: (sessionID) => {
		const list = get().items[sessionID];
		if (!list || list.length === 0) return undefined;
		const [head, ...rest] = list;
		set((s) => ({ items: { ...s.items, [sessionID]: rest } }));
		return head;
	},

	clear: (sessionID) => {
		set((s) => {
			const { [sessionID]: _dropped, ...rest } = s.items;
			return { items: rest };
		});
	},

	pause: (sessionID) => {
		set((s) => ({ paused: { ...s.paused, [sessionID]: true } }));
	},

	resume: (sessionID) => {
		set((s) => {
			const { [sessionID]: _dropped, ...rest } = s.paused;
			return { paused: rest };
		});
	},

	isPaused: (sessionID) => get().paused[sessionID] === true,

	getQueue: (sessionID) => get().items[sessionID] ?? EMPTY,
}));

const EMPTY: FollowupQueueItem[] = [];
