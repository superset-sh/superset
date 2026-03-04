import { beforeEach, describe, expect, it, mock } from "bun:test";

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
});
