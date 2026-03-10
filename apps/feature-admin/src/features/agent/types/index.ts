export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCallRecord[];
  toolResults?: ToolResultRecord[];
  modelId?: string;
  createdAt: string;
}

export interface ToolCallRecord {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolResultRecord {
  toolCallId: string;
  result: unknown;
}

export interface AgentInfo {
  id: string;
  name: string;
  slug: string;
  description?: string;
  avatar?: string;
}

export interface ThreadInfo {
  id: string;
  title?: string;
  agentId: string;
  isPinned: boolean;
  isArchived: boolean;
  lastMessageAt?: string;
  createdAt: string;
}
