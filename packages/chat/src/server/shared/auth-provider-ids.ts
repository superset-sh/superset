export const ANTHROPIC_AUTH_PROVIDER_ID = "anthropic";
export const OPENAI_AUTH_PROVIDER_ID = "openai-codex";
// Mastracode historically wrote OpenAI under "openai" before the Codex split.
// Read both when resolving credentials.
export const OPENAI_AUTH_PROVIDER_IDS = [
	OPENAI_AUTH_PROVIDER_ID,
	"openai",
] as const;

// MiniMax (minimax.io) — Anthropic-protocol provider. Single key, no OAuth.
// See packages/chat/src/server/desktop/auth/minimax/ for the resolver.
export const MINIMAX_AUTH_PROVIDER_ID = "minimax";
