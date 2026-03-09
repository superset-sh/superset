import { describe, expect, it, mock } from "bun:test";

mock.module("lib/ai/call-small-model", () => ({
	callSmallModel: mock(async () => ({
		result: null,
		attempts: [],
	})),
}));

mock.module("@superset/chat/host", () => ({
	generateTitleFromMessage: mock(async () => null),
}));

mock.module("main/lib/local-db", () => ({
	localDb: {},
}));

mock.module("@superset/local-db", () => ({
	workspaces: {},
}));

const { generateWorkspaceNameFromPrompt } = await import("./ai-name");

describe("generateWorkspaceNameFromPrompt", () => {
	it("falls back to a prompt-derived title when no providers are available", async () => {
		await expect(
			generateWorkspaceNameFromPrompt("  debug   prod rename failure  "),
		).resolves.toBe("debug prod rename failure");
	});
});
