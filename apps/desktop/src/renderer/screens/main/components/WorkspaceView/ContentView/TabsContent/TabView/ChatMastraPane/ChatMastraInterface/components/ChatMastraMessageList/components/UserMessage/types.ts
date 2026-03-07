import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";

export type MastraMessage = NonNullable<
	UseMastraChatDisplayReturn["messages"]
>[number];

export type MastraMessagePart = MastraMessage["content"][number];
