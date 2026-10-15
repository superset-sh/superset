import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const refreshPullRequest = mock(
	async (_input: { workspaceIds: string[] }) => {},
);
const invalidatePullRequest = mock(
	async (_input: { workspaceId: string }) => {},
);
const invalidateBranchSync = mock(
	async (_input: { workspaceId: string }) => {},
);
const utils = {
	git: {
		getPullRequest: { invalidate: invalidatePullRequest },
		getBranchSyncStatus: { invalidate: invalidateBranchSync },
	},
};

mock.module("@superset/workspace-client", () => ({
	workspaceTrpc: {
		useUtils: () => utils,
		pullRequests: {
			refreshByWorkspaces: {
				useMutation: () => ({ mutateAsync: refreshPullRequest }),
			},
		},
		git: {
			getPullRequest: {
				useQuery: () => ({
					data: null,
					error: null,
					isLoading: false,
				}),
			},
			getBranchSyncStatus: {
				useQuery: () => ({
					data: null,
					error: null,
					isLoading: false,
				}),
			},
		},
	},
}));

const _React = await import("react");
const { act, cleanup, render, waitFor } = await import(
	"@testing-library/react"
);
const { usePRFlowState } = await import("./usePRFlowState");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

beforeEach(() => {
	refreshPullRequest.mockClear();
	invalidatePullRequest.mockClear();
	invalidateBranchSync.mockClear();
});

test("refreshes provider state on mount and retry without duplicating focus refreshes", async () => {
	let retry: (() => void) | undefined;
	function Probe() {
		retry = usePRFlowState("workspace-1").onRetry;
		return null;
	}

	const view = render(<Probe />);
	await waitFor(() => expect(refreshPullRequest).toHaveBeenCalledTimes(1));
	expect(refreshPullRequest).toHaveBeenLastCalledWith({
		workspaceIds: ["workspace-1"],
	});

	act(() => window.dispatchEvent(new Event("focus")));
	await Promise.resolve();
	expect(refreshPullRequest).toHaveBeenCalledTimes(1);

	await act(async () => retry?.());
	await waitFor(() => expect(refreshPullRequest).toHaveBeenCalledTimes(2));
	expect(invalidatePullRequest).toHaveBeenCalledTimes(2);
	expect(invalidateBranchSync).toHaveBeenCalledTimes(2);

	view.unmount();
	act(() => window.dispatchEvent(new Event("focus")));
	await Promise.resolve();
	expect(refreshPullRequest).toHaveBeenCalledTimes(2);
});

test("keeps refresh cooldown state isolated when switching workspaces", async () => {
	function Probe({ workspaceId }: { workspaceId: string }) {
		usePRFlowState(workspaceId);
		return null;
	}

	const view = render(<Probe workspaceId="workspace-a" />);
	await waitFor(() => expect(refreshPullRequest).toHaveBeenCalledTimes(1));

	view.rerender(<Probe workspaceId="workspace-b" />);
	await waitFor(() => expect(refreshPullRequest).toHaveBeenCalledTimes(2));
	expect(refreshPullRequest).toHaveBeenLastCalledWith({
		workspaceIds: ["workspace-b"],
	});

	view.unmount();
});
