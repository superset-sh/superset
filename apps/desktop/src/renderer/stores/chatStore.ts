/**
 * Local Chat Store
 *
 * Stores chat session metadata using zustand with localStorage persistence.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ChatSession {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
}

interface ChatStore {
	sessions: ChatSession[];
	createSession: (name?: string) => ChatSession;
	deleteSession: (id: string) => void;
	renameSession: (id: string, name: string) => void;
}

export const useChatStore = create<ChatStore>()(
	persist(
		(set, get) => ({
			sessions: [],

			createSession: (name?: string) => {
				const id = crypto.randomUUID();
				const now = new Date().toISOString();
				const session: ChatSession = {
					id,
					name: name ?? `Chat ${get().sessions.length + 1}`,
					createdAt: now,
					updatedAt: now,
				};

				set((state) => ({
					sessions: [session, ...state.sessions],
				}));

				return session;
			},

			deleteSession: (id: string) => {
				set((state) => ({
					sessions: state.sessions.filter((s) => s.id !== id),
				}));
			},

			renameSession: (id: string, name: string) => {
				set((state) => ({
					sessions: state.sessions.map((s) =>
						s.id === id
							? { ...s, name, updatedAt: new Date().toISOString() }
							: s,
					),
				}));
			},
		}),
		{
			name: "chat-sessions",
		},
	),
);
