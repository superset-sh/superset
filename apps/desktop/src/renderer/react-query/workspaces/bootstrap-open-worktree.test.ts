import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { bootstrapOpenWorktree } from "./bootstrap-open-worktree";

describe("bootstrapOpenWorktree", () => {
	const originalConsoleError = console.error;

	beforeEach(() => {
		console.error = mock(() => undefined);
	});

	afterEach(() => {
		console.error = originalConsoleError;
	});

	it("continues to navigation when createOrAttach fails", async () => {
		const navigateToWorkspaceById = mock(() => {});
		const writeToTerminal = mock(async () => ({}));

		await bootstrapOpenWorktree({
			data: {
				workspace: { id: "ws-1" },
				initialCommands: ["echo setup"],
			},
			invalidateWorkspaces: async () => ({}),
			invalidateRecentProjects: async () => ({}),
			addTab: () => ({ tabId: "tab-1", paneId: "pane-1" }),
			setTabAutoTitle: mock(() => {}),
			createOrAttach: async () => {
				throw new Error("attach failed");
			},
			writeToTerminal,
			navigateToWorkspaceById,
			logPrefix: "test",
		});

		expect(writeToTerminal).not.toHaveBeenCalled();
		expect(navigateToWorkspaceById).toHaveBeenCalledWith("ws-1");
	});

	it("continues to navigation when write fails", async () => {
		const navigateToWorkspaceById = mock(() => {});

		await bootstrapOpenWorktree({
			data: {
				workspace: { id: "ws-1" },
				initialCommands: ["echo setup"],
			},
			invalidateWorkspaces: async () => ({}),
			invalidateRecentProjects: async () => ({}),
			addTab: () => ({ tabId: "tab-1", paneId: "pane-1" }),
			setTabAutoTitle: mock(() => {}),
			createOrAttach: async () => ({}),
			writeToTerminal: async () => {
				throw new Error("write failed");
			},
			navigateToWorkspaceById,
			logPrefix: "test",
		});

		expect(navigateToWorkspaceById).toHaveBeenCalledWith("ws-1");
	});
});
