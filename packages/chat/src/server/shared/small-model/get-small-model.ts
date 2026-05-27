import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { MastraModelConfig } from "@mastra/core/llm";
import { createAuthStorage } from "mastracode";
import {
	ANTHROPIC_AUTH_PROVIDER_ID,
	OPENAI_AUTH_PROVIDER_IDS,
} from "../auth-provider-ids";

const ANTHROPIC_SMALL_MODEL_ID = "claude-haiku-4-5-20251001";
const OPENAI_SMALL_MODEL_ID = "gpt-4o-mini";
const KIMI_SMALL_MODEL_ID = "kimi-k2.6";
const DEFAULT_KIMI_BASE_URL = "https://api.moonshot.ai/v1";

const MIN_API_KEY_LENGTH = 30;
const DEV_PLACEHOLDER_KEYS = new Set([
	"dummy",
	"placeholder",
	"sk-kimi-fake-local-dev",
	"sk-moonshot-fake-local-dev",
]);

// OAuth tokens issued through the Claude Code flow are accepted by the
// Anthropic API only when these companion headers are sent alongside the
// `Authorization: Bearer` header. Mastracode hands us the token; we own
// the wiring into createAnthropic and the request-time headers.
const ANTHROPIC_OAUTH_HEADERS = {
	"anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
	"user-agent": "claude-cli/2.1.2 (external, cli)",
	"x-app": "cli",
} as const;

type AuthStorage = ReturnType<typeof createAuthStorage>;

let cachedAuthStorage: AuthStorage | null = null;

function getAuthStorage(): AuthStorage {
	if (!cachedAuthStorage) {
		cachedAuthStorage = createAuthStorage();
	}
	cachedAuthStorage.reload();
	return cachedAuthStorage;
}

/**
 * Anthropic API keys are issued in the form `sk-ant-api…` (currently
 * `sk-ant-api03-…`). Reject anything else — most importantly OAuth access
 * tokens (`sk-ant-oat…`), which Anthropic rejects when sent as `x-api-key`,
 * and dev placeholders like `dummy`.
 */
export function isAnthropicApiKey(key: string): boolean {
	return key.startsWith("sk-ant-api") && key.length >= MIN_API_KEY_LENGTH;
}

/**
 * OpenAI keys all start with `sk-` (legacy `sk-…`, project `sk-proj-…`,
 * service-account `sk-svcacct-…`). The length floor catches placeholders.
 */
export function isOpenAIApiKey(key: string): boolean {
	return key.startsWith("sk-") && key.length >= MIN_API_KEY_LENGTH;
}

