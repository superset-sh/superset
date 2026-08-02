import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	buildOpenAICodexOAuthFetch,
	getSmallModel,
	isAnthropicApiKey,
	isOpenAIApiKey,
	type SmallModelAuthStorage,
} from "./get-small-model";

/**
 * In-memory stand-in for mastracode's AuthStorage. Only the slice
 * `get-small-model` depends on is implemented.
 */
function makeAuthStorage(
	credentials: Record<string, unknown>,
	options: {
		storedApiKeys?: Record<string, string>;
		refreshedTokens?: Record<string, string>;
	} = {},
): SmallModelAuthStorage & { getApiKeyCalls: string[] } {
	const getApiKeyCalls: string[] = [];
	return {
		getApiKeyCalls,
		reload: () => {},
		get: (providerId: string) => credentials[providerId],
		getStoredApiKey: (providerId: string) =>
			options.storedApiKeys?.[providerId],
		getApiKey: async (providerId: string) => {
			getApiKeyCalls.push(providerId);
			return options.refreshedTokens?.[providerId];
		},
	};
}

describe("isAnthropicApiKey", () => {
	it("accepts a real-shaped key", () => {
		expect(
			isAnthropicApiKey(
				"sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			),
		).toBe(true);
	});

	it("rejects dev placeholders", () => {
		expect(isAnthropicApiKey("dummy")).toBe(false);
		expect(isAnthropicApiKey("placeholder")).toBe(false);
		expect(isAnthropicApiKey("")).toBe(false);
	});

	it("rejects OAuth access tokens (sk-ant-oat…) sent as api keys", () => {
		// OAuth tokens fail when sent via x-api-key. Filter them so we fall
		// through to the OAuth path which sends them via Authorization Bearer.
		expect(
			isAnthropicApiKey("sk-ant-oat-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
		).toBe(false);
	});

	it("rejects keys with the prefix but absurd lengths", () => {
		expect(isAnthropicApiKey("sk-ant-api")).toBe(false);
	});

	it("rejects unrelated provider keys", () => {
		expect(isAnthropicApiKey("sk-proj-foo")).toBe(false);
	});
});

describe("isOpenAIApiKey", () => {
	it("accepts legacy, project, and service-account key shapes", () => {
		expect(
			isOpenAIApiKey("sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
		).toBe(true);
		expect(
			isOpenAIApiKey("sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
		).toBe(true);
		expect(
			isOpenAIApiKey("sk-svcacct-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
		).toBe(true);
	});

	it("rejects dev placeholders and obviously-fake values", () => {
		expect(isOpenAIApiKey("dummy")).toBe(false);
		expect(isOpenAIApiKey("sk-")).toBe(false);
		expect(isOpenAIApiKey("")).toBe(false);
	});

	it("rejects values without the sk- prefix", () => {
		expect(isOpenAIApiKey("api-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
	});
});

describe("getSmallModel — credential resolution", () => {
	let savedOpenAI: string | undefined;
	let savedAnthropic: string | undefined;

	beforeEach(() => {
		// The resolver checks env vars first; clear them so the injected auth
		// storage is the only credential source under test.
		savedOpenAI = process.env.OPENAI_API_KEY;
		savedAnthropic = process.env.ANTHROPIC_API_KEY;
		process.env.OPENAI_API_KEY = undefined;
		process.env.ANTHROPIC_API_KEY = undefined;
	});

	afterEach(() => {
		process.env.OPENAI_API_KEY = savedOpenAI;
		process.env.ANTHROPIC_API_KEY = savedAnthropic;
	});

	it("returns null when no credentials are present", async () => {
		const model = await getSmallModel({ authStorage: makeAuthStorage({}) });
		expect(model).toBeNull();
	});

	it("resolves a stored OpenAI API key to a chat model", async () => {
		const authStorage = makeAuthStorage({
			"openai-codex": {
				type: "api_key",
				key: "sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			},
		});
		const model = await getSmallModel({ authStorage });
		expect(model).not.toBeNull();
	});

	// Reproduces https://github.com/.../issues/5708 — a connected OpenAI OAuth
	// (ChatGPT sign-in) credential must be usable for auto-naming. Before the
	// fix, the OpenAI resolver only looked at `api_key` credentials, so this
	// returned null and naming fell back with "no credentials found".
	it("resolves an OpenAI OAuth (ChatGPT sign-in) credential", async () => {
		const authStorage = makeAuthStorage({
			"openai-codex": {
				type: "oauth",
				access: "openai-oauth-access-token",
				refresh: "openai-oauth-refresh-token",
				expires: 0,
				accountId: "acct_123",
			},
		});
		const model = await getSmallModel({ authStorage });
		expect(model).not.toBeNull();
	});

	it("resolves an OpenAI OAuth credential stored under the legacy 'openai' slot", async () => {
		const authStorage = makeAuthStorage({
			openai: {
				type: "oauth",
				access: "legacy-openai-oauth-access",
				refresh: "legacy-refresh",
				expires: 0,
			},
		});
		const model = await getSmallModel({ authStorage });
		expect(model).not.toBeNull();
	});
});

describe("buildOpenAICodexOAuthFetch", () => {
	it("authenticates and routes chat-completions requests to the Codex endpoint", async () => {
		const authStorage = makeAuthStorage({
			"openai-codex": {
				type: "oauth",
				access: "current-access-token",
				refresh: "refresh-token",
				expires: 10_000,
				accountId: "acct_abc",
			},
		});
		const calls: Array<{ url: string; headers: Headers }> = [];
		const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
			calls.push({
				url: input.toString(),
				headers: new Headers(init?.headers),
			});
			return new Response("{}");
		}) as typeof fetch;

		const codexFetch = buildOpenAICodexOAuthFetch(
			authStorage,
			"openai-codex",
			fetchImpl,
			() => 0, // not expired
		);
		await codexFetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(
			"https://chatgpt.com/backend-api/codex/responses",
		);
		expect(calls[0]?.headers.get("Authorization")).toBe(
			"Bearer current-access-token",
		);
		expect(calls[0]?.headers.get("ChatGPT-Account-Id")).toBe("acct_abc");
		expect(authStorage.getApiKeyCalls).toHaveLength(0);
	});

	it("refreshes the access token when the credential has expired", async () => {
		const authStorage = makeAuthStorage(
			{
				"openai-codex": {
					type: "oauth",
					access: "stale-access-token",
					refresh: "refresh-token",
					expires: 1_000,
					accountId: "acct_abc",
				},
			},
			{ refreshedTokens: { "openai-codex": "fresh-access-token" } },
		);
		let seenAuth = "";
		const fetchImpl = (async (
			_input: URL | RequestInfo,
			init?: RequestInit,
		) => {
			seenAuth = new Headers(init?.headers).get("Authorization") ?? "";
			return new Response("{}");
		}) as typeof fetch;

		const codexFetch = buildOpenAICodexOAuthFetch(
			authStorage,
			"openai-codex",
			fetchImpl,
			() => 5_000, // past the 1_000 expiry
		);
		await codexFetch("https://api.openai.com/v1/responses", { method: "POST" });

		expect(authStorage.getApiKeyCalls).toEqual(["openai-codex"]);
		expect(seenAuth).toBe("Bearer fresh-access-token");
	});
});
