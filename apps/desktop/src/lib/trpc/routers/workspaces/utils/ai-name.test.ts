import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
	attemptWorkspaceAutoRenameFromPrompt,
	generateWorkspaceNameFromPrompt,
} from "./ai-name";

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

const selectGetMock = mock((): SelectedWorkspace => null);
const updateRunMock = mock(() => ({ changes: 1 }));
const fakeDb = {
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

const db = fakeDb as unknown as Parameters<
	typeof attemptWorkspaceAutoRenameFromPrompt
>[0]["db"];

describe("generateWorkspaceNameFromPrompt", () => {
	it("derives a title from the prompt text", () => {
		expect(
			generateWorkspaceNameFromPrompt("  debug   prod rename failure  "),
		).toBe("debug prod rename failure");
	});

	it("returns null when the prompt has no title in it", () => {
		expect(generateWorkspaceNameFromPrompt("   ")).toBeNull();
	});
});

describe("attemptWorkspaceAutoRenameFromPrompt", () => {
	beforeEach(() => {
		selectGetMock.mockReset();
		selectGetMock.mockReturnValue(null);
		updateRunMock.mockReset();
		updateRunMock.mockReturnValue({ changes: 1 });
		fakeDb.select.mockClear();
		fakeDb.update.mockClear();
	});

	it("renames an unnamed workspace to the derived title", async () => {
		selectGetMock.mockReturnValue({
			id: "workspace-1",
			branch: "main",
			name: "main",
			isUnnamed: true,
			deletingAt: null,
		});

		await expect(
			attemptWorkspaceAutoRenameFromPrompt({
				workspaceId: "workspace-1",
				prompt: "  fix the   login redirect  ",
				db,
			}),
		).resolves.toEqual({
			status: "renamed",
			name: "fix the login redirect",
		});
		expect(fakeDb.update).toHaveBeenCalled();
	});

	it("skips already named workspaces before deriving anything", async () => {
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
				db,
			}),
		).resolves.toEqual({
			status: "skipped",
			reason: "workspace-named",
		});
		expect(fakeDb.update).not.toHaveBeenCalled();
	});

	it("skips a workspace that is being deleted", async () => {
		selectGetMock.mockReturnValue({
			id: "workspace-1",
			branch: "main",
			name: "main",
			isUnnamed: true,
			deletingAt: 1,
		});

		await expect(
			attemptWorkspaceAutoRenameFromPrompt({
				workspaceId: "workspace-1",
				prompt: "rename me",
				db,
			}),
		).resolves.toEqual({
			status: "skipped",
			reason: "workspace-deleting",
		});
		expect(fakeDb.update).not.toHaveBeenCalled();
	});

	it("skips an empty prompt without touching the database", async () => {
		await expect(
			attemptWorkspaceAutoRenameFromPrompt({
				workspaceId: "workspace-1",
				prompt: "   ",
				db,
			}),
		).resolves.toEqual({
			status: "skipped",
			reason: "empty-prompt",
		});
		expect(fakeDb.select).not.toHaveBeenCalled();
	});
});
