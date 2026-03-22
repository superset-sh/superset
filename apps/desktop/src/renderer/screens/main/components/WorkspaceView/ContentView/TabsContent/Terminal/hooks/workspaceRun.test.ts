import { beforeEach, describe, expect, it, mock } from "bun:test";

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

mock.module("renderer/stores/tabs/store", () => ({
	useTabsStore: {
		getState: () => storeState,
	},
}));

const { setPaneWorkspaceRunState } = await import("./workspaceRun");

describe("workspaceRun helpers", () => {
	beforeEach(() => {
		storeState.panes = {};
		storeState.setPaneWorkspaceRun.mockClear();
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
