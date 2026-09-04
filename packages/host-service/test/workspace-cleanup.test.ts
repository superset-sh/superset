import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	existsSync,
	lstatSync,
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
	projectId: string | null;
	worktreePath: string;
	branch: string;
	type?: "main" | "worktree" | "session";
	pullRequestId?: string | null;
	archivedAt?: number | null;
};
type ProjectRow = { id: string; repoPath: string; worktreeBaseDir?: string };

type WorktreeState = { hasChanges: boolean; hasUnpushedCommits: boolean };

interface ContextSpec {
	workspace?: WorkspaceRow;
	project?: ProjectRow;
	// git-ops behavior for this test; the ops are patched below so the
	// saga's git work never spawns anything. Task-internal behaviors
	// (rev-list swallow, `--force --force` semantics, registry verification)
	// are covered by the real handlers in the integration suite.
	worktreeState?: WorktreeState | (() => Promise<WorktreeState>);
	// Simulates ctx.git()/env-resolution failure ("failed to open repo").
	resolveGitEnvThrows?: boolean;
	removeWorktree?: () => Promise<{
		stillRegistered: boolean;
		removeError?: string;
	}>;
	deleteBranch?: () => Promise<{ deleted: boolean }>;
	// Simulates sqlite failure at the archive UPDATE — the commit point.
	dbUpdateThrows?: boolean | "once";
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

	const dbDeleteRun = mock(() => {});
	const dbDeleteWhere = mock(() => ({ run: dbDeleteRun }));
	const dbInsertRun = mock(() => {});
	let updateThrown = false;
	const dbUpdateRun = mock(() => {
		if (!spec.dbUpdateThrows) return;
		if (spec.dbUpdateThrows === "once" && updateThrown) return;
		updateThrown = true;
		throw new Error("sqlite update boom");
	});
	const terminalSelectAll = mock(() => []);
	const broadcastWorkspaceChanged = mock(() => {});

