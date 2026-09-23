import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface FakeRepo {
	folder: string;
	path: string;
	projectId: string;
	repository: string | null;
	branch: string;
	base: string | null;
}

const PRIMARY: FakeRepo = {
	folder: "api",
	path: "/w/api",
	projectId: "p1",
	repository: "acme/api",
	branch: "feature",
	base: "main",
};
const SECONDARY: FakeRepo = {
	folder: "web",
	path: "/w/web",
	projectId: "p2",
	repository: "acme/web",
	branch: "feature",
	base: "main",
};

let workspaceData: { worktreePath: string; repos: FakeRepo[] } = {
	worktreePath: "/w/api",
	repos: [PRIMARY],
};

mock.module("@superset/workspace-client", () => ({
	workspaceTrpc: {
		workspace: {
			get: { useQuery: () => ({ data: workspaceData, isLoading: false }) },
		},
	},
}));

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useWorkspaceRepos } = await import("./useWorkspaceRepos");
const { useSelectedRepoStore } = await import("../../state/selectedRepoStore");

beforeEach(() => {
	useSelectedRepoStore.setState({ folders: {} });
	workspaceData = { worktreePath: "/w/api", repos: [PRIMARY] };
});
afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("useWorkspaceRepos", () => {
	test("a single-repo workspace keeps the plain worktree and an empty repo arg", () => {
		const { result } = renderHook(() => useWorkspaceRepos("ws-1"));

		expect(result.current.hasMultipleRepos).toBe(false);
		expect(result.current.rootPath).toBe("/w/api");
		expect(result.current.repoArg).toEqual({});
	});

	test("switching folders re-roots the tree and retargets git reads", () => {
		workspaceData = {
			worktreePath: "/w/api",
			repos: [PRIMARY, SECONDARY],
		};
		const { result } = renderHook(() => useWorkspaceRepos("ws-1"));

		expect(result.current.rootPath).toBe("/w/api");
		expect(result.current.repoArg).toEqual({ repo: "api" });

		act(() => {
			result.current.selectFolder("web");
		});

		expect(result.current.rootPath).toBe("/w/web");
		expect(result.current.repoArg).toEqual({ repo: "web" });
	});

	test("a stored folder that no longer exists falls back to the primary", () => {
		useSelectedRepoStore.setState({ folders: { "ws-1": "removed" } });
		workspaceData = {
			worktreePath: "/w/api",
			repos: [PRIMARY, SECONDARY],
		};
		const { result } = renderHook(() => useWorkspaceRepos("ws-1"));

		expect(result.current.selected?.folder).toBe("api");
		expect(result.current.rootPath).toBe("/w/api");
		expect(result.current.repoArg).toEqual({ repo: "api" });
	});

	test("selections are scoped to their own workspace", () => {
		workspaceData = {
			worktreePath: "/w/api",
			repos: [PRIMARY, SECONDARY],
		};
		const first = renderHook(() => useWorkspaceRepos("ws-1"));
		act(() => {
			first.result.current.selectFolder("web");
		});
		const second = renderHook(() => useWorkspaceRepos("ws-2"));

		expect(first.result.current.selected?.folder).toBe("web");
		expect(second.result.current.selected?.folder).toBe("api");
	});
});
