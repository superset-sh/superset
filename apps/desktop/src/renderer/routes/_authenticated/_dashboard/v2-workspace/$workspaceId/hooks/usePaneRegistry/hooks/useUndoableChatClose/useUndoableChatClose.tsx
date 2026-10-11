import { useLingui } from "@lingui/react/macro";
import type { Pane, WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect, useRef } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { ChatPaneData, PaneViewerData } from "../../../../types";
import {
	isChatSessionClosed,
	markChatSessionClosed,
} from "../../../../utils/closedChatSessions";
import { ChatClosedToast } from "./components/ChatClosedToast";

const UNDO_WINDOW_MS = 10_000;

interface ClosedChat {
	pane: Pane<PaneViewerData>;
	sessionId: string;
	title: string;
	reopen: () => void;
}

interface ClosedChatBatch {
	chats: ClosedChat[];
	toastId: string;
	settled: boolean;
}

export function useUndoableChatClose({
	store,
	stopChat,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	stopChat: (sessionId: string) => Promise<boolean>;
}): (pane: Pane<PaneViewerData>) => void {
	const { t } = useLingui();
	const batchRef = useRef<ClosedChatBatch | null>(null);

	useEffect(
		() => () => {
			if (batchRef.current) toast.dismiss(batchRef.current.toastId);
		},
		[],
	);

	return useCallback(
		(pane) => {
			const data = pane.data as ChatPaneData;
			const { sessionId } = data;
			if (!sessionId || isChatSessionClosed(sessionId)) return;

			const previous = batchRef.current;
			if (previous) {
				previous.settled = true;
				toast.dismiss(previous.toastId);
			}
			const batch: ClosedChatBatch = {
				chats: [
					...(previous?.chats ?? []),
					{
						pane,
						sessionId,
						title:
							pane.titleOverride ?? data.chatTitle ?? t({ message: "Chat" }),
						reopen: markChatSessionClosed(sessionId),
					},
				],
				toastId: crypto.randomUUID(),
				settled: false,
			};
			batchRef.current = batch;

			const settle = (revert: boolean) => {
				if (batch.settled) return;
				batch.settled = true;
				if (batchRef.current === batch) batchRef.current = null;
				for (const chat of batch.chats) {
					if (revert) {
						chat.reopen();
						store.getState().addTab({ panes: [chat.pane] });
					} else {
						void stopChat(chat.sessionId);
					}
				}
			};

			toast.custom(
				() => (
					<ChatClosedToast
						durationMs={UNDO_WINDOW_MS}
						onRevert={() => {
							settle(true);
							toast.dismiss(batch.toastId);
						}}
						titles={batch.chats.map((chat) => chat.title)}
					/>
				),
				{
					id: batch.toastId,
					duration: UNDO_WINDOW_MS,
					onAutoClose: () => settle(false),
					onDismiss: () => settle(false),
				},
			);
		},
		[store, stopChat, t],
	);
}