export function isKimiApiKey(key: string): boolean {
	const trimmed = key.trim();
	if (trimmed.length < MIN_API_KEY_LENGTH) return false;
	const normalized = trimmed.toLowerCase();
	return !DEV_PLACEHOLDER_KEYS.has(normalized) && !normalized.includes("fake");
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function trimEnvValue(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function normalizeBaseUrl(value: string | null): string {
	if (!value) return DEFAULT_KIMI_BASE_URL;
	try {
		return new URL(value).toString().replace(/\/$/, "");
	} catch {
		return value;
	}
}

type AnthropicResolved =
	| { kind: "apiKey"; key: string }
	| { kind: "oauth"; accessToken: string };

async function resolveAnthropic(): Promise<AnthropicResolved | null> {
	const env = process.env.ANTHROPIC_API_KEY?.trim();
	if (env && isAnthropicApiKey(env)) {
		return { kind: "apiKey", key: env };
	}

	try {
		const authStorage = getAuthStorage();

		// Settings-saved API keys are stored at `apikey:<provider>`. Prefer
		// these over whatever sits in the main slot — otherwise an OAuth
		// login (which writes to the main slot) would mask a stored API key
		// the user explicitly added.
		const storedApiKey = authStorage
			.getStoredApiKey(ANTHROPIC_AUTH_PROVIDER_ID)
			?.trim();
		if (storedApiKey && isAnthropicApiKey(storedApiKey)) {
			return { kind: "apiKey", key: storedApiKey };
		}

		const credential = authStorage.get(ANTHROPIC_AUTH_PROVIDER_ID);
		if (!isObjectRecord(credential)) return null;

		if (
			credential.type === "api_key" &&
			typeof credential.key === "string" &&
			isAnthropicApiKey(credential.key.trim())
		) {
			return { kind: "apiKey", key: credential.key.trim() };
		}

		if (credential.type === "oauth") {
			// Mastracode's getApiKey returns a fresh access token, refreshing
			// via the Claude Code OAuth flow when expired and persisting the
			// new credential back to auth.json. This replaces the custom
			// refresh dance we used to maintain in this package.
			const accessToken = await authStorage.getApiKey(
				ANTHROPIC_AUTH_PROVIDER_ID,
			);
			if (typeof accessToken === "string" && accessToken.trim().length > 0) {
				return { kind: "oauth", accessToken: accessToken.trim() };
			}
		}
	} catch (error) {
		console.warn("[get-small-model] anthropic auth resolution failed:", error);
	}

	return null;
}

async function resolveOpenAIApiKey(): Promise<string | null> {
	const env = process.env.OPENAI_API_KEY?.trim();
	if (env && isOpenAIApiKey(env)) return env;

	try {
		const authStorage = getAuthStorage();
		for (const providerId of OPENAI_AUTH_PROVIDER_IDS) {
			// Same precedence reasoning as Anthropic: dedicated apikey: slot
			// before the main slot.
			const stored = authStorage.getStoredApiKey(providerId)?.trim();
			if (stored && isOpenAIApiKey(stored)) return stored;

			const credential = authStorage.get(providerId);
			if (
				isObjectRecord(credential) &&
				credential.type === "api_key" &&
				typeof credential.key === "string" &&
				isOpenAIApiKey(credential.key.trim())
			) {
				return credential.key.trim();
			}
		}
	} catch (error) {
		console.warn("[get-small-model] openai auth resolution failed:", error);
	}

	return null;
}

function resolveKimiConfig(): {
	apiKey: string;
	baseURL: string;
	modelId: string;
} | null {
	if (
		trimEnvValue(process.env.OPENAI_API_KEY) ||
		trimEnvValue(process.env.OPENAI_AUTH_TOKEN)
	) {
		return null;
	}

	const apiKey =
		trimEnvValue(process.env.KIMI_API_KEY) ??
		trimEnvValue(process.env.MOONSHOT_API_KEY);
	if (!apiKey || !isKimiApiKey(apiKey)) return null;

	return {
		apiKey,
		baseURL: normalizeBaseUrl(
			trimEnvValue(process.env.KIMI_BASE_URL) ??
				trimEnvValue(process.env.KIMI_API_BASE_URL) ??
				trimEnvValue(process.env.MOONSHOT_BASE_URL),
		),
		modelId:
			trimEnvValue(process.env.KIMI_SMALL_MODEL_ID) ??
			trimEnvValue(process.env.MOONSHOT_SMALL_MODEL_ID) ??
			KIMI_SMALL_MODEL_ID,
	};
}

/**
 * Returns an AI-SDK `LanguageModel` for small-model tasks (branch naming,
 * title generation). Returns `null` if no usable credentials are available.
 *
 * Resolution order:
 *   1. ANTHROPIC_API_KEY env var (validated)
 *   2. mastracode auth storage — Anthropic api key
 *   3. mastracode auth storage — Anthropic OAuth (refreshed on the fly)
 *   4. KIMI_API_KEY / MOONSHOT_API_KEY env var (OpenAI-compatible, when no
 *      direct OpenAI env credential is set)
 *   5. OPENAI_API_KEY env var (validated)
 *   6. mastracode auth storage — OpenAI api key (`openai-codex` / `openai`)
 *
 * API keys are validated by prefix + minimum length so dev placeholders
 * (e.g. `ANTHROPIC_API_KEY=dummy` from a sample .env) fall through to the
 * next path instead of being sent to the API and failing 401.
 */
export async function getSmallModel(): Promise<MastraModelConfig | null> {
	const anthropic = await resolveAnthropic();
	if (anthropic?.kind === "apiKey") {
		return createAnthropic({ apiKey: anthropic.key })(ANTHROPIC_SMALL_MODEL_ID);
	}
	if (anthropic?.kind === "oauth") {
		return createAnthropic({
			authToken: anthropic.accessToken,
			headers: ANTHROPIC_OAUTH_HEADERS,
		})(ANTHROPIC_SMALL_MODEL_ID);
	}

	const kimi = resolveKimiConfig();
	if (kimi) {
		return createOpenAI({
			apiKey: kimi.apiKey,
			baseURL: kimi.baseURL,
		}).chat(kimi.modelId);
	}

	const openaiKey = await resolveOpenAIApiKey();
	if (openaiKey) {
		const openAIBaseURL = trimEnvValue(process.env.OPENAI_BASE_URL);
		return createOpenAI({
			apiKey: openaiKey,
			...(openAIBaseURL
				? { baseURL: normalizeBaseUrl(openAIBaseURL) }
				: {}),
		}).chat(OPENAI_SMALL_MODEL_ID);
	}

	console.warn(
		"[get-small-model] no credentials found — naming will fall back",
	);
	return null;
}
