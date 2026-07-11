/**
 * Claude owns the agent message and callback contracts. Re-exporting the
 * declarations type-only keeps this package from importing the Node-oriented
 * SDK runtime in React Native or browser clients.
 */
export type * from "@anthropic-ai/claude-agent-sdk";
export type * from "@anthropic-ai/claude-agent-sdk/sdk-tools";

import type {
	SDKAssistantMessage,
	SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";

/** Content blocks emitted in a complete assistant message. */
export type SDKAssistantContentBlock =
	SDKAssistantMessage["message"]["content"][number];

/** Content blocks accepted in an SDK user message (when content is not text). */
export type SDKUserContentBlock = Exclude<
	SDKUserMessage["message"]["content"],
	string
>[number];

export type SDKContentBlock = SDKAssistantContentBlock | SDKUserContentBlock;
