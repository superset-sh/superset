import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

type Credential =
	| { type: "api_key"; key: string }
	| { type: "oauth"; access: string; expires: number };

type FakeAuthStorage = {
	reload: ReturnType<typeof mock<() => void>>;
	get: ReturnType<typeof mock<(providerId: string) => Credential | undefined>>;
	set: ReturnType<
		typeof mock<(providerId: string, credential: Credential) => void>
	>;
	remove: ReturnType<typeof mock<(providerId: string) => void>>;
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
	let originalOpenAiEnv: string | undefined;

	beforeEach(() => {
		originalOpenAiEnv = process.env.OPENAI_API_KEY;
		delete process.env.OPENAI_API_KEY;
		createAuthStorageMock.mockClear();
		fakeAuthStorage.clear();
		fakeAuthStorage.reload.mockClear();
		fakeAuthStorage.get.mockClear();
		fakeAuthStorage.set.mockClear();
		fakeAuthStorage.remove.mockClear();
	});

	afterEach(() => {
		if (originalOpenAiEnv === undefined) {
			delete process.env.OPENAI_API_KEY;
			return;
		}
		process.env.OPENAI_API_KEY = originalOpenAiEnv;
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
});
