import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const calls = {
	getDiffPatch: [] as unknown[],
	getDiff: [] as unknown[],
	getBaseBranch: [] as unknown[],
	listCommits: [] as unknown[],
};
let onGitChanged: ((payload?: { paths?: string[] }) => void) | undefined;

const invalidate = (key: keyof typeof calls) => (input: unknown) => {
	calls[key].push(input);
	return Promise.resolve();
};

mock.module("@superset/workspace-client", () => ({
	workspaceTrpc: {
		useUtils: () => ({
			git: {
				getDiffPatch: { invalidate: invalidate("getDiffPatch") },
				getDiff: { invalidate: invalidate("getDiff") },
				getBaseBranch: { invalidate: invalidate("getBaseBranch") },
				listCommits: { invalidate: invalidate("listCommits") },
			},
		}),
		git: {
			getBaseBranch: { useQuery: () => ({ data: { baseBranch: "main" } }) },
			getStatus: {
				useQuery: () => ({ data: undefined, refetch: () => Promise.resolve() }),
			},
		},
	},
}));

mock.module("../useWorkspaceEvent", () => ({
	useWorkspaceEvent: (
		_event: string,
		_workspaceId: string,
		callback: (payload?: { paths?: string[] }) => void,
	) => {
		onGitChanged = callback;
	},
}));

const { act, cleanup, render } = await import("@testing-library/react");
const { useGitStatus } = await import("./useGitStatus");

function Probe() {
	useGitStatus("workspace-1");
	return null;
}

beforeEach(() => {
	for (const entries of Object.values(calls)) entries.length = 0;
	onGitChanged = undefined;
});

afterAll(async () => {
	cleanup();
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("useGitStatus git:changed invalidation", () => {
	test("invalidates commit lists after a broad git metadata change", async () => {
		render(<Probe />);
		await act(async () => onGitChanged?.({}));
		expect(calls.listCommits).toEqual([{ workspaceId: "workspace-1" }]);
	});

	test("does not invalidate commit lists for path-scoped worktree edits", async () => {
		render(<Probe />);
		await act(async () => onGitChanged?.({ paths: ["src/file.ts"] }));
		expect(calls.listCommits).toEqual([]);
	});
});
