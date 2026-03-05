import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Credential =
	| { type: "api_key"; key: string }
	| { type: "oauth"; access: string; expires: number; refresh?: string };
type OAuthCallbacks = {
	onAuth: (info: { url: string; instructions?: string }) => void;
	onPrompt: (prompt: { message: string }) => Promise<string>;
	onProgress?: (message: string) => void;
	onManualCodeInput?: () => Promise<string>;
	signal?: AbortSignal;
};

type FakeAuthStorage = {
	reload: ReturnType<typeof mock<() => void>>;
	get: ReturnType<typeof mock<(providerId: string) => Credential | undefined>>;
	set: ReturnType<
		typeof mock<(providerId: string, credential: Credential) => void>
	>;
	remove: ReturnType<typeof mock<(providerId: string) => void>>;
	login: ReturnType<
		typeof mock<
			(providerId: string, callbacks: OAuthCallbacks) => Promise<void>
		>
	>;
	clear: () => void;
};

function createFakeAuthStorage(): FakeAuthStorage {
	const credentials = new Map<string, Credential>();
	return {
		reload: mock(() => {}),
		get: mock((providerId: string) => credentials.get(providerId)),
		set: mock((providerId: string, credential: Credential) => {
			credentials.set(providerId, credential);
		}),
		remove: mock((providerId: string) => {
			credentials.delete(providerId);
		}),
		login: mock(async () => {}),
		clear: () => {
			credentials.clear();
		},
	};
}

const fakeAuthStorage = createFakeAuthStorage();
const createAuthStorageMock = mock(() => fakeAuthStorage);
const MANAGED_ANTHROPIC_ENV_KEYS = [
	"ANTHROPIC_BASE_URL",
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"CLAUDE_CODE_USE_BEDROCK",
	"AWS_REGION",
	"AWS_PROFILE",
] as const;
const MANAGED_OPENAI_ENV_KEYS = ["OPENAI_BASE_URL"] as const;
const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const originalAnthropicEnvValues = {
	ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
	ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
	ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
	CLAUDE_CODE_USE_BEDROCK: process.env.CLAUDE_CODE_USE_BEDROCK,
	AWS_REGION: process.env.AWS_REGION,
	AWS_PROFILE: process.env.AWS_PROFILE,
};
const originalOpenAIEnvValues = {
	OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
};
let testSupersetHomeDir: string | null = null;

mock.module("mastracode", () => ({
	createAuthStorage: createAuthStorageMock,
}));

const { ChatService } = await import("./chat-service");

