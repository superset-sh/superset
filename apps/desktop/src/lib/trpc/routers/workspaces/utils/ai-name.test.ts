import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const getSmallModelMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown | null>,
);
const generateTitleFromMessageMock = mock(
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

mock.module("@superset/chat/server/shared", () => ({
	getSmallModel: getSmallModelMock,
}));

mock.module("@superset/chat/server/desktop", () => ({
	generateTitleFromMessage: generateTitleFromMessageMock,
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
		getSmallModelMock.mockClear();
		getSmallModelMock.mockResolvedValue(null);
		generateTitleFromMessageMock.mockClear();
		generateTitleFromMessageMock.mockResolvedValue(null);
		selectGetMock.mockReset();
		selectGetMock.mockReturnValue(null);
		updateRunMock.mockReset();
		updateRunMock.mockReturnValue({ changes: 1 });
		localDbMock.select.mockClear();
		localDbMock.update.mockClear();
	});

	it("falls back to a prompt-derived title when no model is available", async () => {
		await expect(
			generateWorkspaceNameFromPrompt("  debug   prod rename failure  "),
		).resolves.toEqual({
			name: "debug prod rename failure",
			usedPromptFallback: true,
			warning:
				"A prompt-based title was used because model naming was unavailable.",
		});
	});

	it("returns the model-generated title when a model is available", async () => {
		getSmallModelMock.mockResolvedValueOnce({ id: "test-model" });
		generateTitleFromMessageMock.mockResolvedValueOnce("Checking In");

		await expect(
			generateWorkspaceNameFromPrompt("hey boss how are you"),
		).resolves.toEqual({
			name: "Checking In",
			usedPromptFallback: false,
		});
		expect(generateTitleFromMessageMock).toHaveBeenCalledWith({
			message: "hey boss how are you",
			agentModel: { id: "test-model" },
			agentId: "workspace-namer",
			agentName: "Workspace Namer",
			instructions:
				"You generate concise workspace titles. 20 characters or less. Return ONLY the title, nothing else.",
			tracingContext: { surface: "workspace-auto-name" },
		});
	});

	it("preserves empty-string model results instead of forcing fallback", async () => {
		getSmallModelMock.mockResolvedValueOnce({ id: "test-model" });
		generateTitleFromMessageMock.mockResolvedValueOnce("");

		await expect(
			generateWorkspaceNameFromPrompt("name this workspace"),
		).resolves.toEqual({
			name: "",
			usedPromptFallback: false,
		});
	});

	it("falls back when generation throws", async () => {
		getSmallModelMock.mockResolvedValueOnce({ id: "test-model" });
		generateTitleFromMessageMock.mockRejectedValueOnce(new Error("boom"));

		await expect(
			generateWorkspaceNameFromPrompt("rename this workspace from prompt"),
		).resolves.toEqual({
			name: "rename this workspace from prompt",
			usedPromptFallback: true,
			warning:
				"A prompt-based title was used because model naming was unavailable.",
		});
	});
});

afterAll(() => {
	mock.restore();
});

describe("attemptWorkspaceAutoRenameFromPrompt", () => {
	beforeEach(() => {
		getSmallModelMock.mockClear();
		getSmallModelMock.mockResolvedValue(null);
		generateTitleFromMessageMock.mockClear();
		generateTitleFromMessageMock.mockResolvedValue(null);
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
		expect(getSmallModelMock).not.toHaveBeenCalled();
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
		getSmallModelMock.mockResolvedValueOnce({ id: "test-model" });
		generateTitleFromMessageMock.mockResolvedValueOnce("");

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
