import { getAgentModelSupport } from "@superset/shared/agent-models";

export interface ChatModel {
	id: string;
	label: string;
	provider: string;
}

/**
 * The model catalog behind the new-chat widget's model chip. Widget chats run
 * on canonical `sessions.*` with the claude-code agent, so the choices are the
 * shared "claude" preset's aliases ("opus", "sonnet", …) — the exact values
 * the ACP adapter's model preference resolver accepts — NOT the Mastra-format
 * `SUPERSET_CHAT_MODELS` ids of the legacy cloud chat.
 */
export const CHAT_MODELS: readonly ChatModel[] = (
	getAgentModelSupport("claude")?.models ?? []
).map((model) => ({ ...model, provider: "Anthropic" }));

/** Same default the widget shipped with when it targeted the cloud chat. */
export const DEFAULT_CHAT_MODEL_ID = "opus";

/**
 * A persisted model preference survives catalog swaps (the store predates the
 * canonical-sessions catalog), so ids are validated before they reach
 * `sessions.create` — a stale id degrades to the harness default instead of
 * failing the create.
 */
export function resolveChatModelId(modelId: string): string | null {
	return CHAT_MODELS.some((model) => model.id === modelId) ? modelId : null;
}
