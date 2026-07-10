import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isMainWorkspace } from "../src/trpc/router/workspace-cleanup/is-main-workspace";
import {
	__testDestroysInFlight,
	workspaceCleanupRouter,
} from "../src/trpc/router/workspace-cleanup/workspace-cleanup";
import type { HostServiceContext } from "../src/types";

type WorkspaceRow = {
	id: string;
	projectId: string;
	worktreePath: string;
	branch: string;
	type?: "main" | "worktree";
};
type ProjectRow = { id: string; repoPath: string };

interface ContextSpec {
	workspace?: WorkspaceRow;
	project?: ProjectRow;
	cloudDelete?: () => Promise<unknown>;
	gitStatus?: { isClean: () => boolean };
	revListCount?: string | (() => Promise<string>);
	gitFactoryThrows?: boolean;
	worktreeRemove?: () => Promise<unknown>;
	// Porcelain `git worktree list` output read back after the remove attempt.
	// A path still present here means git considers the worktree live.
	worktreeList?: string;
	branchDelete?: () => Promise<unknown>;
	// Whether `git branch --list` finds the branch (defaults to present).
	branchExists?: boolean;
	dbDeleteThrows?: boolean | "once";
	noApi?: boolean;
}

function makeCtx(spec: ContextSpec): HostServiceContext & {
	__mocks: {
		cloudDelete: ReturnType<typeof mock>;
		broadcastWorkspaceChanged: ReturnType<typeof mock>;
	};
} {
	const workspaceRow = spec.workspace
		? { type: "worktree", ...spec.workspace }
		: undefined;
	const workspaceFindFirst = mock(() => ({
		sync: () => workspaceRow,
	}));
	const projectFindFirst = mock(() => ({
		sync: () => spec.project,
	}));

	const cloudDelete = mock(spec.cloudDelete ?? (async () => undefined));

	const status = mock(async () => spec.gitStatus ?? { isClean: () => true });
	const revList = mock(async () =>
		typeof spec.revListCount === "function"
			? await spec.revListCount()
			: (spec.revListCount ?? "0\n"),
	);
	const worktreeRemove = mock(spec.worktreeRemove ?? (async () => undefined));
	const worktreeList = mock(async () => spec.worktreeList ?? "");
	const branchDelete = mock(spec.branchDelete ?? (async () => undefined));

	const git = mock(async () => {
		if (spec.gitFactoryThrows) throw new Error("git factory boom");
		return {
			status,
			raw: mock(async (args: string[]) => {
				if (args[0] === "rev-list") return await revList();
				if (args[0] === "worktree") {
					return args[1] === "list"
						? await worktreeList()
						: await worktreeRemove();
				}
				if (args[0] === "branch") {
					// `branch --list <name>` is the existence probe: non-empty
					// output means the ref exists. `branch -D` is the delete.
					return args[1] === "--list"
						? spec.branchExists === false
							? ""
							: `  ${args[2]}\n`
						: await branchDelete();
				}
				throw new Error(`unexpected git raw: ${args.join(" ")}`);
			}),
		};
	});

	// The delete mock is shared across tables; per destroy, call #1 is the
	// terminal-sessions sweep and call #2 is the workspace row — the one the
	// throw specs target.
	let deleteCalls = 0;
	let deleteThrown = false;
	const dbDeleteRun = mock(() => {
		deleteCalls += 1;
		if (deleteCalls !== 2 || !spec.dbDeleteThrows) return;
		if (spec.dbDeleteThrows === "once" && deleteThrown) return;
		deleteThrown = true;
		throw new Error("sqlite delete boom");
	});
	const dbDeleteWhere = mock(() => ({ run: dbDeleteRun }));
	const dbInsertRun = mock(() => {});
	const terminalSelectAll = mock(() => []);
	const broadcastWorkspaceChanged = mock(() => {});

	const ctx = {
		isAuthenticated: true,
		organizationId: "org-1",
		git: git as never,
		github: (async () => ({})) as never,
		api: spec.noApi
			? undefined
			: ({
					v2Workspace: {
						delete: { mutate: cloudDelete },
					},
				} as never),
		db: {
			query: {
				workspaces: { findFirst: workspaceFindFirst },
				projects: { findFirst: projectFindFirst },
			},
			select: () => ({
				from: () => ({
					where: () => ({ all: terminalSelectAll }),
				}),
			}),
			delete: () => ({ where: dbDeleteWhere }),
			insert: () => ({
				values: () => ({
					onConflictDoNothing: () => ({ run: dbInsertRun }),
					run: dbInsertRun,
				}),
			}),
		} as never,
		runtime: {} as never,
		eventBus: { broadcastWorkspaceChanged } as never,
	};
	return Object.assign(ctx as HostServiceContext, {
		__mocks: { cloudDelete, broadcastWorkspaceChanged },
	});
}

