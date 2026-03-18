import type { UseChatDisplayReturn } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceChat/hooks/useWorkspaceChatDisplay";

export type ChatMessage = NonNullable<UseChatDisplayReturn["messages"]>[number];

export type ChatMessagePart = ChatMessage["content"][number];
