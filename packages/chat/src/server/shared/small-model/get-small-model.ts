import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createAuthStorage } from "mastracode";

const ANTHROPIC_SMALL_MODEL_ID = "claude-haiku-4-5-20251001";
const OPENAI_SMALL_MODEL_ID = "gpt-4o-mini";

const ANTHROPIC_AUTH_PROVIDER_ID = "anthropic";
const OPENAI_AUTH_PROVIDER_ID = "openai";

type AuthStorageLike = {
	reload: () => void;
	has?: (providerId: string) => boolean;
	hasStoredApiKey?: (providerId: string) => boolean;
	isLoggedIn?: (providerId: string) => boolean;
	getStoredApiKey?: (providerId: string) => string | undefined;
	list?: () => string[];
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

interface KeySource {
	key: string;
	source: "env" | "stored";
}

function resolveApiKey(
	envVar: string | undefined,
	storage: AuthStorageLike | null,
	providerId: string,
): KeySource | null {
	const env = envVar?.trim();
	if (env) return { key: env, source: "env" };
	const stored = storage?.getStoredApiKey?.(providerId)?.trim();
	if (stored && stored.length > 0) return { key: stored, source: "stored" };
	return null;
}

/**
 * Returns an AI-SDK `LanguageModel` for small-model tasks (branch naming,
 * title generation). Tries Anthropic first, falls back to OpenAI. Returns
 * `null` if no credentials are available.
 *
 * Currently supports API keys only (env or stored). OAuth-only users (Claude
 * Max, OpenAI Codex) fall back to `null`; callers should degrade gracefully.
 *
 * Returned as `unknown` so callers can pass it to Mastra Agent without
 * coupling this shared module to @mastra/core typing.
 */
export function getSmallModel(): unknown | null {
	const storage = safeAuthStorage();

	const storedProviders = storage?.list?.() ?? [];
	const anthropicLoggedIn = storage?.isLoggedIn?.(ANTHROPIC_AUTH_PROVIDER_ID);
	const openaiLoggedIn = storage?.isLoggedIn?.(OPENAI_AUTH_PROVIDER_ID);

	console.info("[getSmallModel] resolving credentials", {
		envAnthropic: !!process.env.ANTHROPIC_API_KEY,
		envOpenAI: !!process.env.OPENAI_API_KEY,
		storedProviders,
		anthropicLoggedIn: anthropicLoggedIn ?? null,
		openaiLoggedIn: openaiLoggedIn ?? null,
	});

	const anthropic = resolveApiKey(
		process.env.ANTHROPIC_API_KEY,
		storage,
		ANTHROPIC_AUTH_PROVIDER_ID,
	);
	if (anthropic) {
		console.info("[getSmallModel] using Anthropic", {
			source: anthropic.source,
			modelId: ANTHROPIC_SMALL_MODEL_ID,
		});
		return createAnthropic({ apiKey: anthropic.key })(ANTHROPIC_SMALL_MODEL_ID);
	}

	const openai = resolveApiKey(
		process.env.OPENAI_API_KEY,
		storage,
		OPENAI_AUTH_PROVIDER_ID,
	);
	if (openai) {
		console.info("[getSmallModel] using OpenAI", {
			source: openai.source,
			modelId: OPENAI_SMALL_MODEL_ID,
		});
		return createOpenAI({ apiKey: openai.key }).chat(OPENAI_SMALL_MODEL_ID);
	}

	console.warn(
		"[getSmallModel] no API-key credentials found (env or stored). OAuth-only sessions are not yet supported for small-model tasks.",
		{
			anthropicOAuthPresent: anthropicLoggedIn ?? null,
			openaiOAuthPresent: openaiLoggedIn ?? null,
		},
	);
	return null;
}

export function hasSmallModelCredentials(): boolean {
	const storage = safeAuthStorage();
	return (
		resolveApiKey(
			process.env.ANTHROPIC_API_KEY,
			storage,
			ANTHROPIC_AUTH_PROVIDER_ID,
		) !== null ||
		resolveApiKey(
			process.env.OPENAI_API_KEY,
			storage,
			OPENAI_AUTH_PROVIDER_ID,
		) !== null
	);
}
