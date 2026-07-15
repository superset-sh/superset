import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { MastraModelConfig } from "@mastra/core/llm";
import { type LanguageModelMiddleware, wrapLanguageModel } from "ai";
import { createAuthStorage } from "mastracode";
import {
	ANTHROPIC_AUTH_PROVIDER_ID,
	OPENAI_AUTH_PROVIDER_IDS,
} from "../auth-provider-ids";

const ANTHROPIC_SMALL_MODEL_ID = "claude-haiku-4-5-20251001";
const OPENAI_SMALL_MODEL_ID = "gpt-4o-mini";
// OpenAI OAuth (ChatGPT sign-in) tokens are only accepted by the Codex API,
// which speaks the Responses API and exposes Codex model ids rather than the
// chat-completions catalog. `codex-mini-latest` is the cheapest of those and
// is plenty for naming — it mirrors mastracode's own small-task default.
const OPENAI_CODEX_SMALL_MODEL_ID = "codex-mini-latest";

const MIN_API_KEY_LENGTH = 30;

// The ChatGPT OAuth flow issues tokens for the Codex backend, not the public
// OpenAI API. Requests must be Bearer-authenticated, carry the account id, and
// be routed to the Codex endpoint (which the SDK would otherwise send to
// api.openai.com). Mastracode owns the same wiring for the main agent; we
// replicate the minimal slice needed for the small naming model here.
const CODEX_API_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";

// The Codex API rejects requests unless `store` is disabled and instructions
// are supplied, so a bare `createOpenAI(...).responses(...)` call 400s. This
// middleware injects the required provider options for every request.
const CODEX_INSTRUCTIONS =
	"You generate short, descriptive names. Respond with only the requested name.";

const codexRequestMiddleware: LanguageModelMiddleware = {
	specificationVersion: "v3",
	transformParams: async ({ params }) => {
		params.providerOptions = {
			...params.providerOptions,
			openai: {
				...(params.providerOptions?.openai ?? {}),
				instructions: CODEX_INSTRUCTIONS,
				store: false,
			},
		};
		return params;
	},
};

// OAuth tokens issued through the Claude Code flow are accepted by the
// Anthropic API only when these companion headers are sent alongside the
// `Authorization: Bearer` header. Mastracode hands us the token; we own
// the wiring into createAnthropic and the request-time headers.
const ANTHROPIC_OAUTH_HEADERS = {
	"anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
	"user-agent": "claude-cli/2.1.2 (external, cli)",
	"x-app": "cli",
} as const;

/**
 * The slice of mastracode's `AuthStorage` this module depends on. Declaring it
 * explicitly (rather than reaching for the concrete class) keeps the resolvers
 * unit-testable with an in-memory fake.
 */
export interface SmallModelAuthStorage {
	reload: () => void;
	get: (providerId: string) => unknown;
	getStoredApiKey: (providerId: string) => string | undefined;
	getApiKey: (providerId: string) => Promise<string | undefined>;
}

export interface SmallModelDeps {
	authStorage?: SmallModelAuthStorage;
	/** Overridable for tests; defaults to the global `fetch`. */
	fetchImpl?: typeof fetch;
	/** Overridable for tests; defaults to `Date.now`. */
	now?: () => number;
}

let cachedAuthStorage: SmallModelAuthStorage | null = null;

