"use client";

import {
	useMessageScroller,
	useMessageScrollerVisibility,
} from "@shadcn/react/message-scroller";
import {
	ChatHistorySidebar,
	type ChatHistorySidebarMessage,
} from "../ChatHistorySidebar";

export type ChatHistorySidebarScrollerProps = {
	messages: ChatHistorySidebarMessage[];
	className?: string;
	onMessageSelect?: (messageId: string) => void;
};

function visibleTurnIds(
	messages: ChatHistorySidebarMessage[],
	visibleMessageIds: string[],
): string[] {
	const visible = new Set(visibleMessageIds);
	const activeIds: string[] = [];
	let turnUserId: string | null = null;
	let turnVisible = false;
	const flush = () => {
		if (turnUserId != null && turnVisible) activeIds.push(turnUserId);
	};
	for (const message of messages) {
		if (message.role === "user") {
			flush();
			turnUserId = message.id;
			turnVisible = visible.has(message.id);
		} else if (visible.has(message.id)) {
			turnVisible = true;
		}
	}
	flush();
	return activeIds;
}

export function ChatHistorySidebarScroller({
	messages,
	className,
	onMessageSelect,
}: ChatHistorySidebarScrollerProps) {
	const { scrollToMessage } = useMessageScroller();
	const { visibleMessageIds } = useMessageScrollerVisibility();

	return (
		<ChatHistorySidebar
			messages={messages}
			activeMessageIds={visibleTurnIds(messages, visibleMessageIds)}
			onMessageSelect={(message) =>
				onMessageSelect
					? onMessageSelect(message.id)
					: scrollToMessage(message.id, { align: "start", behavior: "smooth" })
			}
			className={className}
		/>
	);
}
