import type { UseChatDisplayReturn } from "@superset/chat-legacy/client";

export type ChatMessage = NonNullable<UseChatDisplayReturn["messages"]>[number];

export type ChatMessagePart = ChatMessage["content"][number];
