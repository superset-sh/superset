import { describe, expect, mock, spyOn, test } from "bun:test";
import { PullRequestRuntimeManager } from "../src/runtime/pull-requests/pull-requests";

describe("PullRequestRuntimeManager branch sync", () => {
	test("persists unborn branches even when HEAD has no commit", async () => {
		const workspace = {
			id: "ws-1",
			projectId: "project-1",
			worktreePath: "/tmp/unborn-worktree",
			branch: "stale-branch",
			headSha: "stale-sha",
			pullRequestId: null,
			createdAt: Date.now(),
		};

		const runMock = mock(() => undefined);
		const whereMock = mock(() => ({ run: runMock }));
		const setMock = mock(() => ({ where: whereMock }));
		const updateMock = mock(() => ({ set: setMock }));
		const allMock = mock(() => [workspace]);
		const db = {
			select: mock(() => ({
				from: mock(() => ({
					all: allMock,
				})),
			})),
			update: updateMock,
		};

		const git = mock(async () => ({
			raw: mock(async (args: string[]) => {
				if (
					args[0] === "symbolic-ref" &&
					args[1] === "--short" &&
					args[2] === "HEAD"
				) {
					return "feature/unborn\n";
				}
				throw new Error(`Unexpected raw args: ${args.join(" ")}`);
			}),
			revparse: mock(async (args: string[]) => {
				if (args[0] === "HEAD") {
					throw new Error("fatal: ambiguous argument 'HEAD'");
				}
				throw new Error(`Unexpected revparse args: ${args.join(" ")}`);
			}),
		}));

		const manager = new PullRequestRuntimeManager({
			db: db as never,
			git: git as never,
			github: async () => ({}) as never,
			gitWatcher: { onChanged: () => () => {} } as never,
		});
		const refreshProjectMock = mock(async () => undefined);
		(
			manager as unknown as { refreshProject: typeof refreshProjectMock }
		).refreshProject = refreshProjectMock;

		// The sweep now routes through enqueueWorkspaceSync → syncOneWorkspace,
		// which re-reads each workspace via `select().from().where().get()`.
		// Bypass the drizzle .where() chain (awkward to mock) by feeding the
		// known row directly; syncWorkspaceRow still runs the production logic.
		(
			manager as unknown as {
				syncOneWorkspace: (id: string) => Promise<void>;
			}
		).syncOneWorkspace = async () => {
			const projectId = await (
				manager as unknown as {
					syncWorkspaceRow: (w: typeof workspace) => Promise<string | null>;
				}
			).syncWorkspaceRow(workspace);
			if (projectId) await refreshProjectMock(projectId);
		};

		await (
			manager as unknown as { syncWorkspaceBranches: () => Promise<void> }
		).syncWorkspaceBranches();

		expect(git).toHaveBeenCalledWith("/tmp/unborn-worktree");
		expect(setMock).toHaveBeenCalledWith({
			branch: "feature/unborn",
			headSha: null,
			upstreamOwner: null,
			upstreamRepo: null,
			upstreamBranch: null,
			pullRequestId: null,
		});
		expect(refreshProjectMock).toHaveBeenCalledWith("project-1");
	});

	test("logs and skips unexpected HEAD lookup failures", async () => {
		const workspace = {
			id: "ws-2",
			projectId: "project-2",
			worktreePath: "/tmp/broken-worktree",
			branch: "stale-branch",
			headSha: "stale-sha",
			pullRequestId: null,
			createdAt: Date.now(),
		};

		const runMock = mock(() => undefined);
		const whereMock = mock(() => ({ run: runMock }));
		const setMock = mock(() => ({ where: whereMock }));
		const updateMock = mock(() => ({ set: setMock }));
		const allMock = mock(() => [workspace]);
		const db = {
			select: mock(() => ({
				from: mock(() => ({
					all: allMock,
				})),
			})),
			update: updateMock,
		};

		const git = mock(async () => ({
			raw: mock(async () => "feature/broken\n"),
			revparse: mock(async (args: string[]) => {
				if (args[0] === "HEAD") {
					throw new Error("fatal: permission denied");
				}
				throw new Error(`Unexpected revparse args: ${args.join(" ")}`);
			}),
		}));

		const manager = new PullRequestRuntimeManager({
			db: db as never,
			git: git as never,
			github: async () => ({}) as never,
			gitWatcher: { onChanged: () => () => {} } as never,
		});
		const refreshProjectMock = mock(async () => undefined);
		(
			manager as unknown as { refreshProject: typeof refreshProjectMock }
		).refreshProject = refreshProjectMock;

		// The sweep now routes through enqueueWorkspaceSync → syncOneWorkspace,
		// which re-reads each workspace via `select().from().where().get()`.
		// Bypass the drizzle .where() chain (awkward to mock) by feeding the
		// known row directly; syncWorkspaceRow still runs the production logic.
		(
			manager as unknown as {
				syncOneWorkspace: (id: string) => Promise<void>;
			}
		).syncOneWorkspace = async () => {
			const projectId = await (
				manager as unknown as {
					syncWorkspaceRow: (w: typeof workspace) => Promise<string | null>;
				}
			).syncWorkspaceRow(workspace);
			if (projectId) await refreshProjectMock(projectId);
		};
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

		await (
			manager as unknown as { syncWorkspaceBranches: () => Promise<void> }
		).syncWorkspaceBranches();

		expect(setMock).not.toHaveBeenCalled();
		expect(refreshProjectMock).not.toHaveBeenCalled();
		// Pin to the sync-failure path so an unrelated console.warn can't pass.
		expect(warnSpy.mock.calls[0]?.[0]).toContain("Failed to sync workspace");
	});
});