describe("ChatService OpenAI auth storage", () => {
	beforeEach(() => {
		createAuthStorageMock.mockClear();
		fakeAuthStorage.clear();
		fakeAuthStorage.reload.mockClear();
		fakeAuthStorage.get.mockClear();
		fakeAuthStorage.set.mockClear();
		fakeAuthStorage.remove.mockClear();
		fakeAuthStorage.login.mockClear();
		testSupersetHomeDir = mkdtempSync(join(tmpdir(), "chat-service-test-"));
		process.env.SUPERSET_HOME_DIR = testSupersetHomeDir;
		for (const key of MANAGED_ANTHROPIC_ENV_KEYS) {
			delete process.env[key];
		}
		for (const key of MANAGED_OPENAI_ENV_KEYS) {
			delete process.env[key];
		}
	});

	afterEach(() => {
		if (testSupersetHomeDir) {
			rmSync(testSupersetHomeDir, { recursive: true, force: true });
			testSupersetHomeDir = null;
		}
		if (originalSupersetHomeDir) {
			process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
		} else {
			delete process.env.SUPERSET_HOME_DIR;
		}
		for (const key of MANAGED_ANTHROPIC_ENV_KEYS) {
			const value = originalAnthropicEnvValues[key];
			if (value) {
				process.env[key] = value;
			} else {
				delete process.env[key];
			}
		}
		for (const key of MANAGED_OPENAI_ENV_KEYS) {
			const value = originalOpenAIEnvValues[key];
			if (value) {
				process.env[key] = value;
			} else {
				delete process.env[key];
			}
		}
	});

	it("uses standalone createAuthStorage and reuses it across calls", async () => {
		const chatService = new ChatService();

		await chatService.setOpenAIApiKey({ apiKey: " test-key " });
		await chatService.getOpenAIAuthStatus();
		await chatService.clearOpenAIApiKey();

		expect(createAuthStorageMock).toHaveBeenCalledTimes(1);
		expect(fakeAuthStorage.set).toHaveBeenCalledWith("openai-codex", {
			type: "api_key",
			key: "test-key",
		});
		expect(fakeAuthStorage.remove).toHaveBeenCalledWith("openai-codex");
	});

	it("stores and clears Anthropic API key in standalone auth storage", async () => {
		const chatService = new ChatService();

		await chatService.setAnthropicApiKey({ apiKey: " test-anthropic-key " });
		await chatService.clearAnthropicApiKey();

		expect(createAuthStorageMock).toHaveBeenCalledTimes(1);
		expect(fakeAuthStorage.set).toHaveBeenCalledWith("anthropic", {
			type: "api_key",
			key: "test-anthropic-key",
		});
		expect(fakeAuthStorage.remove).toHaveBeenCalledWith("anthropic");
	});

	it("persists Anthropic OAuth credentials to auth storage on completion", async () => {
		const chatService = new ChatService();
		const oauthExpiresAt = Date.now() + 60 * 60 * 1000;

		fakeAuthStorage.login.mockImplementation(
			async (providerId: string, callbacks: OAuthCallbacks) => {
				callbacks.onAuth({
					url: "https://claude.ai/oauth/authorize?foo=bar",
					instructions: "Open browser and finish login",
				});
				const code = await callbacks.onPrompt({ message: "Paste code" });
				expect(code).toBe("auth-code#state");
				fakeAuthStorage.set(providerId, {
					type: "oauth",
					access: "oauth-access-token",
					refresh: "oauth-refresh-token",
					expires: oauthExpiresAt,
				});
			},
		);

		await chatService.setAnthropicApiKey({ apiKey: " old-key " });

		const start = await chatService.startAnthropicOAuth();
		expect(start.url).toContain("claude.ai/oauth/authorize");

		const result = await chatService.completeAnthropicOAuth({
			code: "auth-code#state",
		});

		expect(fakeAuthStorage.login).toHaveBeenCalledWith(
			"anthropic",
			expect.any(Object),
		);
		expect(fakeAuthStorage.set).toHaveBeenCalledWith(
			"anthropic",
			expect.objectContaining({
				type: "oauth",
				access: "oauth-access-token",
				refresh: "oauth-refresh-token",
			}),
		);
		expect(result.expiresAt).toBe(oauthExpiresAt);
		expect(chatService.getAnthropicAuthStatus().method).toBe("oauth");
	});

	it("switches Anthropic status from oauth to api key when api key is saved", async () => {
		const chatService = new ChatService();

		fakeAuthStorage.login.mockImplementation(
			async (providerId: string, callbacks: OAuthCallbacks) => {
				callbacks.onAuth({ url: "https://claude.ai/oauth/authorize?foo=bar" });
				const code = await callbacks.onPrompt({ message: "Paste code" });
				expect(code).toBe("auth-code#state");
				fakeAuthStorage.set(providerId, {
					type: "oauth",
					access: "oauth-access-token",
					expires: Date.now() + 60 * 60 * 1000,
				});
			},
		);

		await chatService.startAnthropicOAuth();
		await chatService.completeAnthropicOAuth({ code: "auth-code#state" });
		expect(chatService.getAnthropicAuthStatus().method).toBe("oauth");

		await chatService.setAnthropicApiKey({ apiKey: " api-key " });
		expect(chatService.getAnthropicAuthStatus().method).toBe("api_key");
	});

	it("saves Anthropic gateway env config and uses env auth method", async () => {
		const chatService = new ChatService();

		await chatService.setAnthropicEnvConfig({
			envText:
				"ANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh\nANTHROPIC_AUTH_TOKEN=gateway-token",
		});

		expect(process.env.ANTHROPIC_BASE_URL).toBe(
			"https://ai-gateway.vercel.sh/v1",
		);
		expect(process.env.ANTHROPIC_AUTH_TOKEN).toBe("gateway-token");
		expect(process.env.ANTHROPIC_API_KEY).toBe("gateway-token");
		expect(fakeAuthStorage.set).toHaveBeenCalledWith("anthropic", {
			type: "api_key",
			key: "gateway-token",
		});
		expect(chatService.getAnthropicEnvConfig()).toEqual({
			envText:
				"ANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh\nANTHROPIC_AUTH_TOKEN=gateway-token",
			variables: {
				ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh",
				ANTHROPIC_AUTH_TOKEN: "gateway-token",
			},
		});
		expect(chatService.getAnthropicAuthStatus()).toEqual({
			authenticated: true,
			method: "env",
			baseUrl: "https://ai-gateway.vercel.sh",
		});
	});

	it("clears stored Anthropic OAuth credentials when saving env config", async () => {
		const chatService = new ChatService();
		fakeAuthStorage.set("anthropic", {
			type: "oauth",
			access: "oauth-access-token",
			expires: Date.now() + 60 * 60 * 1000,
		});
		expect(chatService.getAnthropicAuthStatus().method).toBe("oauth");

		await chatService.setAnthropicEnvConfig({
			envText:
				"ANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh\nANTHROPIC_AUTH_TOKEN=gateway-token",
		});

		expect(fakeAuthStorage.remove).toHaveBeenCalledWith("anthropic");
		expect(chatService.getAnthropicAuthStatus().method).toBe("env");
	});

	it("persists Anthropic env config without API key/token", async () => {
		const chatService = new ChatService();

		await chatService.setAnthropicEnvConfig({
			envText: "ANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh",
		});

		expect(chatService.getAnthropicEnvConfig()).toEqual({
			envText: "ANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh",
			variables: {
				ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh",
			},
		});
		expect(chatService.getAnthropicAuthStatus()).toEqual({
			authenticated: true,
			method: "env",
			baseUrl: "https://ai-gateway.vercel.sh",
		});
	});

	it("passes through non-Anthropic env vars from settings", async () => {
		const chatService = new ChatService();
		await chatService.setAnthropicEnvConfig({
			envText:
				"ANTHROPIC_API_KEY=env-key\nCLAUDE_CODE_USE_BEDROCK=1\nAWS_REGION=us-east-1",
		});

		expect(process.env.ANTHROPIC_API_KEY).toBe("env-key");
		expect(process.env.CLAUDE_CODE_USE_BEDROCK).toBe("1");
		expect(process.env.AWS_REGION).toBe("us-east-1");
		expect(fakeAuthStorage.set).toHaveBeenCalledWith("anthropic", {
			type: "api_key",
			key: "env-key",
		});
		expect(chatService.getAnthropicEnvConfig()).toEqual({
			envText:
				"ANTHROPIC_API_KEY=env-key\nCLAUDE_CODE_USE_BEDROCK=1\nAWS_REGION=us-east-1",
			variables: {
				ANTHROPIC_API_KEY: "env-key",
				CLAUDE_CODE_USE_BEDROCK: "1",
				AWS_REGION: "us-east-1",
			},
		});
	});

	it("clears Anthropic gateway env vars", async () => {
		const chatService = new ChatService();
		await chatService.setAnthropicEnvConfig({
			envText:
				"ANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh\nANTHROPIC_AUTH_TOKEN=gateway-token",
		});

		await chatService.clearAnthropicEnvConfig();

		expect(process.env.ANTHROPIC_BASE_URL).toBeUndefined();
		expect(process.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
		expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
		expect(fakeAuthStorage.remove).toHaveBeenCalledWith("anthropic");
		expect(chatService.getAnthropicEnvConfig()).toEqual({
			envText: "",
			variables: {},
		});
		expect(chatService.getAnthropicAuthStatus().method).toBeNull();
	});

	it("deletes previously applied pass-through env keys when settings change", async () => {
		const chatService = new ChatService();
		await chatService.setAnthropicEnvConfig({
			envText: "CLAUDE_CODE_USE_BEDROCK=1\nAWS_PROFILE=default",
		});
		expect(process.env.CLAUDE_CODE_USE_BEDROCK).toBe("1");
		expect(process.env.AWS_PROFILE).toBe("default");

		await chatService.setAnthropicEnvConfig({
			envText: "CLAUDE_CODE_USE_BEDROCK=1",
		});

		expect(process.env.CLAUDE_CODE_USE_BEDROCK).toBe("1");
		expect(process.env.AWS_PROFILE).toBeUndefined();
	});

	it("starts and completes OpenAI OAuth via auth storage login", async () => {
		const chatService = new ChatService();

		fakeAuthStorage.login.mockImplementation(
			async (providerId: string, callbacks: OAuthCallbacks) => {
				callbacks.onAuth({
					url: "https://auth.openai.com/oauth/authorize?foo=bar",
					instructions: "Open browser and finish login",
				});
				const code = callbacks.onManualCodeInput
					? await callbacks.onManualCodeInput()
					: await callbacks.onPrompt({ message: "Paste code" });
				expect(code).toBe("code#state");
				fakeAuthStorage.set(providerId, {
					type: "oauth",
					access: "openai-oauth-access",
					expires: Date.now() + 60 * 60 * 1000,
				});
			},
		);

		const start = await chatService.startOpenAIOAuth();
		expect(start.url).toContain("auth.openai.com");
		expect(start.instructions).toContain("Open browser");

		await chatService.completeOpenAIOAuth({ code: "code#state" });
		expect(fakeAuthStorage.login).toHaveBeenCalledWith(
			"openai-codex",
			expect.any(Object),
		);
	});

	it("replaces OpenAI API key auth with OAuth when OAuth completes", async () => {
		const chatService = new ChatService();

		fakeAuthStorage.login.mockImplementation(
			async (providerId: string, callbacks: OAuthCallbacks) => {
				callbacks.onAuth({
					url: "https://auth.openai.com/oauth/authorize?foo=bar",
				});
				const code = callbacks.onManualCodeInput
					? await callbacks.onManualCodeInput()
					: await callbacks.onPrompt({ message: "Paste code" });
				expect(code).toBe("code#state");
				fakeAuthStorage.set(providerId, {
					type: "oauth",
					access: "openai-oauth-access",
					expires: Date.now() + 60 * 60 * 1000,
				});
			},
		);

		await chatService.setOpenAIApiKey({ apiKey: " managed-key " });

		await chatService.startOpenAIOAuth();
		await chatService.completeOpenAIOAuth({ code: "code#state" });
		const status = await chatService.getOpenAIAuthStatus();
		expect(status.method).toBe("oauth");
	});

	it("ignores OPENAI_API_KEY env value without auth storage credentials", async () => {
		const chatService = new ChatService();

		process.env.OPENAI_API_KEY = "externally-provided-key";
		const status = await chatService.getOpenAIAuthStatus();
		expect(status.method).toBeNull();
		delete process.env.OPENAI_API_KEY;
	});

	it("completes OpenAI OAuth when provider flow does not require manual code", async () => {
		const chatService = new ChatService();

		fakeAuthStorage.login.mockImplementation(
			async (providerId: string, callbacks: OAuthCallbacks) => {
				callbacks.onAuth({
					url: "https://auth.openai.com/oauth/authorize?foo=bar",
				});
				fakeAuthStorage.set(providerId, {
					type: "oauth",
					access: "openai-oauth-access",
					expires: Date.now() + 60 * 60 * 1000,
				});
			},
		);

		const unhandledRejections: unknown[] = [];
		const onUnhandledRejection = (reason: unknown) => {
			unhandledRejections.push(reason);
		};
		process.on("unhandledRejection", onUnhandledRejection);

		try {
			const start = await chatService.startOpenAIOAuth();
			expect(start.url).toContain("auth.openai.com");
			await chatService.completeOpenAIOAuth({});
			await Promise.resolve();
			expect(unhandledRejections).toHaveLength(0);
		} finally {
			process.off("unhandledRejection", onUnhandledRejection);
		}
	});

	it("clears OpenAI OAuth session when auth-url wait times out", async () => {
		const chatService = new ChatService();
		let loginSignal: AbortSignal | undefined;

		fakeAuthStorage.login.mockImplementation(
			async (_providerId: string, callbacks: OAuthCallbacks) => {
				loginSignal = callbacks.signal;
				await new Promise<void>((resolve) => {
					callbacks.signal?.addEventListener("abort", () => resolve(), {
						once: true,
					});
				});
			},
		);

		const timeoutSlot = ChatService as unknown as {
			OAUTH_URL_TIMEOUT_MS: number;
		};
		const previousTimeout = timeoutSlot.OAUTH_URL_TIMEOUT_MS;
		timeoutSlot.OAUTH_URL_TIMEOUT_MS = 1;

		try {
			await expect(chatService.startOpenAIOAuth()).rejects.toThrow(
				"Timed out while waiting for OpenAI OAuth URL",
			);
			expect(loginSignal?.aborted).toBe(true);
			await expect(
				chatService.completeOpenAIOAuth({ code: "code#state" }),
			).rejects.toThrow("No active OpenAI auth session. Start auth again.");
		} finally {
			timeoutSlot.OAUTH_URL_TIMEOUT_MS = previousTimeout;
		}
	});

	// Tests for issue #2019: custom base URL support for API-key auth
	it("stores and applies OPENAI_BASE_URL when provided with OpenAI API key", async () => {
		const chatService = new ChatService();

		await chatService.setOpenAIApiKey({
			apiKey: "sk-openai-key",
			baseUrl: "https://my-gateway.example.com/v1",
		});

		expect(process.env.OPENAI_BASE_URL).toBe(
			"https://my-gateway.example.com/v1",
		);
		const status = await chatService.getOpenAIAuthStatus();
		expect(status.authenticated).toBe(true);
		expect(status.method).toBe("api_key");
		expect(status.baseUrl).toBe("https://my-gateway.example.com/v1");
	});

	it("strips trailing slash from OpenAI base URL", async () => {
		const chatService = new ChatService();

		await chatService.setOpenAIApiKey({
			apiKey: "sk-openai-key",
			baseUrl: "https://my-gateway.example.com/v1/",
		});

		expect(process.env.OPENAI_BASE_URL).toBe(
			"https://my-gateway.example.com/v1",
		);
	});

	it("clears OPENAI_BASE_URL and status baseUrl when OpenAI API key is cleared", async () => {
		const chatService = new ChatService();

		await chatService.setOpenAIApiKey({
			apiKey: "sk-openai-key",
			baseUrl: "https://my-gateway.example.com/v1",
		});
		await chatService.clearOpenAIApiKey();

		expect(process.env.OPENAI_BASE_URL).toBeUndefined();
		const status = await chatService.getOpenAIAuthStatus();
		expect(status.baseUrl).toBeUndefined();
	});

	it("persists OpenAI base URL across ChatService instances", async () => {
		const configPath = join(String(testSupersetHomeDir), "base-urls.json");

		const service1 = new ChatService({ apiKeyBaseUrlsConfigPath: configPath });
		await service1.setOpenAIApiKey({
			apiKey: "sk-openai-key",
			baseUrl: "https://my-gateway.example.com/v1",
		});

		// Simulate restart: clear env var and create new instance
		delete process.env.OPENAI_BASE_URL;
		fakeAuthStorage.set("openai-codex", {
			type: "api_key",
			key: "sk-openai-key",
		});

		const service2 = new ChatService({ apiKeyBaseUrlsConfigPath: configPath });
		expect(process.env.OPENAI_BASE_URL).toBe(
			"https://my-gateway.example.com/v1",
		);
		const status = await service2.getOpenAIAuthStatus();
		expect(status.baseUrl).toBe("https://my-gateway.example.com/v1");
	});

	it("rejects invalid URL format for OpenAI base URL", async () => {
		const chatService = new ChatService();

		await expect(
			chatService.setOpenAIApiKey({
				apiKey: "sk-openai-key",
				baseUrl: "not-a-url",
			}),
		).rejects.toThrow("Invalid base URL");
	});

	it("rejects non-http/https protocol for OpenAI base URL", async () => {
		const chatService = new ChatService();

		await expect(
			chatService.setOpenAIApiKey({
				apiKey: "sk-openai-key",
				baseUrl: "ftp://example.com/v1",
			}),
		).rejects.toThrow("Invalid base URL: must use http or https.");
	});

	it("stores and applies ANTHROPIC_BASE_URL when provided with Anthropic API key", async () => {
		const chatService = new ChatService();

		await chatService.setAnthropicApiKey({
			apiKey: "sk-ant-key",
			baseUrl: "https://anthropic-gateway.example.com/v1",
		});

		expect(process.env.ANTHROPIC_BASE_URL).toBe(
			"https://anthropic-gateway.example.com/v1",
		);
		const status = chatService.getAnthropicAuthStatus();
		expect(status.authenticated).toBe(true);
		expect(status.method).toBe("api_key");
		expect(status.baseUrl).toBe("https://anthropic-gateway.example.com/v1");
	});

	it("clears ANTHROPIC_BASE_URL and status baseUrl when Anthropic API key is cleared", async () => {
		const chatService = new ChatService();

		await chatService.setAnthropicApiKey({
			apiKey: "sk-ant-key",
			baseUrl: "https://anthropic-gateway.example.com/v1",
		});
		await chatService.clearAnthropicApiKey();

		expect(process.env.ANTHROPIC_BASE_URL).toBeUndefined();
		const status = chatService.getAnthropicAuthStatus();
		expect(status.baseUrl).toBeUndefined();
	});

	it("persists Anthropic base URL across ChatService instances", async () => {
		const configPath = join(String(testSupersetHomeDir), "base-urls.json");

		const service1 = new ChatService({ apiKeyBaseUrlsConfigPath: configPath });
		await service1.setAnthropicApiKey({
			apiKey: "sk-ant-key",
			baseUrl: "https://anthropic-gateway.example.com/v1",
		});

		// Simulate restart: clear env var and create new instance
		delete process.env.ANTHROPIC_BASE_URL;
		fakeAuthStorage.set("anthropic", { type: "api_key", key: "sk-ant-key" });

		const service2 = new ChatService({ apiKeyBaseUrlsConfigPath: configPath });
		expect(process.env.ANTHROPIC_BASE_URL).toBe(
			"https://anthropic-gateway.example.com/v1",
		);
		const status = service2.getAnthropicAuthStatus();
		expect(status.baseUrl).toBe("https://anthropic-gateway.example.com/v1");
	});

	it("env config ANTHROPIC_BASE_URL takes precedence over API-key base URL", async () => {
		const chatService = new ChatService();

		await chatService.setAnthropicApiKey({
			apiKey: "sk-ant-key",
			baseUrl: "https://api-key-gateway.example.com/v1",
		});
		await chatService.setAnthropicEnvConfig({
			envText:
				"ANTHROPIC_API_KEY=env-key\nANTHROPIC_BASE_URL=https://env-gateway.example.com/v1",
		});

		expect(process.env.ANTHROPIC_BASE_URL).toBe(
			"https://env-gateway.example.com/v1",
		);
	});

	it("getOpenAIAuthStatus does not include baseUrl when none is configured", async () => {
		const chatService = new ChatService();

		await chatService.setOpenAIApiKey({ apiKey: "sk-openai-key" });
		const status = await chatService.getOpenAIAuthStatus();

		expect(status.authenticated).toBe(true);
		expect(status.method).toBe("api_key");
		expect(status.baseUrl).toBeUndefined();
	});
});