describe("isMainWorkspace", () => {
	test("returns isMain: false when no local workspace row", async () => {
		const ctx = makeCtx({});
		const result = await isMainWorkspace(ctx, "ws-1");
		expect(result.isMain).toBe(false);
		expect(result.reason).toBe(null);
	});

	test("returns isMain: true when worktreePath equals project repoPath", async () => {
		const tmp = mkdtempSync(join(tmpdir(), "is-main-"));
		try {
			const ctx = makeCtx({
				workspace: {
					id: "ws-1",
					projectId: "p-1",
					worktreePath: tmp,
					branch: "main",
				},
				project: { id: "p-1", repoPath: tmp },
			});
			const result = await isMainWorkspace(ctx, "ws-1");
			expect(result.isMain).toBe(true);
			expect(result.reason).toContain("Main workspaces cannot be deleted");
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	test("normalizes paths via realpath (symlinked worktree path equals repoPath)", async () => {
		const tmp = mkdtempSync(join(tmpdir(), "is-main-"));
		const realRepo = join(tmp, "real-repo");
		const symRepo = join(tmp, "sym-repo");
		mkdirSync(realRepo);
		writeFileSync(join(realRepo, ".keep"), "");
		symlinkSync(realRepo, symRepo);
		try {
			const ctx = makeCtx({
				workspace: {
					id: "ws-1",
					projectId: "p-1",
					worktreePath: symRepo,
					branch: "main",
				},
				project: { id: "p-1", repoPath: realRepo },
			});
			const result = await isMainWorkspace(ctx, "ws-1");
			expect(result.isMain).toBe(true);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	test("returns isMain: true via local type even when paths differ", async () => {
		const ctx = makeCtx({
			workspace: {
				id: "ws-1",
				projectId: "p-1",
				worktreePath: "/some/branch/wt",
				branch: "feature",
				type: "main",
			},
			project: { id: "p-1", repoPath: "/some/repo" },
		});
		const result = await isMainWorkspace(ctx, "ws-1");
		expect(result.isMain).toBe(true);
	});

	test("returns isMain: false when neither path equality nor local type fires", async () => {
		const ctx = makeCtx({
			workspace: {
				id: "ws-1",
				projectId: "p-1",
				worktreePath: "/branch/wt",
				branch: "feature",
				type: "worktree",
			},
			project: { id: "p-1", repoPath: "/repo" },
		});
		const result = await isMainWorkspace(ctx, "ws-1");
		expect(result.isMain).toBe(false);
	});
});

describe("workspaceCleanup.inspect", () => {
	const wsAndProject = {
		workspace: {
			id: "ws-1",
			projectId: "p-1",
			worktreePath: "/branch/wt",
			branch: "feature",
		},
		project: { id: "p-1", repoPath: "/repo" },
	};

	test("blocks main workspaces with a destructive reason", async () => {
		const ctx = makeCtx({
			...wsAndProject,
			workspace: { ...wsAndProject.workspace, type: "main" },
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);
		const result = await caller.inspect({ workspaceId: "ws-1" });
		expect(result.canDelete).toBe(false);
		expect(result.reason).toContain("Main workspaces cannot be deleted");
		expect(result.hasChanges).toBe(false);
		expect(result.hasUnpushedCommits).toBe(false);
	});

	test("returns canDelete: true with no warnings when no local row", async () => {
		const ctx = makeCtx({});
		const caller = workspaceCleanupRouter.createCaller(ctx);
		const result = await caller.inspect({ workspaceId: "ws-1" });
		expect(result).toEqual({
			canDelete: true,
			reason: null,
			hasChanges: false,
			hasUnpushedCommits: false,
		});
	});

	test("flags hasChanges from git status", async () => {
		const ctx = makeCtx({
			...wsAndProject,
			gitStatus: { isClean: () => false },
			revListCount: "0\n",
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);
		const result = await caller.inspect({ workspaceId: "ws-1" });
		expect(result.hasChanges).toBe(true);
		expect(result.hasUnpushedCommits).toBe(false);
	});

	test("flags hasUnpushedCommits from rev-list count > 0", async () => {
		const ctx = makeCtx({
			...wsAndProject,
			gitStatus: { isClean: () => true },
			revListCount: "3\n",
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);
		const result = await caller.inspect({ workspaceId: "ws-1" });
		expect(result.hasChanges).toBe(false);
		expect(result.hasUnpushedCommits).toBe(true);
	});

	test("treats rev-list failure as no-unpushed-signal (doesn't block)", async () => {
		const ctx = makeCtx({
			...wsAndProject,
			gitStatus: { isClean: () => true },
			revListCount: () => Promise.reject(new Error("rev-list boom")),
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);
		const result = await caller.inspect({ workspaceId: "ws-1" });
		expect(result.hasUnpushedCommits).toBe(false);
		expect(result.canDelete).toBe(true);
	});

	test("swallows git factory failures and returns canDelete: true with no warnings", async () => {
		const ctx = makeCtx({
			...wsAndProject,
			gitFactoryThrows: true,
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);
		const result = await caller.inspect({ workspaceId: "ws-1" });
		expect(result).toEqual({
			canDelete: true,
			reason: null,
			hasChanges: false,
			hasUnpushedCommits: false,
		});
	});
});

describe("workspaceCleanup.destroy in-flight guard", () => {
	beforeEach(() => __testDestroysInFlight.clear());

	test("clears the Set on success", async () => {
		const ctx = makeCtx({});
		const caller = workspaceCleanupRouter.createCaller(ctx);
		await caller.destroy({
			workspaceId: "ws-1",
			deleteBranch: false,
			force: false,
		});
		expect(__testDestroysInFlight.has("ws-1")).toBe(false);
	});

	test("cloud delete failure degrades to a warning (local delete is the commit point)", async () => {
		const ctx = makeCtx({
			workspace: {
				id: "ws-1",
				projectId: "p-1",
				worktreePath: "/missing/wt",
				branch: "feature",
			},
			project: { id: "p-1", repoPath: "/repo" },
			cloudDelete: async () => {
				throw new Error("cloud is down");
			},
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);
		const result = await caller.destroy({
			workspaceId: "ws-1",
			deleteBranch: false,
			force: true,
		});
		expect(result.success).toBe(true);
		expect(result.cloudDeleted).toBe(false);
		expect(
			result.warnings.some((w) => w.includes("Cloud delete deferred")),
		).toBe(true);
		expect(ctx.__mocks.broadcastWorkspaceChanged).toHaveBeenCalledTimes(1);
		expect(__testDestroysInFlight.has("ws-1")).toBe(false);
	});

	test("rejects a concurrent call with CONFLICT + DELETE_IN_PROGRESS cause", async () => {
		__testDestroysInFlight.add("ws-1");
		const caller = workspaceCleanupRouter.createCaller(makeCtx({}));
		await expect(
			caller.destroy({
				workspaceId: "ws-1",
				deleteBranch: false,
				force: false,
			}),
		).rejects.toMatchObject({
			code: "CONFLICT",
			cause: { kind: "DELETE_IN_PROGRESS" },
		});
	});

	test("retry after a failed destroy succeeds (no in-flight leak)", async () => {
		const ctx = makeCtx({
			workspace: {
				id: "ws-1",
				projectId: "p-1",
				worktreePath: "/missing/wt",
				branch: "feature",
			},
			project: { id: "p-1", repoPath: "/repo" },
			dbDeleteThrows: "once",
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);

		await expect(
			caller.destroy({
				workspaceId: "ws-1",
				deleteBranch: false,
				force: true,
			}),
		).rejects.toThrow();
		expect(__testDestroysInFlight.has("ws-1")).toBe(false);

		// Second attempt must NOT see DELETE_IN_PROGRESS — the Set was cleaned.
		const result = await caller.destroy({
			workspaceId: "ws-1",
			deleteBranch: false,
			force: true,
		});
		expect(result.success).toBe(true);
		expect(__testDestroysInFlight.has("ws-1")).toBe(false);
	});
});

describe("workspaceCleanup.destroy cleanup ordering", () => {
	beforeEach(() => __testDestroysInFlight.clear());

	test("worktree removal failure blocks local delete while the path still exists", async () => {
		const tmp = mkdtempSync(join(tmpdir(), "workspace-delete-"));
		let cloudCallCount = 0;
		try {
			const ctx = makeCtx({
				workspace: {
					id: "ws-1",
					projectId: "p-1",
					worktreePath: tmp,
					branch: "feature",
				},
				project: { id: "p-1", repoPath: "/repo" },
				cloudDelete: async () => {
					cloudCallCount += 1;
				},
				worktreeRemove: async () => {
					throw new Error("worktree remove boom");
				},
				// git still lists the worktree after the failed remove — the
				// authoritative signal that cleanup did not succeed.
				worktreeList: `worktree ${tmp}\nHEAD 0000\nbranch refs/heads/feature\n`,
			});
			const caller = workspaceCleanupRouter.createCaller(ctx);

			await expect(
				caller.destroy({
					workspaceId: "ws-1",
					deleteBranch: false,
					force: true,
				}),
			).rejects.toThrow(/Failed to remove worktree/i);
			expect(cloudCallCount).toBe(0);
			expect(ctx.__mocks.broadcastWorkspaceChanged).not.toHaveBeenCalled();
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	test("git open failure blocks local delete while the worktree path still exists", async () => {
		const tmp = mkdtempSync(join(tmpdir(), "workspace-delete-"));
		let cloudCallCount = 0;
		try {
			const ctx = makeCtx({
				workspace: {
					id: "ws-1",
					projectId: "p-1",
					worktreePath: tmp,
					branch: "feature",
				},
				project: { id: "p-1", repoPath: "/repo" },
				cloudDelete: async () => {
					cloudCallCount += 1;
				},
				gitFactoryThrows: true,
			});
			const caller = workspaceCleanupRouter.createCaller(ctx);

			await expect(
				caller.destroy({
					workspaceId: "ws-1",
					deleteBranch: false,
					force: true,
				}),
			).rejects.toThrow(/Failed to open project repo/i);
			expect(cloudCallCount).toBe(0);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	test("missing project metadata warns but still deletes local + cloud state", async () => {
		const tmp = mkdtempSync(join(tmpdir(), "workspace-delete-"));
		let cloudCallCount = 0;
		try {
			const ctx = makeCtx({
				workspace: {
					id: "ws-1",
					projectId: "missing-project",
					worktreePath: tmp,
					branch: "feature",
				},
				project: undefined,
				cloudDelete: async () => {
					cloudCallCount += 1;
				},
			});
			const caller = workspaceCleanupRouter.createCaller(ctx);

			const result = await caller.destroy({
				workspaceId: "ws-1",
				deleteBranch: false,
				force: true,
			});

			expect(result.success).toBe(true);
			expect(result.cloudDeleted).toBe(true);
			expect(result.worktreeRemoved).toBe(false);
			expect(result.warnings).toContain(
				`Skipped worktree removal at ${tmp}: project metadata is missing`,
			);
			expect(cloudCallCount).toBe(1);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	test("destroy completes without a cloud API (local-first)", async () => {
		const tmp = mkdtempSync(join(tmpdir(), "workspace-delete-"));
		try {
			const ctx = makeCtx({
				workspace: {
					id: "ws-1",
					projectId: "p-1",
					worktreePath: tmp,
					branch: "feature",
				},
				project: { id: "p-1", repoPath: "/repo" },
				noApi: true,
			});
			const caller = workspaceCleanupRouter.createCaller(ctx);

			const result = await caller.destroy({
				workspaceId: "ws-1",
				deleteBranch: false,
				force: true,
			});
			expect(result.success).toBe(true);
			expect(result.cloudDeleted).toBe(false);
			expect(ctx.__mocks.broadcastWorkspaceChanged).toHaveBeenCalledTimes(1);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	test("branch delete failure is reported as a warning after the local commit point", async () => {
		let cloudCallCount = 0;
		const ctx = makeCtx({
			workspace: {
				id: "ws-1",
				projectId: "p-1",
				worktreePath: "/missing/wt",
				branch: "feature",
			},
			project: { id: "p-1", repoPath: "/repo" },
			cloudDelete: async () => {
				cloudCallCount += 1;
			},
			branchDelete: async () => {
				throw new Error("branch delete boom");
			},
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);

		const result = await caller.destroy({
			workspaceId: "ws-1",
			deleteBranch: true,
			force: true,
		});
		expect(result.success).toBe(true);
		expect(result.cloudDeleted).toBe(true);
		expect(result.worktreeRemoved).toBe(true);
		expect(result.branchDeleted).toBe(false);
		expect(result.warnings).toContain(
			"Failed to delete branch feature: branch delete boom",
		);
		expect(cloudCallCount).toBe(1);
	});

	test("sqlite row-delete failure fails the destroy (local delete is the commit point)", async () => {
		const ctx = makeCtx({
			workspace: {
				id: "ws-1",
				projectId: "p-1",
				worktreePath: "/branch/wt",
				branch: "feature",
			},
			project: { id: "p-1", repoPath: "/repo" },
			dbDeleteThrows: true,
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);
		await expect(
			caller.destroy({
				workspaceId: "ws-1",
				deleteBranch: false,
				force: true,
			}),
		).rejects.toThrow(/sqlite delete boom/);
		expect(ctx.__mocks.cloudDelete).not.toHaveBeenCalled();
	});
});