function getAuthStorage(): SmallModelAuthStorage {
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

type AnthropicResolved =
	| { kind: "apiKey"; key: string }
	| { kind: "oauth"; accessToken: string };

async function resolveAnthropic(
	authStorage: SmallModelAuthStorage,
): Promise<AnthropicResolved | null> {
	const env = process.env.ANTHROPIC_API_KEY?.trim();
	if (env && isAnthropicApiKey(env)) {
		return { kind: "apiKey", key: env };
	}

	try {
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

type OpenAIResolved =
	| { kind: "apiKey"; key: string }
	| { kind: "oauth"; providerId: string };

async function resolveOpenAI(
	authStorage: SmallModelAuthStorage,
): Promise<OpenAIResolved | null> {
	const env = process.env.OPENAI_API_KEY?.trim();
	if (env && isOpenAIApiKey(env)) return { kind: "apiKey", key: env };

	try {
		for (const providerId of OPENAI_AUTH_PROVIDER_IDS) {
			// Same precedence reasoning as Anthropic: dedicated apikey: slot
			// before the main slot.
			const stored = authStorage.getStoredApiKey(providerId)?.trim();
			if (stored && isOpenAIApiKey(stored)) {
				return { kind: "apiKey", key: stored };
			}

			const credential = authStorage.get(providerId);
			if (!isObjectRecord(credential)) continue;

			if (
				credential.type === "api_key" &&
				typeof credential.key === "string" &&
				isOpenAIApiKey(credential.key.trim())
			) {
				return { kind: "apiKey", key: credential.key.trim() };
			}

			// ChatGPT "Sign in" writes an OAuth credential to the main slot.
			// It is a usable credential for the Codex API, so treat it the same
			// way the Anthropic path treats Claude OAuth — the actual access
			// token is fetched (and refreshed) at request time.
			if (
				credential.type === "oauth" &&
				typeof credential.access === "string" &&
				credential.access.trim().length > 0
			) {
				return { kind: "oauth", providerId };
			}
		}
	} catch (error) {
		console.warn("[get-small-model] openai auth resolution failed:", error);
	}

	return null;
}

/**
 * Builds a `fetch` that authenticates against the Codex API using the OpenAI
 * OAuth credential in auth storage. The access token is read (and refreshed
 * when expired) per request, the account id is forwarded, and Responses /
 * chat-completions URLs are rewritten to the Codex endpoint.
 */
export function buildOpenAICodexOAuthFetch(
	authStorage: SmallModelAuthStorage,
	providerId: string,
	fetchImpl: typeof fetch,
	now: () => number,
): typeof fetch {
	return (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
		authStorage.reload();
		const credential = authStorage.get(providerId);
		if (!isObjectRecord(credential) || credential.type !== "oauth") {
			throw new Error("[get-small-model] openai codex credential missing");
		}

		let accessToken =
			typeof credential.access === "string" ? credential.access : "";
		const expires =
			typeof credential.expires === "number" ? credential.expires : 0;
		if (expires > 0 && now() >= expires) {
			const refreshed = await authStorage.getApiKey(providerId);
			if (!refreshed) {
				throw new Error("[get-small-model] openai codex token refresh failed");
			}
			accessToken = refreshed;
		}

		const headers = new Headers(init?.headers);
		headers.delete("authorization");
		headers.set("Authorization", `Bearer ${accessToken}`);
		const accountId =
			typeof credential.accountId === "string"
				? credential.accountId.trim()
				: "";
		if (accountId) {
			headers.set("ChatGPT-Account-Id", accountId);
		}

		const parsed =
			url instanceof URL
				? url
				: new URL(typeof url === "string" ? url : (url as Request).url);
		const shouldRewrite =
			parsed.pathname.includes("/v1/responses") ||
			parsed.pathname.includes("/chat/completions");
		const finalUrl = shouldRewrite ? new URL(CODEX_API_ENDPOINT) : parsed;

		return fetchImpl(finalUrl, { ...init, headers });
	}) as typeof fetch;
}

/**
 * Returns an AI-SDK `LanguageModel` for small-model tasks (branch naming,
 * title generation). Returns `null` if no usable credentials are available.
 *
 * Resolution order:
 *   1. ANTHROPIC_API_KEY env var (validated)
 *   2. mastracode auth storage — Anthropic api key
 *   3. mastracode auth storage — Anthropic OAuth (refreshed on the fly)
 *   4. OPENAI_API_KEY env var (validated)
 *   5. mastracode auth storage — OpenAI api key (`openai-codex` / `openai`)
 *   6. mastracode auth storage — OpenAI OAuth via the Codex API (ChatGPT
 *      sign-in, refreshed on the fly)
 *
 * API keys are validated by prefix + minimum length so dev placeholders
 * (e.g. `ANTHROPIC_API_KEY=dummy` from a sample .env) fall through to the
 * next path instead of being sent to the API and failing 401.
 */
export async function getSmallModel(
	deps: SmallModelDeps = {},
): Promise<MastraModelConfig | null> {
	const authStorage = deps.authStorage ?? getAuthStorage();
	const fetchImpl = deps.fetchImpl ?? fetch;
	const now = deps.now ?? Date.now;

	const anthropic = await resolveAnthropic(authStorage);
	if (anthropic?.kind === "apiKey") {
		return createAnthropic({ apiKey: anthropic.key })(ANTHROPIC_SMALL_MODEL_ID);
	}
	if (anthropic?.kind === "oauth") {
		return createAnthropic({
			authToken: anthropic.accessToken,
			headers: ANTHROPIC_OAUTH_HEADERS,
		})(ANTHROPIC_SMALL_MODEL_ID);
	}

	const openai = await resolveOpenAI(authStorage);
	if (openai?.kind === "apiKey") {
		return createOpenAI({ apiKey: openai.key }).chat(OPENAI_SMALL_MODEL_ID);
	}
	if (openai?.kind === "oauth") {
		const provider = createOpenAI({
			// The SDK requires a key; the real Bearer token is injected by the
			// Codex fetch below, which strips this placeholder.
			apiKey: "oauth-placeholder",
			fetch: buildOpenAICodexOAuthFetch(
				authStorage,
				openai.providerId,
				fetchImpl,
				now,
			),
		});
		return wrapLanguageModel({
			model: provider.responses(OPENAI_CODEX_SMALL_MODEL_ID),
			middleware: [codexRequestMiddleware],
		});
	}

	console.warn(
		"[get-small-model] no credentials found — naming will fall back",
	);
	return null;
}
