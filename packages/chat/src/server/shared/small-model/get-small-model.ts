import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createAuthStorage } from "mastracode";

const ANTHROPIC_SMALL_MODEL_ID = "claude-haiku-4-5-20251001";
const OPENAI_SMALL_MODEL_ID = "gpt-4o-mini";

const ANTHROPIC_AUTH_PROVIDER_ID = "anthropic";
const OPENAI_AUTH_PROVIDER_ID = "openai";

type AuthStorageLike = {
	reload: () => void;
	getStoredApiKey?: (providerId: string) => string | undefined;
};

function safeAuthStorage(): AuthStorageLike | null {
	try {
		const storage = createAuthStorage() as AuthStorageLike;
		storage.reload();
		return storage;
	} catch (error) {
		console.warn("[getSmallModel] failed to load auth storage:", error);
		return null;
	}
}

function resolveApiKey(
	envVar: string | undefined,
	storage: AuthStorageLike | null,
	providerId: string,
): string | null {
	const env = envVar?.trim();
	if (env) return env;
	const stored = storage?.getStoredApiKey?.(providerId)?.trim();
	return stored && stored.length > 0 ? stored : null;
}

/**
 * Returns an AI-SDK `LanguageModel` for small-model tasks (branch naming,
 * title generation). Tries Anthropic first, falls back to OpenAI. Returns
 * `null` if no credentials are available.
 *
 * Supports API keys only (env or stored). OAuth-only users (Claude Max,
 * OpenAI Codex) fall back to `null`; callers should degrade gracefully.
 *
 * Returned as `unknown` so callers can pass it to Mastra Agent without
 * coupling this shared module to @mastra/core typing.
 */
export function getSmallModel(): unknown | null {
	const storage = safeAuthStorage();

	const anthropicKey = resolveApiKey(
		process.env.ANTHROPIC_API_KEY,
		storage,
		ANTHROPIC_AUTH_PROVIDER_ID,
	);
	if (anthropicKey) {
		return createAnthropic({ apiKey: anthropicKey })(ANTHROPIC_SMALL_MODEL_ID);
	}

	const openaiKey = resolveApiKey(
		process.env.OPENAI_API_KEY,
		storage,
		OPENAI_AUTH_PROVIDER_ID,
	);
	if (openaiKey) {
		return createOpenAI({ apiKey: openaiKey }).chat(OPENAI_SMALL_MODEL_ID);
	}

	return null;
}
