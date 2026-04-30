import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
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
};
type ProjectRow = { id: string; repoPath: string };

interface ContextSpec {
	workspace?: WorkspaceRow;
	project?: ProjectRow;
	cloudType?: "main" | "worktree";
	cloudDelete?: () => Promise<unknown>;
	gitStatus?: { isClean: () => boolean; ahead?: number };
	revListCount?: string | (() => Promise<string>);
	gitFactoryThrows?: boolean;
}

function makeCtx(spec: ContextSpec): HostServiceContext {
	const workspaceFindFirst = mock(() => ({
		sync: () => spec.workspace,
	}));
	const projectFindFirst = mock(() => ({
		sync: () => spec.project,
	}));

	const cloudGetFromHost = mock(async () =>
		spec.cloudType ? { type: spec.cloudType } : null,
	);
	const cloudDelete = mock(spec.cloudDelete ?? (async () => undefined));

	const status = mock(async () => spec.gitStatus ?? { isClean: () => true });
	const revList = mock(async () =>
		typeof spec.revListCount === "function"
			? await spec.revListCount()
			: (spec.revListCount ?? "0\n"),
	);
	const worktreeRemove = mock(async () => undefined);
	const branchDelete = mock(async () => undefined);

	const git = mock(async () => {
		if (spec.gitFactoryThrows) throw new Error("git factory boom");
		return {
			status,
			raw: mock(async (args: string[]) => {
				if (args[0] === "rev-list") return await revList();
				if (args[0] === "worktree") return await worktreeRemove();
				if (args[0] === "branch") return await branchDelete();
				throw new Error(`unexpected git raw: ${args.join(" ")}`);
			}),
		};
	});

	const dbDeleteRun = mock(() => undefined);
	const dbDeleteWhere = mock(() => ({ run: dbDeleteRun }));
	const terminalSelectAll = mock(() => []);

	return {
		isAuthenticated: true,
		organizationId: "org-1",
		git: git as never,
		github: (async () => ({})) as never,
		api: {
			v2Workspace: {
				getFromHost: { query: cloudGetFromHost },
				delete: { mutate: cloudDelete },
			},
		} as never,
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
		} as never,
		runtime: {} as never,
		eventBus: {} as never,
	};
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

	test("returns isMain: true via cloud type even when paths differ", async () => {
		const ctx = makeCtx({
			workspace: {
				id: "ws-1",
				projectId: "p-1",
				worktreePath: "/some/branch/wt",
				branch: "feature",
			},
			project: { id: "p-1", repoPath: "/some/repo" },
			cloudType: "main",
		});
		const result = await isMainWorkspace(ctx, "ws-1");
		expect(result.isMain).toBe(true);
	});

	test("returns isMain: false when neither local equality nor cloud type fires", async () => {
		const ctx = makeCtx({
			workspace: {
				id: "ws-1",
				projectId: "p-1",
				worktreePath: "/branch/wt",
				branch: "feature",
			},
			project: { id: "p-1", repoPath: "/repo" },
			cloudType: "worktree",
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
		const ctx = makeCtx({ ...wsAndProject, cloudType: "main" });
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
			cloudType: "worktree",
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
			cloudType: "worktree",
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
			cloudType: "worktree",
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
			cloudType: "worktree",
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
	beforeEach(() => {
		__testDestroysInFlight.clear();
	});
	afterEach(() => {
		__testDestroysInFlight.clear();
	});

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

	test("clears the Set when phase 2 (cloud delete) throws", async () => {
		const ctx = makeCtx({
			cloudDelete: async () => {
				throw new Error("cloud is down");
			},
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);
		await expect(
			caller.destroy({
				workspaceId: "ws-1",
				deleteBranch: false,
				force: false,
			}),
		).rejects.toThrow();
		expect(__testDestroysInFlight.has("ws-1")).toBe(false);
	});

	test("rejects a concurrent call with CONFLICT + DELETE_IN_PROGRESS cause", async () => {
		__testDestroysInFlight.add("ws-1");
		const ctx = makeCtx({});
		const caller = workspaceCleanupRouter.createCaller(ctx);
		try {
			await caller.destroy({
				workspaceId: "ws-1",
				deleteBranch: false,
				force: false,
			});
			throw new Error("expected destroy to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(TRPCError);
			const trpcErr = err as TRPCError;
			expect(trpcErr.code).toBe("CONFLICT");
			expect(trpcErr.cause).toMatchObject({ kind: "DELETE_IN_PROGRESS" });
		}
	});

	test("retry after a failed destroy succeeds (no in-flight leak)", async () => {
		let cloudCallCount = 0;
		const ctx = makeCtx({
			cloudDelete: async () => {
				cloudCallCount += 1;
				if (cloudCallCount === 1) throw new Error("transient cloud failure");
			},
		});
		const caller = workspaceCleanupRouter.createCaller(ctx);

		await expect(
			caller.destroy({
				workspaceId: "ws-1",
				deleteBranch: false,
				force: false,
			}),
		).rejects.toThrow();
		expect(__testDestroysInFlight.has("ws-1")).toBe(false);

		// Second attempt must NOT see DELETE_IN_PROGRESS — the Set was cleaned.
		await caller.destroy({
			workspaceId: "ws-1",
			deleteBranch: false,
			force: false,
		});
		expect(cloudCallCount).toBe(2);
		expect(__testDestroysInFlight.has("ws-1")).toBe(false);
	});
});
