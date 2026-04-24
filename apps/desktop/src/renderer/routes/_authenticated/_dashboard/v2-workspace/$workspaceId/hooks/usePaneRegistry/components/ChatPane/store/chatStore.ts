/**
 * Zustand wrapper around the pure chatStore.logic reducers.
 *
 * The store is intentionally thin — every mutation delegates to a pure
 * function in chatStore.logic.ts so the logic is unit-tested in Node
 * without React or Zustand involvement.
 *
 * Plan reference: 20260421-v2-chat-refactor-phased-plan.md §0.2.
 */

import type {
	ApprovalRequest,
	ChatStreamEvent,
	Message,
	Part,
	PlanApprovalRequest,
	QuestionRequest,
	SessionStatus,
	TodoItem,
} from "@superset/chat/shared";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
	addOptimistic,
	applySessionSnapshot,
	applyStreamEvent,
	type ChatStoreData,
	type DockState,
	emptyChatStoreData,
	replaceOptimistic,
	rollbackOptimistic,
} from "./chatStore.logic";

export interface ChatStore extends ChatStoreData {
	applySessionSnapshot: (
		sessionID: string,
		snapshot: {
			messages: Message[];
			parts: { [messageID: string]: Part[] };
			status: SessionStatus;
			historyMore: boolean;
		},
	) => void;
	applyStreamEvent: (event: ChatStreamEvent) => void;
	addOptimistic: (
		sessionID: string,
		message: Message,
		parts: Part[],
	) => void;
	replaceOptimistic: (
		sessionID: string,
		optID: string,
		confirmed: { message: Message; parts: Part[] },
	) => void;
	rollbackOptimistic: (sessionID: string, optID: string) => void;
	resetSession: (sessionID: string) => void;
	/**
	 * Phase 4 bridge: merge a partial dock snapshot from the legacy
	 * display query into the store. Pass fields explicitly as undefined
	 * to leave them alone; pass `null` for approval/question/plan to
	 * clear; pass an empty array for `todos` to clear.
	 */
	setDocks: (
		sessionID: string,
		patch: {
			approval?: ApprovalRequest | null;
			question?: QuestionRequest | null;
			plan?: PlanApprovalRequest | null;
			todos?: TodoItem[];
			revertMessageID?: string | null;
		},
	) => void;
}

export const useChatStore = create<ChatStore>()(
	devtools(
		(set) => ({
			...emptyChatStoreData(),

			applySessionSnapshot: (sessionID, snapshot) => {
				set((state) => applySessionSnapshot(state, sessionID, snapshot));
			},

			applyStreamEvent: (event) => {
				set((state) => applyStreamEvent(state, event));
			},

			addOptimistic: (sessionID, message, parts) => {
				set((state) => addOptimistic(state, sessionID, message, parts));
			},

			replaceOptimistic: (sessionID, optID, confirmed) => {
				set((state) => replaceOptimistic(state, sessionID, optID, confirmed));
			},

			rollbackOptimistic: (sessionID, optID) => {
				set((state) => rollbackOptimistic(state, sessionID, optID));
			},

			setDocks: (sessionID, patch) => {
				set((state) => {
					const prev: DockState =
						state.docks[sessionID] ?? {
							todos: [],
							followup: [],
							followupPaused: false,
						};
					const next: DockState = {
						...prev,
						...("approval" in patch
							? { approval: patch.approval ?? undefined }
							: {}),
						...("question" in patch
							? { question: patch.question ?? undefined }
							: {}),
						...("plan" in patch
							? { plan: patch.plan ?? undefined }
							: {}),
						...(patch.todos ? { todos: patch.todos } : {}),
						...("revertMessageID" in patch
							? { revertMessageID: patch.revertMessageID ?? undefined }
							: {}),
					};
					return {
						...state,
						docks: { ...state.docks, [sessionID]: next },
					};
				});
			},

			resetSession: (sessionID) => {
				set((state) => {
					const {
						messages: { [sessionID]: _msgs, ...messages },
						status: { [sessionID]: _status, ...status },
						docks: { [sessionID]: _docks, ...docks },
						historyMore: { [sessionID]: _more, ...historyMore },
						historyLoading: { [sessionID]: _loading, ...historyLoading },
						errors: { [sessionID]: _err, ...errors },
						parts,
					} = state;
					// Drop parts whose messageID belonged to this session.
					const ownedIDs = new Set(
						(state.messages[sessionID] ?? []).map((m) => m.id),
					);
					const nextParts: Record<string, Part[]> = {};
					for (const [mid, list] of Object.entries(parts)) {
						if (!ownedIDs.has(mid)) nextParts[mid] = list;
					}
					return {
						...state,
						messages,
						status,
						docks,
						historyMore,
						historyLoading,
						errors,
						parts: nextParts,
					};
				});
			},
		}),
		{ name: "ChatStore" },
	),
);
