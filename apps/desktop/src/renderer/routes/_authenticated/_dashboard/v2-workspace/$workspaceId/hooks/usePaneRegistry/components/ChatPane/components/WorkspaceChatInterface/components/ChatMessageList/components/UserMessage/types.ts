import type { UseChatDisplayReturn } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/hooks/useWorkspaceChatDisplay";

export type ChatMessage = NonNullable<UseChatDisplayReturn["messages"]>[number];

export type ChatMessagePart = ChatMessage["content"][number];
