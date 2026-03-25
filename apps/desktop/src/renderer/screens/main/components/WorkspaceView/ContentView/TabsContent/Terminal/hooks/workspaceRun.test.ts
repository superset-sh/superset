import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createNextPaneWorkspaceRunState } from "renderer/stores/tabs/workspace-run-state";
import { recoverWorkspaceRunPaneWithDeps } from "./workspaceRunRecovery";

const mockGetSession = mock();
const mockSetPaneWorkspaceRunState = mock();

describe("recoverWorkspaceRunPane", () => {
	beforeEach(() => {
		mockGetSession.mockReset();
		mockSetPaneWorkspaceRunState.mockReset();
	});

	it("reattaches panes stopped by user when the shell is still alive", async () => {
		mockGetSession.mockResolvedValueOnce({
			isAlive: true,
			cwd: "/tmp/ws-1",
			lastActive: Date.now(),
		});

		const xterm = { writeln: mock(() => {}) };
		const done = mock(() => {});
		const startAttach = mock(() => {});
		const setExitStatus = mock(() => {});
		const isExitedRef = { current: false };
		const wasKilledByUserRef = { current: false };
		const isStreamReadyRef = { current: false };

		const handled = await recoverWorkspaceRunPaneWithDeps(
			{
				paneId: "pane-1",
				workspaceRun: {
					workspaceId: "ws-1",
					state: "stopped-by-user",
				},
				isNewWorkspaceRun: false,
				xterm,
				shouldAbort: () => false,
				startAttach,
				done,
				isExitedRef,
				wasKilledByUserRef,
				isStreamReadyRef,
				setExitStatus,
			},
			{
				getSession: mockGetSession,
				setPaneWorkspaceRunState: mockSetPaneWorkspaceRunState,
			},
		);

		expect(handled).toBe(true);
		expect(mockGetSession).toHaveBeenCalledWith("pane-1");
		expect(startAttach).toHaveBeenCalled();
		expect(mockSetPaneWorkspaceRunState).not.toHaveBeenCalled();
		expect(isExitedRef.current).toBe(false);
		expect(wasKilledByUserRef.current).toBe(false);
		expect(isStreamReadyRef.current).toBe(false);
		expect(setExitStatus).not.toHaveBeenCalled();
		expect(xterm.writeln).not.toHaveBeenCalled();
		expect(done).not.toHaveBeenCalled();
	});

	it("shows exited state for panes stopped by user after the shell has exited", async () => {
		mockGetSession.mockResolvedValueOnce(null);

		const xterm = { writeln: mock(() => {}) };
		const done = mock(() => {});
		const startAttach = mock(() => {});
		const setExitStatus = mock(() => {});
		const isExitedRef = { current: false };
		const wasKilledByUserRef = { current: false };
		const isStreamReadyRef = { current: false };

		const handled = await recoverWorkspaceRunPaneWithDeps(
			{
				paneId: "pane-1b",
				workspaceRun: {
					workspaceId: "ws-1b",
					state: "stopped-by-user",
				},
				isNewWorkspaceRun: false,
				xterm,
				shouldAbort: () => false,
				startAttach,
				done,
				isExitedRef,
				wasKilledByUserRef,
				isStreamReadyRef,
				setExitStatus,
			},
			{
				getSession: mockGetSession,
				setPaneWorkspaceRunState: mockSetPaneWorkspaceRunState,
			},
		);

		expect(handled).toBe(true);
		expect(mockGetSession).toHaveBeenCalledWith("pane-1b");
		expect(startAttach).not.toHaveBeenCalled();
		expect(mockSetPaneWorkspaceRunState).toHaveBeenCalledWith(
			"pane-1b",
			"stopped-by-user",
		);
		expect(isExitedRef.current).toBe(true);
		expect(wasKilledByUserRef.current).toBe(true);
		expect(isStreamReadyRef.current).toBe(true);
		expect(setExitStatus).toHaveBeenCalledWith("killed");
		expect(xterm.writeln).toHaveBeenCalledWith("\r\n[Session killed]");
		expect(xterm.writeln).toHaveBeenCalledWith("[Press any key to restart]");
		expect(done).toHaveBeenCalled();
	});

	it("falls back to attach when session inspection fails for running panes", async () => {
		mockGetSession.mockRejectedValueOnce(new Error("transport down"));

		const xterm = { writeln: mock(() => {}) };
		const done = mock(() => {});
		const startAttach = mock(() => {});
		const setExitStatus = mock(() => {});
		const isExitedRef = { current: false };
		const wasKilledByUserRef = { current: false };
		const isStreamReadyRef = { current: false };

		const handled = await recoverWorkspaceRunPaneWithDeps(
			{
				paneId: "pane-2",
				workspaceRun: {
					workspaceId: "ws-2",
					state: "running",
				},
				isNewWorkspaceRun: false,
				xterm,
				shouldAbort: () => false,
				startAttach,
				done,
				isExitedRef,
				wasKilledByUserRef,
				isStreamReadyRef,
				setExitStatus,
			},
			{
				getSession: mockGetSession,
				setPaneWorkspaceRunState: mockSetPaneWorkspaceRunState,
			},
		);

		expect(handled).toBe(true);
		expect(startAttach).toHaveBeenCalled();
		expect(mockSetPaneWorkspaceRunState).not.toHaveBeenCalled();
		expect(xterm.writeln).not.toHaveBeenCalled();
		expect(done).not.toHaveBeenCalled();
		expect(setExitStatus).not.toHaveBeenCalled();
	});

	it("falls back to attach when session inspection fails for stopped panes", async () => {
		mockGetSession.mockRejectedValueOnce(new Error("transport down"));

		const xterm = { writeln: mock(() => {}) };
		const done = mock(() => {});
		const startAttach = mock(() => {});
		const setExitStatus = mock(() => {});
		const isExitedRef = { current: false };
		const wasKilledByUserRef = { current: false };
		const isStreamReadyRef = { current: false };

		const handled = await recoverWorkspaceRunPaneWithDeps(
			{
				paneId: "pane-2b",
				workspaceRun: {
					workspaceId: "ws-2b",
					state: "stopped-by-user",
				},
				isNewWorkspaceRun: false,
				xterm,
				shouldAbort: () => false,
				startAttach,
				done,
				isExitedRef,
				wasKilledByUserRef,
				isStreamReadyRef,
				setExitStatus,
			},
			{
				getSession: mockGetSession,
				setPaneWorkspaceRunState: mockSetPaneWorkspaceRunState,
			},
		);

		expect(handled).toBe(true);
		expect(startAttach).toHaveBeenCalled();
		expect(mockSetPaneWorkspaceRunState).not.toHaveBeenCalled();
		expect(xterm.writeln).not.toHaveBeenCalled();
		expect(done).not.toHaveBeenCalled();
		expect(setExitStatus).not.toHaveBeenCalled();
	});

	it("restarts running panes when their session is gone and a restart command exists", async () => {
		mockGetSession.mockResolvedValueOnce(null);

		const xterm = { writeln: mock(() => {}) };
		const done = mock(() => {});
		const startAttach = mock(() => {});
		const setExitStatus = mock(() => {});
		const isExitedRef = { current: false };
		const wasKilledByUserRef = { current: false };
		const isStreamReadyRef = { current: false };

		const handled = await recoverWorkspaceRunPaneWithDeps(
			{
				paneId: "pane-2c",
				workspaceRun: {
					workspaceId: "ws-2c",
					state: "running",
					command: "bun run dev",
				},
				isNewWorkspaceRun: false,
				xterm,
				shouldAbort: () => false,
				startAttach,
				done,
				isExitedRef,
				wasKilledByUserRef,
				isStreamReadyRef,
				setExitStatus,
				restartCommand: "bun run dev",
			},
			{
				getSession: mockGetSession,
				setPaneWorkspaceRunState: mockSetPaneWorkspaceRunState,
			},
		);

		expect(handled).toBe(true);
		expect(startAttach).toHaveBeenCalledWith("bun run dev");
		expect(mockSetPaneWorkspaceRunState).toHaveBeenCalledWith(
			"pane-2c",
			"running",
		);
		expect(xterm.writeln).not.toHaveBeenCalled();
		expect(done).not.toHaveBeenCalled();
		expect(setExitStatus).not.toHaveBeenCalled();
	});

	it("preserves the stored run command when updating workspace-run state", () => {
		const updatedWorkspaceRun = createNextPaneWorkspaceRunState(
			{
				workspaceId: "ws-3",
				state: "running",
				command: "bun run dev",
			},
			"stopped-by-exit",
		);

		expect(updatedWorkspaceRun).toEqual({
			workspaceId: "ws-3",
			state: "stopped-by-exit",
			command: "bun run dev",
		});
	});
});
