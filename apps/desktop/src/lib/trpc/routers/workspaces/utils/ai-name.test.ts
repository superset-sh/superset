import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { SmallModelAttempt } from "lib/ai/call-small-model";

const callSmallModelMock = mock((async () => ({
	result: null,
	attempts: [],
})) as () => Promise<{
	result: string | null;
	attempts: SmallModelAttempt[];
}>);

mock.module("lib/ai/call-small-model", () => ({
	callSmallModel: callSmallModelMock,
}));

mock.module("@superset/chat/host", () => ({
	__esModule: true,
	generateTitleFromMessage: mock(async () => null),
}));

mock.module("drizzle-orm", () => ({
	and: mock(() => null),
	eq: mock(() => null),
	isNull: mock(() => null),
}));

mock.module("main/lib/local-db", () => ({
	localDb: {},
}));

mock.module("@superset/local-db", () => ({
	workspaces: {},
}));

const { generateWorkspaceNameFromPrompt } = await import("./ai-name");

describe("generateWorkspaceNameFromPrompt", () => {
	beforeEach(() => {
		callSmallModelMock.mockImplementation(async () => ({
			result: null,
			attempts: [],
		}));
	});

	it("falls back to a prompt-derived title when no providers are available", async () => {
		await expect(
			generateWorkspaceNameFromPrompt("  debug   prod rename failure  "),
		).resolves.toEqual({
			name: "debug prod rename failure",
			usedPromptFallback: true,
			warning:
				"No model account was connected, so a prompt-based title was used.",
		});
	});

	it("uses the last relevant provider issue in the fallback warning", async () => {
		callSmallModelMock.mockImplementation(async () => ({
			result: null,
			attempts: [
				{
					providerId: "anthropic",
					providerName: "Anthropic",
					outcome: "failed",
					issue: {
						code: "unknown_error",
						message: "Anthropic could not complete this request",
					},
				},
				{
					providerId: "openai",
					providerName: "OpenAI",
					outcome: "failed",
					issue: {
						code: "missing_scope",
						message: "OpenAI needs permission model.request",
					},
				},
			],
		}));

		await expect(
			generateWorkspaceNameFromPrompt("rename this workspace from prompt"),
		).resolves.toEqual({
			name: "rename this workspace from prompt",
			usedPromptFallback: true,
			warning:
				"OpenAI needs permission model.request, so a prompt-based title was used.",
		});
	});
});