	const ctx = {
		isAuthenticated: true,
		organizationId: "org-1",
		git: (async () => {
			throw new Error("unexpected ctx.git call — cleanup goes through git-ops");
		}) as never,
		github: (async () => ({})) as never,
		api: undefined,
		db: {
			query: {
				workspaces: { findFirst: workspaceFindFirst },
				projects: { findFirst: projectFindFirst },
				pullRequests: { findFirst: () => ({ sync: () => undefined }) },
			},
			select: () => ({
				from: () => ({
					// `.all` serves the terminal-session sweep; `.get` serves
					// getHostWorktreeBaseDir when a spec sets no per-project
					// worktreeBaseDir ("no host settings row" shape).
					where: () => ({ all: terminalSelectAll, get: () => undefined }),
				}),
			}),
			update: () => ({
				set: () => ({ where: () => ({ run: dbUpdateRun }) }),
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
		__mocks: { broadcastWorkspaceChanged },
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
			dbUpdateThrows: "once",
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
		// The repo must exist on disk: a missing repo directory now takes the
		// direct-removal branch instead of the mocked git layer under test.
		const repo = mkdtempSync(join(tmpdir(), "workspace-delete-repo-"));
		try {
			const ctx = makeCtx({
				workspace: {
					id: "ws-1",
					projectId: "p-1",
					worktreePath: tmp,
					branch: "feature",
				},
				project: { id: "p-1", repoPath: repo },
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
			// Mark-first: the row archives at the commit point, then the
			// failure un-archives it — a deleted/created broadcast pair.
			const events = ctx.__mocks.broadcastWorkspaceChanged.mock.calls.map(
				(call) => (call[0] as { eventType: string }).eventType,
			);
			expect(events).toEqual(["deleted", "created"]);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
			rmSync(repo, { recursive: true, force: true });
		}
	});

	test("git unregisters the worktree but the folder survives: destroy removes it", async () => {
		// git's `worktree remove --force --force` is not atomic: it can drop
		// the registration and then fail partway through its recursive delete
		// (locked file, live writer). The registry read then says "removed"
		// while the directory is still on disk (#6730).
		const base = mkdtempSync(join(tmpdir(), "worktrees-base-"));
		const repo = mkdtempSync(join(tmpdir(), "workspace-delete-repo-"));
		const worktree = join(base, "p-1", "wt-partial");
		mkdirSync(worktree, { recursive: true });
		writeFileSync(join(worktree, "leftover.txt"), "still here");
		try {
			const ctx = makeCtx({
				workspace: {
					id: "ws-1",
					projectId: "p-1",
					worktreePath: worktree,
					branch: "feature",
				},
				project: { id: "p-1", repoPath: repo, worktreeBaseDir: base },
				removeWorktree: async () => ({
					stillRegistered: false,
					removeError:
						"error: failed to delete 'wt-partial': Operation not permitted",
				}),
			});
			const caller = workspaceCleanupRouter.createCaller(ctx);

			const result = await caller.destroy({
				workspaceId: "ws-1",
				deleteBranch: false,
				force: true,
			});
			expect(result.success).toBe(true);
			expect(result.worktreeRemoved).toBe(true);
			expect(existsSync(worktree)).toBe(false);
		} finally {
			rmSync(base, { recursive: true, force: true });
			rmSync(repo, { recursive: true, force: true });
		}
	});

	test("git unregisters the worktree and leaves a dangling symlink: destroy removes the link", async () => {
		// A dangling link is not an absence: a stat-based recheck follows the
		// link, sees nothing, and reports the worktree removed while the entry
		// is still in the managed root.
		const base = mkdtempSync(join(tmpdir(), "worktrees-base-"));
		const repo = mkdtempSync(join(tmpdir(), "workspace-delete-repo-"));
		const worktree = join(base, "p-1", "wt-dangling");
		mkdirSync(join(base, "p-1"), { recursive: true });
		symlinkSync(join(base, "gone-target"), worktree);
		try {
			expect(existsSync(worktree)).toBe(false);
			expect(lstatSync(worktree, { throwIfNoEntry: false })).toBeDefined();
			const ctx = makeCtx({
				workspace: {
					id: "ws-1",
					projectId: "p-1",
					worktreePath: worktree,
					branch: "feature",
				},
				project: { id: "p-1", repoPath: repo, worktreeBaseDir: base },
				removeWorktree: async () => ({ stillRegistered: false }),
			});
			const caller = workspaceCleanupRouter.createCaller(ctx);

			const result = await caller.destroy({
				workspaceId: "ws-1",
				deleteBranch: false,
				force: true,
			});
			expect(result.success).toBe(true);
			expect(result.worktreeRemoved).toBe(true);
			expect(lstatSync(worktree, { throwIfNoEntry: false })).toBeUndefined();
		} finally {
			rmSync(base, { recursive: true, force: true });
			rmSync(repo, { recursive: true, force: true });
		}
	});

	test("worktree path is a symlink into the managed root: destroy removes the link, not through it", async () => {
		const base = mkdtempSync(join(tmpdir(), "worktrees-base-"));
		const repo = mkdtempSync(join(tmpdir(), "workspace-delete-repo-"));
		const outside = mkdtempSync(join(tmpdir(), "workspace-delete-outside-"));
		const worktree = join(base, "p-1", "wt-link");
		mkdirSync(join(base, "p-1"), { recursive: true });
		writeFileSync(join(outside, "user-data.txt"), "keep me");
		symlinkSync(outside, worktree);
		try {
			const ctx = makeCtx({
				workspace: {
					id: "ws-1",
					projectId: "p-1",
					worktreePath: worktree,
					branch: "feature",
				},
				project: { id: "p-1", repoPath: repo, worktreeBaseDir: base },
				removeWorktree: async () => ({ stillRegistered: false }),
			});
			const caller = workspaceCleanupRouter.createCaller(ctx);

			const result = await caller.destroy({
				workspaceId: "ws-1",
				deleteBranch: false,
				force: true,
			});
			expect(result.success).toBe(true);
			// The link resolves outside the managed root, so the root guard
			// refuses it and the target's contents are untouched.
			expect(result.worktreeRemoved).toBe(false);
			expect(existsSync(join(outside, "user-data.txt"))).toBe(true);
			expect(
				result.warnings.some((warning) => warning.includes("left on disk")),
			).toBe(true);
		} finally {
			rmSync(base, { recursive: true, force: true });
			rmSync(repo, { recursive: true, force: true });
			rmSync(outside, { recursive: true, force: true });
		}
	});

	test("unregistered leftover outside the managed root is left on disk with a warning", async () => {
		const tmp = mkdtempSync(join(tmpdir(), "workspace-delete-"));
		const repo = mkdtempSync(join(tmpdir(), "workspace-delete-repo-"));
		try {
			const ctx = makeCtx({
				workspace: {
					id: "ws-1",
					projectId: "p-1",
					worktreePath: tmp,
					branch: "feature",
				},
				// No worktreeBaseDir: the default root is under the home dir,
				// so this tmp path falls outside it and must not be rm'd.
				project: { id: "p-1", repoPath: repo },
				removeWorktree: async () => ({ stillRegistered: false }),
			});
			const caller = workspaceCleanupRouter.createCaller(ctx);

			const result = await caller.destroy({
				workspaceId: "ws-1",
				deleteBranch: false,
				force: true,
			});
			expect(result.success).toBe(true);
			expect(existsSync(tmp)).toBe(true);
			// The folder is still on disk, so the result must not claim the
			// worktree was removed (#6785 review).
			expect(result.worktreeRemoved).toBe(false);
			expect(
				result.warnings.some((warning) => warning.includes("left on disk")),
			).toBe(true);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
			rmSync(repo, { recursive: true, force: true });
		}
	});

	test("still-registered failure surfaces git's own error", async () => {
		const tmp = mkdtempSync(join(tmpdir(), "workspace-delete-"));
		const repo = mkdtempSync(join(tmpdir(), "workspace-delete-repo-"));
		try {
			const ctx = makeCtx({
				workspace: {
					id: "ws-1",
					projectId: "p-1",
					worktreePath: tmp,
					branch: "feature",
				},
				project: { id: "p-1", repoPath: repo },
				removeWorktree: async () => ({
					stillRegistered: true,
					removeError: "Operation not permitted",
				}),
			});
			const caller = workspaceCleanupRouter.createCaller(ctx);

			await expect(
				caller.destroy({
					workspaceId: "ws-1",
					deleteBranch: false,
					force: true,
				}),
			).rejects.toThrow(/Operation not permitted/);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
			rmSync(repo, { recursive: true, force: true });
		}
	});

	test("worktree removal task failure blocks local delete (post-remove state unknown)", async () => {
		const tmp = mkdtempSync(join(tmpdir(), "workspace-delete-"));
		// The repo must exist on disk: a missing repo directory now takes the
		// direct-removal branch instead of the mocked git layer under test.
		const repo = mkdtempSync(join(tmpdir(), "workspace-delete-repo-"));
		try {
			const ctx = makeCtx({
				workspace: {
					id: "ws-1",
					projectId: "p-1",
					worktreePath: tmp,
					branch: "feature",
				},
				project: { id: "p-1", repoPath: repo },
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
		} finally {
			rmSync(tmp, { recursive: true, force: true });
			rmSync(repo, { recursive: true, force: true });
		}
	});

	test("git env-resolution failure blocks local delete while the worktree path still exists", async () => {
		const tmp = mkdtempSync(join(tmpdir(), "workspace-delete-"));
		// The repo must exist on disk: a missing repo directory now takes the
		// direct-removal branch instead of the mocked git layer under test.
		const repo = mkdtempSync(join(tmpdir(), "workspace-delete-repo-"));
		try {
			const ctx = makeCtx({
				workspace: {
					id: "ws-1",
					projectId: "p-1",
					worktreePath: tmp,
					branch: "feature",
				},
				project: { id: "p-1", repoPath: repo },
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
		} finally {
			rmSync(tmp, { recursive: true, force: true });
			rmSync(repo, { recursive: true, force: true });
		}
	});

	test("missing project metadata warns but still deletes local state", async () => {
		const tmp = mkdtempSync(join(tmpdir(), "workspace-delete-"));
		try {
			const ctx = makeCtx({
				workspace: {
					id: "ws-1",
					projectId: "missing-project",
					worktreePath: tmp,
					branch: "feature",
				},
				project: undefined,
			});
			const caller = workspaceCleanupRouter.createCaller(ctx);

			const result = await caller.destroy({
				workspaceId: "ws-1",
				deleteBranch: false,
				force: true,
			});

			expect(result.success).toBe(true);
			expect(result.worktreeRemoved).toBe(false);
			expect(result.warnings).toContain(
				`Skipped worktree removal at ${tmp}: project metadata is missing`,
			);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	test("destroy archives the row and broadcasts once", async () => {
		const tmp = mkdtempSync(join(tmpdir(), "workspace-delete-"));
		// The repo must exist on disk: a missing repo directory now takes the
		// direct-removal branch instead of the mocked git layer under test.
		const repo = mkdtempSync(join(tmpdir(), "workspace-delete-repo-"));
		try {
			const ctx = makeCtx({
				workspace: {
					id: "ws-1",
					projectId: "p-1",
					worktreePath: tmp,
					branch: "feature",
				},
				project: { id: "p-1", repoPath: repo },
			});
			const caller = workspaceCleanupRouter.createCaller(ctx);

			const result = await caller.destroy({
				workspaceId: "ws-1",
				deleteBranch: false,
				force: true,
			});
			expect(result.success).toBe(true);
			expect(ctx.__mocks.broadcastWorkspaceChanged).toHaveBeenCalledTimes(1);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
			rmSync(repo, { recursive: true, force: true });
		}
	});

	test("branch delete failure is reported as a warning after the local commit point", async () => {
		const ctx = makeCtx({
			workspace: {
				id: "ws-1",
				projectId: "p-1",
				worktreePath: "/missing/wt",
				branch: "feature",
			},
			project: { id: "p-1", repoPath: "/repo" },
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
		expect(result.worktreeRemoved).toBe(true);
		expect(result.branchDeleted).toBe(false);
		expect(result.warnings).toContain(
			"Failed to delete branch feature: branch delete boom",
		);
	});

	test("worktree-removal timeout carries its phase into the reported error", async () => {
		// The Sentry event for HOST-SERVICE-17 / -47 is this TRPCError, and its
		// message is the pool's timeout text verbatim — so a phase named there
		// is a phase named in the report. Without this link the label would
		// stop at the pool and never reach anyone triaging.
		const poolTimeout = new WorkerTaskError(
			'[host-worker] Task "git/removeWorktree" timed out after 120000ms in phase "worktree-remove"',
		);
		const ctx = makeCtx({
			workspace: {
				id: "ws-1",
				projectId: "p-1",
				worktreePath: "/branch/wt",
				branch: "feature",
			},
			project: { id: "p-1", repoPath: "/repo" },
			removeWorktree: () => Promise.reject(poolTimeout),
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);

		const error = await caller
			.destroy({ workspaceId: "ws-1", deleteBranch: false, force: true })
			.then(() => null)
			.catch((err: Error) => err);

		// Built from the pool error rather than restated, so the two halves
		// cannot drift; the pool's exact wording is pinned by the phase tests
		// in src/workers/host-worker-pool.test.ts.
		expect(error?.message).toBe(
			`Failed to verify worktree removal at /branch/wt: ${poolTimeout.message}`,
		);
		expect(error?.message).toContain('in phase "worktree-remove"');
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

	test("sqlite archive failure fails the destroy (the archive is the commit point)", async () => {
		const ctx = makeCtx({
			workspace: {
				id: "ws-1",
				projectId: "p-1",
				worktreePath: "/branch/wt",
				branch: "feature",
			},
			project: { id: "p-1", repoPath: "/repo" },
			dbUpdateThrows: true,
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);
		await expect(
			caller.destroy({
				workspaceId: "ws-1",
				deleteBranch: false,
				force: true,
			}),
		).rejects.toThrow(/sqlite update boom/);
	});

	test("session destroy archives the row like any other workspace", async () => {
		const ctx = makeCtx({
			workspace: {
				id: "ws-session",
				projectId: null,
				worktreePath: "/missing/session-dir",
				branch: "main",
				type: "session",
			},
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);
		const result = await caller.destroy({
			workspaceId: "ws-session",
			deleteBranch: false,
			force: true,
		});
		expect(result.success).toBe(true);
		const events = ctx.__mocks.broadcastWorkspaceChanged.mock.calls.map(
			(call) => (call[0] as { eventType: string }).eventType,
		);
		expect(events).toEqual(["deleted"]);
	});

	test("the archive commit point applies to sessions too", async () => {
		const ctx = makeCtx({
			workspace: {
				id: "ws-session",
				projectId: null,
				worktreePath: "/missing/session-dir",
				branch: "main",
				type: "session",
			},
			dbUpdateThrows: true,
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);
		await expect(
			caller.destroy({
				workspaceId: "ws-session",
				deleteBranch: false,
				force: true,
			}),
		).rejects.toThrow(/sqlite update boom/);
	});
});
