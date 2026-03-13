import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { SmallModelAttempt } from "lib/ai/call-small-model";

const callSmallModelMock = mock((async () => ({
	result: null,
	attempts: [],
})) as (...args: unknown[]) => Promise<{
	result: string | null;
	attempts: SmallModelAttempt[];
}>);
const generateTitleFromMessageMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<string | null>,
);
const generateTitleFromMessageWithStreamingModelMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<string | null>,
);

type SelectedWorkspace =
	| {
			id: string;
			branch: string;
			name: string;
			isUnnamed: boolean;
			deletingAt: number | null;
	  }
	| {
			branch: string;
			name: string;
			isUnnamed: boolean;
			deletingAt: number | null;
	  }
	| null;

mock.module("lib/ai/call-small-model", () => ({
	callSmallModel: callSmallModelMock,
}));

mock.module("@superset/chat/host", () => ({
	__esModule: true,
	generateTitleFromMessage: generateTitleFromMessageMock,
	generateTitleFromMessageWithStreamingModel:
		generateTitleFromMessageWithStreamingModelMock,
}));

mock.module("drizzle-orm", () => ({
	and: mock(() => null),
	eq: mock(() => null),
	isNull: mock(() => null),
}));

const selectGetMock = mock((): SelectedWorkspace => null);
const updateRunMock = mock(() => ({ changes: 1 }));
const localDbMock = {
	select: mock(() => ({
		from: () => ({
			where: () => ({
				get: selectGetMock,
			}),
		}),
	})),
	update: mock(() => ({
		set: () => ({
			where: () => ({
				run: updateRunMock,
			}),
		}),
	})),
};

mock.module("main/lib/local-db", () => ({
	localDb: localDbMock,
}));

mock.module("@superset/local-db", () => ({
	workspaces: {
		id: "id",
		branch: "branch",
		name: "name",
		isUnnamed: "isUnnamed",
		deletingAt: "deletingAt",
		updatedAt: "updatedAt",
	},
}));

const {
	attemptWorkspaceAutoRenameFromPrompt,
	generateWorkspaceNameFromPrompt,
} = await import("./ai-name");

describe("generateWorkspaceNameFromPrompt", () => {
	beforeEach(() => {
		callSmallModelMock.mockClear();
		callSmallModelMock.mockImplementation(async () => ({
			result: null,
			attempts: [],
		}));
		selectGetMock.mockReset();
		selectGetMock.mockReturnValue(null);
		updateRunMock.mockReset();
		updateRunMock.mockReturnValue({ changes: 1 });
		localDbMock.select.mockClear();
		localDbMock.update.mockClear();
		generateTitleFromMessageMock.mockClear();
		generateTitleFromMessageWithStreamingModelMock.mockClear();
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

	it("uses streaming title generation for OpenAI OAuth naming", async () => {
		generateTitleFromMessageWithStreamingModelMock.mockResolvedValue(
			"Checking In",
		);
		callSmallModelMock.mockImplementationOnce((async ({
			invoke,
		}: {
			invoke: (context: {
				providerId: "openai";
				providerName: string;
				model: { id: string };
				credentials: {
					apiKey: string;
					kind: "oauth";
					source: string;
				};
			}) => Promise<string | null>;
		}) => ({
			result: await invoke({
				providerId: "openai",
				providerName: "OpenAI",
				model: { id: "openai-model" },
				credentials: {
					apiKey: "oauth-token",
					kind: "oauth",
					source: "auth-storage",
				},
			}),
			attempts: [],
		})) as (...args: unknown[]) => Promise<{
			result: string | null;
			attempts: SmallModelAttempt[];
		}>);

		await expect(
			generateWorkspaceNameFromPrompt("hey boss how are you"),
		).resolves.toEqual({
			name: "Checking In",
			usedPromptFallback: false,
		});
		expect(generateTitleFromMessageWithStreamingModelMock).toHaveBeenCalledWith(
			{
				message: "hey boss how are you",
				model: { id: "openai-model" },
				instructions: "You generate concise workspace titles.",
			},
		);
		expect(generateTitleFromMessageMock).not.toHaveBeenCalled();
	});

	it("preserves empty-string model results instead of forcing fallback", async () => {
		callSmallModelMock.mockImplementationOnce(async () => ({
			result: "",
			attempts: [],
		}));

		await expect(
			generateWorkspaceNameFromPrompt("name this workspace"),
		).resolves.toEqual({
			name: "",
			usedPromptFallback: false,
		});
	});
});

describe("attemptWorkspaceAutoRenameFromPrompt", () => {
	beforeEach(() => {
		callSmallModelMock.mockClear();
		callSmallModelMock.mockImplementation(async () => ({
			result: null,
			attempts: [],
		}));
		selectGetMock.mockReset();
		selectGetMock.mockReturnValue(null);
		updateRunMock.mockReset();
		updateRunMock.mockReturnValue({ changes: 1 });
		localDbMock.select.mockClear();
		localDbMock.update.mockClear();
	});

	it("skips already named workspaces before invoking provider naming", async () => {
		selectGetMock.mockReturnValue({
			id: "workspace-1",
			branch: "main",
			name: "Already named",
			isUnnamed: false,
			deletingAt: null,
		});

		await expect(
			attemptWorkspaceAutoRenameFromPrompt({
				workspaceId: "workspace-1",
				prompt: "rename me",
			}),
		).resolves.toEqual({
			status: "skipped",
			reason: "workspace-named",
		});
		expect(callSmallModelMock).not.toHaveBeenCalled();
		expect(localDbMock.update).not.toHaveBeenCalled();
	});

	it("treats empty generated names as an empty-name skip, not a generation failure", async () => {
		selectGetMock.mockReturnValue({
			id: "workspace-1",
			branch: "main",
			name: "main",
			isUnnamed: true,
			deletingAt: null,
		});
		callSmallModelMock.mockImplementationOnce(async () => ({
			result: "",
			attempts: [],
		}));

		await expect(
			attemptWorkspaceAutoRenameFromPrompt({
				workspaceId: "workspace-1",
				prompt: "rename me",
			}),
		).resolves.toEqual({
			status: "skipped",
			reason: "empty-generated-name",
		});
		expect(localDbMock.update).not.toHaveBeenCalled();
	});
});
