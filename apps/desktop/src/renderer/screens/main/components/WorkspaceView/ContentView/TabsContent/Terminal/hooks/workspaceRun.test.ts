import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const mockGetSessionQuery = mock();

const storeState = {
	panes: {} as Record<
		string,
		{
			workspaceRun?: {
				workspaceId: string;
				state: "running" | "stopped-by-user" | "stopped-by-exit";
				command?: string;
			};
		}
	>,
	setPaneWorkspaceRun: mock(
		(
			paneId: string,
			workspaceRun: {
				workspaceId: string;
				state: "running" | "stopped-by-user" | "stopped-by-exit";
				command?: string;
			} | null,
		) => {
			if (!storeState.panes[paneId]) {
				storeState.panes[paneId] = {};
			}
			storeState.panes[paneId].workspaceRun = workspaceRun ?? undefined;
		},
	),
};

mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: {
		terminal: {
			getSession: {
				query: mockGetSessionQuery,
			},
		},
	},
}));

mock.module("renderer/stores/tabs/store", () => ({
	useTabsStore: {
		getState: () => storeState,
	},
}));

const { recoverWorkspaceRunPane, setPaneWorkspaceRunState } = await import(
	"./workspaceRun"
);

describe("recoverWorkspaceRunPane", () => {
	beforeEach(() => {
		mockGetSessionQuery.mockReset();
		storeState.panes = {};
		storeState.setPaneWorkspaceRun.mockClear();
	});

	afterAll(() => {
		mock.restore();
	});

	it("reattaches panes stopped by user when the shell is still alive", async () => {
		storeState.panes["pane-1"] = {
			workspaceRun: {
				workspaceId: "ws-1",
				state: "stopped-by-user",
			},
		};
		mockGetSessionQuery.mockResolvedValueOnce({
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
		const workspaceRun = storeState.panes["pane-1"]?.workspaceRun;
		if (!workspaceRun) {
			throw new Error("Expected pane-1 workspaceRun to exist");
		}

		const handled = await recoverWorkspaceRunPane({
			paneId: "pane-1",
			workspaceRun,
			isNewWorkspaceRun: false,
			xterm,
			shouldAbort: () => false,
			startAttach,
			done,
			isExitedRef,
			wasKilledByUserRef,
			isStreamReadyRef,
			setExitStatus,
		});

		expect(handled).toBe(true);
		expect(mockGetSessionQuery).toHaveBeenCalledWith("pane-1");
		expect(startAttach).toHaveBeenCalled();
		expect(isExitedRef.current).toBe(false);
		expect(wasKilledByUserRef.current).toBe(false);
		expect(isStreamReadyRef.current).toBe(false);
		expect(setExitStatus).not.toHaveBeenCalled();
		expect(xterm.writeln).not.toHaveBeenCalled();
		expect(done).not.toHaveBeenCalled();
	});

	it("shows exited state for panes stopped by user after the shell has exited", async () => {
		storeState.panes["pane-1b"] = {
			workspaceRun: {
				workspaceId: "ws-1b",
				state: "stopped-by-user",
			},
		};
		mockGetSessionQuery.mockResolvedValueOnce(null);

		const xterm = { writeln: mock(() => {}) };
		const done = mock(() => {});
		const startAttach = mock(() => {});
		const setExitStatus = mock(() => {});
		const isExitedRef = { current: false };
		const wasKilledByUserRef = { current: false };
		const isStreamReadyRef = { current: false };
		const workspaceRun = storeState.panes["pane-1b"]?.workspaceRun;
		if (!workspaceRun) {
			throw new Error("Expected pane-1b workspaceRun to exist");
		}

		const handled = await recoverWorkspaceRunPane({
			paneId: "pane-1b",
			workspaceRun,
			isNewWorkspaceRun: false,
			xterm,
			shouldAbort: () => false,
			startAttach,
			done,
			isExitedRef,
			wasKilledByUserRef,
			isStreamReadyRef,
			setExitStatus,
		});

		expect(handled).toBe(true);
		expect(mockGetSessionQuery).toHaveBeenCalledWith("pane-1b");
		expect(startAttach).not.toHaveBeenCalled();
		expect(isExitedRef.current).toBe(true);
		expect(wasKilledByUserRef.current).toBe(true);
		expect(isStreamReadyRef.current).toBe(true);
		expect(setExitStatus).toHaveBeenCalledWith("killed");
		expect(xterm.writeln).toHaveBeenCalledWith("\r\n[Session killed]");
		expect(xterm.writeln).toHaveBeenCalledWith("[Press any key to restart]");
		expect(done).toHaveBeenCalled();
	});

	it("falls back to attach when session inspection fails for running panes", async () => {
		storeState.panes["pane-2"] = {
			workspaceRun: {
				workspaceId: "ws-2",
				state: "running",
			},
		};
		mockGetSessionQuery.mockRejectedValueOnce(new Error("transport down"));

		const xterm = { writeln: mock(() => {}) };
		const done = mock(() => {});
		const startAttach = mock(() => {});
		const setExitStatus = mock(() => {});
		const isExitedRef = { current: false };
		const wasKilledByUserRef = { current: false };
		const isStreamReadyRef = { current: false };
		const workspaceRun = storeState.panes["pane-2"]?.workspaceRun;
		if (!workspaceRun) {
			throw new Error("Expected pane-2 workspaceRun to exist");
		}

		const handled = await recoverWorkspaceRunPane({
			paneId: "pane-2",
			workspaceRun,
			isNewWorkspaceRun: false,
			xterm,
			shouldAbort: () => false,
			startAttach,
			done,
			isExitedRef,
			wasKilledByUserRef,
			isStreamReadyRef,
			setExitStatus,
		});

		expect(handled).toBe(true);
		expect(startAttach).toHaveBeenCalled();
		expect(xterm.writeln).not.toHaveBeenCalled();
		expect(done).not.toHaveBeenCalled();
		expect(setExitStatus).not.toHaveBeenCalled();
	});

	it("falls back to attach when session inspection fails for stopped panes", async () => {
		storeState.panes["pane-2b"] = {
			workspaceRun: {
				workspaceId: "ws-2b",
				state: "stopped-by-user",
			},
		};
		mockGetSessionQuery.mockRejectedValueOnce(new Error("transport down"));

		const xterm = { writeln: mock(() => {}) };
		const done = mock(() => {});
		const startAttach = mock(() => {});
		const setExitStatus = mock(() => {});
		const isExitedRef = { current: false };
		const wasKilledByUserRef = { current: false };
		const isStreamReadyRef = { current: false };
		const workspaceRun = storeState.panes["pane-2b"]?.workspaceRun;
		if (!workspaceRun) {
			throw new Error("Expected pane-2b workspaceRun to exist");
		}

		const handled = await recoverWorkspaceRunPane({
			paneId: "pane-2b",
			workspaceRun,
			isNewWorkspaceRun: false,
			xterm,
			shouldAbort: () => false,
			startAttach,
			done,
			isExitedRef,
			wasKilledByUserRef,
			isStreamReadyRef,
			setExitStatus,
		});

		expect(handled).toBe(true);
		expect(startAttach).toHaveBeenCalled();
		expect(xterm.writeln).not.toHaveBeenCalled();
		expect(done).not.toHaveBeenCalled();
		expect(setExitStatus).not.toHaveBeenCalled();
	});

	it("restarts running panes when their session is gone and a restart command exists", async () => {
		storeState.panes["pane-2c"] = {
			workspaceRun: {
				workspaceId: "ws-2c",
				state: "running",
				command: "bun run dev",
			},
		};
		mockGetSessionQuery.mockResolvedValueOnce(null);

		const xterm = { writeln: mock(() => {}) };
		const done = mock(() => {});
		const startAttach = mock(() => {});
		const setExitStatus = mock(() => {});
		const isExitedRef = { current: false };
		const wasKilledByUserRef = { current: false };
		const isStreamReadyRef = { current: false };
		const workspaceRun = storeState.panes["pane-2c"]?.workspaceRun;
		if (!workspaceRun) {
			throw new Error("Expected pane-2c workspaceRun to exist");
		}

		const handled = await recoverWorkspaceRunPane({
			paneId: "pane-2c",
			workspaceRun,
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
		});

		expect(handled).toBe(true);
		expect(startAttach).toHaveBeenCalledWith("bun run dev");
		expect(xterm.writeln).not.toHaveBeenCalled();
		expect(done).not.toHaveBeenCalled();
		expect(setExitStatus).not.toHaveBeenCalled();
		expect(storeState.panes["pane-2c"]?.workspaceRun).toEqual({
			workspaceId: "ws-2c",
			state: "running",
			command: "bun run dev",
		});
	});

	it("preserves the stored run command when updating workspace-run state", () => {
		storeState.panes["pane-3"] = {
			workspaceRun: {
				workspaceId: "ws-3",
				state: "running",
				command: "bun run dev",
			},
		};

		const updatedWorkspaceRun = setPaneWorkspaceRunState(
			"pane-3",
			"stopped-by-exit",
		);

		expect(updatedWorkspaceRun).toEqual({
			workspaceId: "ws-3",
			state: "stopped-by-exit",
			command: "bun run dev",
		});
		expect(storeState.setPaneWorkspaceRun).toHaveBeenCalledWith("pane-3", {
			workspaceId: "ws-3",
			state: "stopped-by-exit",
			command: "bun run dev",
		});
	});
});
