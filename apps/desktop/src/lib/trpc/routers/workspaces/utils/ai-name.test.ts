import { afterEach, describe, expect, mock, test } from "bun:test";

// Mock @superset/chat/host before importing the module under test
const mockGetAnthropicCredentials = mock(() => null);
const mockGetOpenAICredentials = mock(() => null);
const mockGenerateTitleFromMessage = mock(async () => null);

mock.module("@superset/chat/host", () => ({
	getCredentialsFromAnySource: mockGetAnthropicCredentials,
	getAnthropicProviderOptions: mock(() => ({})),
	getOpenAICredentialsFromAnySource: mockGetOpenAICredentials,
	generateTitleFromMessage: mockGenerateTitleFromMessage,
}));

mock.module("@ai-sdk/anthropic", () => ({
	createAnthropic: mock(() => mock(() => "anthropic-model")),
}));

mock.module("@ai-sdk/openai", () => ({
	createOpenAI: mock(() => mock(() => "openai-model")),
}));

mock.module("main/lib/local-db", () => ({
	localDb: {
		select: mock(() => ({
			from: mock(() => ({
				where: mock(() => ({ get: mock(() => null) })),
			})),
		})),
		update: mock(() => ({
			set: mock(() => ({
				where: mock(() => ({ run: mock(() => ({ changes: 0 })) })),
			})),
		})),
	},
}));

mock.module("@superset/local-db", () => ({
	workspaces: {},
}));

mock.module("drizzle-orm", () => ({
	and: mock((...args: unknown[]) => args),
	eq: mock((_col: unknown, val: unknown) => val),
	isNull: mock((_col: unknown) => null),
}));

const { attemptWorkspaceAutoRenameFromPrompt } = await import("./ai-name");

describe("attemptWorkspaceAutoRenameFromPrompt", () => {
	afterEach(() => {
		mockGetAnthropicCredentials.mockReset();
		mockGetOpenAICredentials.mockReset();
		mockGenerateTitleFromMessage.mockReset();
	});

	describe("when no credentials are configured", () => {
		test("returns missing-credentials reason", async () => {
			mockGetAnthropicCredentials.mockReturnValue(null);
			mockGetOpenAICredentials.mockReturnValue(null);

			const result = await attemptWorkspaceAutoRenameFromPrompt({
				workspaceId: "ws-1",
				prompt: "Fix the login bug",
			});

			expect(result).toMatchObject({
				status: "skipped",
				reason: "missing-credentials",
			});
		});

		// Regression test for issue #2289:
		// When no credentials are configured, the user should NOT see a toast warning.
		// Missing credentials is an expected state, not an error.
		test("does not emit a warning when credentials are missing", async () => {
			mockGetAnthropicCredentials.mockReturnValue(null);
			mockGetOpenAICredentials.mockReturnValue(null);

			const result = await attemptWorkspaceAutoRenameFromPrompt({
				workspaceId: "ws-1",
				prompt: "Fix the login bug",
			});

			expect(result).toMatchObject({
				status: "skipped",
				reason: "missing-credentials",
			});
			// No warning should be emitted — this is expected behavior, not an error
			expect((result as { warning?: string }).warning).toBeUndefined();
		});
	});

	test("returns empty-prompt when prompt is blank", async () => {
		const result = await attemptWorkspaceAutoRenameFromPrompt({
			workspaceId: "ws-1",
			prompt: "   ",
		});

		expect(result).toEqual({ status: "skipped", reason: "empty-prompt" });
	});

	test("returns empty-prompt when prompt is missing", async () => {
		const result = await attemptWorkspaceAutoRenameFromPrompt({
			workspaceId: "ws-1",
			prompt: null,
		});

		expect(result).toEqual({ status: "skipped", reason: "empty-prompt" });
	});

	test("emits a warning when credentials exist but generation fails", async () => {
		mockGetAnthropicCredentials.mockReturnValue({
			apiKey: "sk-test",
			source: "runtime-env",
			kind: "apiKey",
		});
		mockGetOpenAICredentials.mockReturnValue(null);
		mockGenerateTitleFromMessage.mockRejectedValue(new Error("API error"));

		const result = await attemptWorkspaceAutoRenameFromPrompt({
			workspaceId: "ws-1",
			prompt: "Fix the login bug",
		});

		expect(result).toMatchObject({
			status: "skipped",
			reason: "generation-failed",
		});
		expect((result as { warning?: string }).warning).toBeDefined();
	});
});
