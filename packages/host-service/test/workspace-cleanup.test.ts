import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupGitOps } from "../src/trpc/router/workspace-cleanup/git-ops";
import { isMainWorkspace } from "../src/trpc/router/workspace-cleanup/is-main-workspace";
import {
	__testDestroysInFlight,
	workspaceCleanupRouter,
} from "../src/trpc/router/workspace-cleanup/workspace-cleanup";
import type { HostServiceContext } from "../src/types";
import { WorkerTaskError } from "../src/workers/WorkerTaskRunner";

type WorkspaceRow = {
	id: string;
	projectId: string;
	worktreePath: string;
	branch: string;
	type?: "main" | "worktree";
};
type ProjectRow = { id: string; repoPath: string };

type WorktreeState = { hasChanges: boolean; hasUnpushedCommits: boolean };

interface ContextSpec {
	workspace?: WorkspaceRow;
	project?: ProjectRow;
	cloudDelete?: () => Promise<unknown>;
	// git-ops behavior for this test; the ops are patched below so the
	// saga's git work never spawns anything. Task-internal behaviors
	// (rev-list swallow, `--force --force` semantics, registry verification)
	// are covered by the real handlers in the integration suite.
	worktreeState?: WorktreeState | (() => Promise<WorktreeState>);
	// Simulates ctx.git()/env-resolution failure ("failed to open repo").
	resolveGitEnvThrows?: boolean;
	removeWorktree?: () => Promise<{ stillRegistered: boolean }>;
	deleteBranch?: () => Promise<{ deleted: boolean }>;
	dbDeleteThrows?: boolean | "once";
	noApi?: boolean;
}

// Mutable per-test behavior read by the patched ops; makeCtx resets it.
// The methods are patched in place (NOT via mock.module — bun leaks module
// mocks across test files in the same process, which would poison the
// integration suite's real git-ops) and restored in afterAll.
let gitOpsSpec: ContextSpec = {};

const realGitOps = { ...cleanupGitOps };
afterAll(() => Object.assign(cleanupGitOps, realGitOps));

Object.assign(cleanupGitOps, {
	resolveGitEnv: async () => {
		if (gitOpsSpec.resolveGitEnvThrows) throw new Error("git env boom");
		return {};
	},
	readWorktreeState: async () => {
		const state = gitOpsSpec.worktreeState;
		if (typeof state === "function") return state();
		return state ?? { hasChanges: false, hasUnpushedCommits: false };
	},
	removeWorktree: async () =>
		gitOpsSpec.removeWorktree
			? gitOpsSpec.removeWorktree()
			: { stillRegistered: false },
	deleteLocalBranch: async () =>
		gitOpsSpec.deleteBranch ? gitOpsSpec.deleteBranch() : { deleted: true },
} satisfies typeof realGitOps);

function makeCtx(spec: ContextSpec): HostServiceContext & {
	__mocks: {
		cloudDelete: ReturnType<typeof mock>;
		broadcastWorkspaceChanged: ReturnType<typeof mock>;
	};
} {
	gitOpsSpec = spec;
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
		git: (async () => {
			throw new Error("unexpected ctx.git call — cleanup goes through git-ops");
		}) as never,
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

	test("flags hasChanges from the worktree-state task", async () => {
		const ctx = makeCtx({
			...wsAndProject,
			worktreeState: { hasChanges: true, hasUnpushedCommits: false },
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);
		const result = await caller.inspect({ workspaceId: "ws-1" });
		expect(result.hasChanges).toBe(true);
		expect(result.hasUnpushedCommits).toBe(false);
	});

	test("flags hasUnpushedCommits from the worktree-state task", async () => {
		const ctx = makeCtx({
			...wsAndProject,
			worktreeState: { hasChanges: false, hasUnpushedCommits: true },
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);
		const result = await caller.inspect({ workspaceId: "ws-1" });
		expect(result.hasChanges).toBe(false);
		expect(result.hasUnpushedCommits).toBe(true);
	});

	test("swallows worktree-state task failures and returns canDelete: true", async () => {
		const ctx = makeCtx({
			...wsAndProject,
			worktreeState: () => Promise.reject(new Error("status boom")),
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

	test("swallows git env-resolution failures and returns canDelete: true with no warnings", async () => {
		const ctx = makeCtx({
			...wsAndProject,
			resolveGitEnvThrows: true,
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
			result.warnings.some((w) => w.includes("Legacy cloud cleanup failed")),
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
				// git still lists the worktree after the remove attempt — the
				// authoritative signal that cleanup did not succeed.
				removeWorktree: async () => ({ stillRegistered: true }),
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

	test("worktree removal task failure blocks local delete (post-remove state unknown)", async () => {
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
				removeWorktree: async () => {
					throw new Error("worktree list boom");
				},
			});
			const caller = workspaceCleanupRouter.createCaller(ctx);

			await expect(
				caller.destroy({
					workspaceId: "ws-1",
					deleteBranch: false,
					force: true,
				}),
			).rejects.toThrow(/Failed to verify worktree removal/i);
			expect(cloudCallCount).toBe(0);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	test("git env-resolution failure blocks local delete while the worktree path still exists", async () => {
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
				resolveGitEnvThrows: true,
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
			deleteBranch: async () => {
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

	test("preflight pool timeout fails closed instead of skipping the dirty check", async () => {
		const ctx = makeCtx({
			workspace: {
				id: "ws-1",
				projectId: "p-1",
				worktreePath: "/branch/wt",
				branch: "feature",
			},
			project: { id: "p-1", repoPath: "/repo" },
			// Default-named WorkerTaskError = pool infrastructure failure
			// (timeout) — dirty-state unknown, so the destroy must not proceed.
			worktreeState: () =>
				Promise.reject(
					new WorkerTaskError(
						'Task "git/worktreeState" timed out after 15000ms',
					),
				),
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);
		await expect(
			caller.destroy({
				workspaceId: "ws-1",
				deleteBranch: false,
				force: false,
			}),
		).rejects.toThrow(/Couldn't verify worktree state/);
		expect(ctx.__mocks.cloudDelete).not.toHaveBeenCalled();
	});

	test("preflight git failure (missing worktree) still proceeds idempotently", async () => {
		const ctx = makeCtx({
			workspace: {
				id: "ws-1",
				projectId: "p-1",
				worktreePath: "/missing/wt",
				branch: "feature",
			},
			project: { id: "p-1", repoPath: "/repo" },
			// Plain git error (handler-thrown) — cleanup handles missing state.
			worktreeState: () => Promise.reject(new Error("fatal: not a git repo")),
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);
		const result = await caller.destroy({
			workspaceId: "ws-1",
			deleteBranch: false,
			force: false,
		});
		expect(result.success).toBe(true);
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
