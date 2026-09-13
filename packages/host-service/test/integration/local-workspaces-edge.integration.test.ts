import { Database as BunDatabase } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { terminalSessions, workspaces } from "../../src/db/schema";
import { runSandboxSelfSeed } from "../../src/runtime/sandbox-self-seed/sandbox-self-seed";
import { cloudFlows } from "../helpers/cloud-fakes";
import { createTestHost } from "../helpers/createTestHost";
import { createGitFixture } from "../helpers/git-fixture";
import {
	createFeatureWorktreeScenario,
	createProjectScenario,
} from "../helpers/scenarios";
import {
	seedProject,
	seedTerminalSession,
	seedWorkspace,
} from "../helpers/seed";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

const hostOptions = { apiOverrides: cloudFlows.workspaceCreateOk() };

function liveRows(db: {
	select: () => {
		from: (t: typeof workspaces) => {
			all: () => Array<typeof workspaces.$inferSelect>;
		};
	};
}) {
	return db
		.select()
		.from(workspaces)
		.all()
		.filter((row) => row.archivedAt == null);
}

describe("local workspaces: creation edge cases", () => {
	let dispose: (() => Promise<void>) | null = null;
	afterEach(async () => {
		await dispose?.();
		dispose = null;
	});

	test("1. two concurrent unnamed local creates both succeed with distinct names", async () => {
		const scenario = await createProjectScenario({ hostOptions });
		dispose = scenario.dispose;

		const [a, b] = await Promise.all([
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				checkout: "local",
			}),
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				checkout: "local",
			}),
		]);
		expect(a.workspace.id).not.toBe(b.workspace.id);
		expect(liveRows(scenario.host.db)).toHaveLength(2);
		expect(new Set([a.workspace.name, b.workspace.name]).size).toBe(2);
	});

	test("2. a client-minted id sent twice is idempotent, not a raw constraint error", async () => {
		const scenario = await createProjectScenario({ hostOptions });
		dispose = scenario.dispose;
		const id = randomUUID();

		const first = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			id,
			name: "same id",
		});
		expect(first.workspace.id).toBe(id);

		const second = await scenario.host.trpc.workspaces.create
			.mutate({
				projectId: scenario.projectId,
				checkout: "local",
				id,
				name: "same id",
			})
			.then(
				(result) => ({ ok: true as const, result }),
				(error: unknown) => ({ ok: false as const, error }),
			);
		expect(second.ok).toBe(true);
		if (second.ok) {
			expect(second.result.workspace.id).toBe(id);
			expect(second.result.alreadyExists).toBe(true);
		}
		expect(liveRows(scenario.host.db)).toHaveLength(1);
	});

	test.each([
		"other-project",
		"worktree",
		"archived",
	] as const)("rejects a local create id owned by an %s workspace", async (kind) => {
		const scenario = await createProjectScenario({ hostOptions });
		dispose = scenario.dispose;
		const projectId =
			kind === "other-project"
				? seedProject(scenario.host, {
						repoPath: join(scenario.repo.repoPath, "other"),
					}).id
				: scenario.projectId;
		const { id } = seedWorkspace(scenario.host, {
			projectId,
			worktreePath: scenario.repo.repoPath,
			branch: "main",
			type: kind === "worktree" ? "worktree" : "local",
		});
		if (kind === "archived") {
			await scenario.host.trpc.workspaceCleanup.destroy.mutate({
				workspaceId: id,
			});
		}
		await expect(
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				checkout: "local",
				id,
			}),
		).rejects.toMatchObject({ data: { code: "CONFLICT" } });
	});

	test("local creation leaves stale git worktree registrations untouched", async () => {
		const scenario = await createProjectScenario({ hostOptions });
		dispose = scenario.dispose;
		const path = join(scenario.repo.repoPath, ".worktrees", "stale");
		await scenario.repo.git.raw(["worktree", "add", "-b", "stale", path]);
		rmSync(path, { recursive: true, force: true });
		const before = await scenario.repo.git.raw([
			"worktree",
			"list",
			"--porcelain",
		]);
		await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
		});
		expect(
			await scenario.repo.git.raw(["worktree", "list", "--porcelain"]),
		).toBe(before);
	});

	test("3. createEnqueued settles with the client id, canonical id and project id", async () => {
		const scenario = await createProjectScenario({ hostOptions });
		dispose = scenario.dispose;
		const id = randomUUID();

		const settled: unknown[] = [];
		const bus = scenario.host.eventBus as unknown as {
			broadcastWorkspaceCreateSettled: (message: unknown) => void;
		};
		const original = bus.broadcastWorkspaceCreateSettled.bind(bus);
		bus.broadcastWorkspaceCreateSettled = (message) => {
			settled.push(message);
			original(message);
		};

		const enqueued = await scenario.host.trpc.workspaces.createEnqueued.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			id,
			name: "queued",
		});
		expect(enqueued.workspaceId).toBe(id);
		for (let i = 0; i < 50 && settled.length === 0; i += 1) {
			await new Promise((r) => setTimeout(r, 100));
		}
		expect(settled).toHaveLength(1);
		expect(settled[0]).toMatchObject({
			workspaceId: id,
			ok: true,
			canonicalWorkspaceId: id,
			projectId: scenario.projectId,
			alreadyExists: false,
		});
		const row = liveRows(scenario.host.db).find((r) => r.id === id);
		expect(row?.type).toBe("local");
		expect(row?.worktreePath).toBe(scenario.repo.repoPath);
	});

	test("4. local create never starts the setup terminal even when a setup script exists", async () => {
		const scenario = await createProjectScenario({ hostOptions });
		dispose = scenario.dispose;
		mkdirSync(join(scenario.repo.repoPath, ".superset"), { recursive: true });
		writeFileSync(
			join(scenario.repo.repoPath, ".superset", "setup.sh"),
			"#!/bin/sh\necho setup\n",
		);

		// `command` is left out: this harness never calls initTerminalBaseEnv,
		// so any terminal launch throws "Terminal base env not initialized"
		// out of the create. Setup-terminal skipping is what this covers.
		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "with setup script",
		});
		expect(
			result.terminals.filter((t) => /setup/i.test(t.label ?? "")),
		).toHaveLength(0);
		const row = liveRows(scenario.host.db).find(
			(r) => r.id === result.workspace.id,
		);
		expect(row?.worktreePath).toBe(scenario.repo.repoPath);
	});

	test("5. a linked task is stored and started", async () => {
		const scenario = await createProjectScenario({
			hostOptions: {
				apiOverrides: {
					...cloudFlows.workspaceCreateOk(),
					"task.start.mutate": () => ({ ok: true }),
				},
			},
		});
		dispose = scenario.dispose;
		const taskId = randomUUID();

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "task-linked",
			taskId,
		});
		expect(result.workspace.taskId).toBe(taskId);
		await new Promise((r) => setTimeout(r, 50));
		expect(
			scenario.host.apiCalls.some(
				(call) =>
					call.path === "task.start.mutate" &&
					(call.input as { id: string }).id === taskId,
			),
		).toBe(true);
	});

	test("6. a project whose directory is gone fails with NOT_FOUND and creates nothing", async () => {
		const host = await createTestHost(hostOptions);
		dispose = () => host.dispose();
		const missing = join(mkdtempSync(join(tmpdir(), "gone-")), "repo");
		const { id: projectId } = seedProject(host, { repoPath: missing });

		await expect(
			host.trpc.workspaces.create.mutate({
				projectId,
				checkout: "local",
				name: "x",
			}),
		).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
		expect(liveRows(host.db)).toHaveLength(0);
	});

	test("7. detached HEAD: local create refused, project import and worktree create still work", async () => {
		const host = await createTestHost(hostOptions);
		dispose = () => host.dispose();
		const repo = await createGitFixture();
		try {
			await repo.commit("second", { "b.txt": "b" });
			const head = (await repo.git.revparse(["HEAD"])).trim();
			await repo.git.checkout(head);
			expect(
				(
					await repo.git.raw(["symbolic-ref", "-q", "HEAD"]).catch(() => "")
				).trim(),
			).toBe("");

			const created = await host.trpc.project.create.mutate({
				name: "detached",
				mode: { kind: "importLocal", repoPath: repo.repoPath },
			});
			expect(created.created).toBe(true);

			await expect(
				host.trpc.workspaces.create.mutate({
					projectId: created.projectId,
					checkout: "local",
					name: "x",
				}),
			).rejects.toMatchObject({ data: { code: "PRECONDITION_FAILED" } });

			const worktree = await host.trpc.workspaces.create.mutate({
				projectId: created.projectId,
				name: "feat",
				branch: "feature/detached",
			});
			expect(worktree.workspace.type).toBe("worktree");
			const row = host.db
				.select()
				.from(workspaces)
				.all()
				.find((r) => r.id === worktree.workspace.id);
			expect(row?.worktreePath).toBeTruthy();
			expect(existsSync(row?.worktreePath ?? "")).toBe(true);
			await repo.git.raw([
				"worktree",
				"remove",
				"--force",
				row?.worktreePath ?? "",
			]);
		} finally {
			repo.dispose();
		}
	});
});

describe("local workspaces: deletion edge cases", () => {
	let dispose: (() => Promise<void>) | null = null;
	afterEach(async () => {
		await dispose?.();
		dispose = null;
	});

	test("8. deleting one local workspace leaves the sibling's terminal session rows alone", async () => {
		const scenario = await createProjectScenario({ hostOptions });
		dispose = scenario.dispose;
		const a = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "a",
		});
		const b = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "b",
		});
		const { id: sessionA } = seedTerminalSession(scenario.host, {
			originWorkspaceId: a.workspace.id,
		});
		const { id: sessionB } = seedTerminalSession(scenario.host, {
			originWorkspaceId: b.workspace.id,
		});

		const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: a.workspace.id,
		});
		expect(result.success).toBe(true);

		const sessions = scenario.host.db.select().from(terminalSessions).all();
		const rowB = sessions.find((s) => s.id === sessionB);
		expect(rowB?.originWorkspaceId).toBe(b.workspace.id);
		expect(rowB?.status).toBe("active");
		const rowA = sessions.find((s) => s.id === sessionA);
		// Without a daemon the dispose cannot confirm the kill, so the row is
		// left for the reconciler; it must not stay attached as "active" to
		// a tombstoned workspace without a warning.
		if (rowA?.status === "active") {
			expect(result.warnings.join(" ")).toMatch(/still be running/);
		}
	});

	test("9. legacy workspace.delete and destroy(deleteBranch) on a dirty repo are record-only", async () => {
		const scenario = await createProjectScenario({ hostOptions });
		dispose = scenario.dispose;
		const a = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "a",
		});
		const b = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "b",
		});
		writeFileSync(join(scenario.repo.repoPath, "dirty.txt"), "uncommitted");
		const branchesBefore = (await scenario.repo.git.branchLocal()).all;

		const legacy = await scenario.host.trpc.workspace.delete.mutate({
			id: a.workspace.id,
		});
		expect(legacy).toMatchObject({
			success: true,
			worktreeRemoved: false,
			branchDeleted: false,
			warnings: [],
		});

		const destroyed = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: b.workspace.id,
			deleteBranch: true,
			force: false,
		});
		expect(destroyed).toMatchObject({
			success: true,
			worktreeRemoved: false,
			branchDeleted: false,
			warnings: [],
		});

		expect(existsSync(join(scenario.repo.repoPath, "dirty.txt"))).toBe(true);
		expect((await scenario.repo.git.branchLocal()).all).toEqual(branchesBefore);
		expect(
			(await scenario.repo.git.revparse(["--abbrev-ref", "HEAD"])).trim(),
		).toBe("main");
		expect(liveRows(scenario.host.db)).toHaveLength(0);
	});

	test("10. inspect on a dirty repo reports a deletable local workspace with no warnings", async () => {
		const scenario = await createProjectScenario({ hostOptions });
		dispose = scenario.dispose;
		const a = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "a",
		});
		writeFileSync(join(scenario.repo.repoPath, "dirty.txt"), "uncommitted");
		await scenario.repo.commit("unpushed", { "c.txt": "c" });

		const preview = await scenario.host.trpc.workspaceCleanup.inspect.query({
			workspaceId: a.workspace.id,
		});
		expect(preview).toEqual({
			canDelete: true,
			reason: null,
			hasChanges: false,
			hasUnpushedCommits: false,
			sharesProjectCheckout: true,
		});
	});

	test("11. a worktree-typed row whose path is the repo root is treated as the checkout", async () => {
		const scenario = await createProjectScenario({ hostOptions });
		dispose = scenario.dispose;
		const { id } = seedWorkspace(scenario.host, {
			projectId: scenario.projectId,
			worktreePath: scenario.repo.repoPath,
			branch: "main",
			type: "worktree",
		});
		writeFileSync(join(scenario.repo.repoPath, "dirty.txt"), "uncommitted");

		const preview = await scenario.host.trpc.workspaceCleanup.inspect.query({
			workspaceId: id,
		});
		expect(preview.sharesProjectCheckout).toBe(true);

		const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: id,
			deleteBranch: true,
		});
		expect(result).toMatchObject({
			success: true,
			worktreeRemoved: false,
			branchDeleted: false,
		});
		expect(existsSync(join(scenario.repo.repoPath, ".git"))).toBe(true);
		expect(existsSync(join(scenario.repo.repoPath, "dirty.txt"))).toBe(true);
	});

	test("13. project.remove: local rows skip git worktree remove, worktree rows are removed, rows cascade", async () => {
		const scenario = await createFeatureWorktreeScenario({ hostOptions });
		dispose = scenario.dispose;
		const local = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "a",
		});
		expect(existsSync(scenario.worktreePath)).toBe(true);

		const result = await scenario.host.trpc.project.remove.mutate({
			projectId: scenario.projectId,
		});
		expect(result.success).toBe(true);
		expect(existsSync(scenario.repo.repoPath)).toBe(true);
		expect(existsSync(join(scenario.repo.repoPath, ".git"))).toBe(true);
		expect(existsSync(scenario.worktreePath)).toBe(false);
		const remaining = scenario.host.db.select().from(workspaces).all();
		expect(remaining.find((r) => r.id === local.workspace.id)).toBeUndefined();
		expect(
			remaining.find((r) => r.id === scenario.featureWorkspaceId),
		).toBeUndefined();
	});
});

describe("local workspaces: update, list, relocate", () => {
	let dispose: (() => Promise<void>) | null = null;
	afterEach(async () => {
		await dispose?.();
		dispose = null;
	});

	test("14. rename to an existing name is allowed; empty name is rejected", async () => {
		const scenario = await createProjectScenario({ hostOptions });
		dispose = scenario.dispose;
		const a = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "a",
		});
		await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "b",
		});
		const renamed = await scenario.host.trpc.workspace.update.mutate({
			id: a.workspace.id,
			name: "b",
		});
		expect(renamed.name).toBe("b");
		await expect(
			scenario.host.trpc.workspace.update.mutate({
				id: a.workspace.id,
				name: "",
			}),
		).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
	});

	test("15. workspace.list serves local rows with worktreeExists and projectName; tombstones only on opt-in", async () => {
		const scenario = await createProjectScenario({ hostOptions });
		dispose = scenario.dispose;
		const a = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "a",
		});
		const b = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "b",
		});
		await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: b.workspace.id,
		});

		const live = await scenario.host.trpc.workspace.list.query();
		expect(live.map((r) => r.id)).toEqual([a.workspace.id]);
		expect(live[0]).toMatchObject({
			type: "local",
			worktreeExists: true,
			worktreePath: scenario.repo.repoPath,
		});
		expect(live[0]?.projectName).toBeTruthy();

		const all = await scenario.host.trpc.workspace.list.query({
			includeArchived: true,
		});
		expect(all.find((r) => r.id === b.workspace.id)).toMatchObject({
			archiveReason: "deleted",
			worktreeExists: false,
		});
	});

	test("12. relocating the project moves existing local rows to the new path", async () => {
		const scenario = await createProjectScenario({ hostOptions });
		dispose = scenario.dispose;
		const a = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "a",
		});
		const moved = await createGitFixture();
		try {
			const setup = await scenario.host.trpc.project.setup.mutate({
				projectId: scenario.projectId,
				mode: { kind: "import", repoPath: moved.repoPath, allowRelocate: true },
			});
			expect(setup.repoPath).toBe(moved.repoPath);

			const row = liveRows(scenario.host.db).find(
				(r) => r.id === a.workspace.id,
			);
			expect(row?.worktreePath).toBe(moved.repoPath);
		} finally {
			moved.dispose();
		}
	});
});

describe("local workspaces: migration 0035", () => {
	const tempDirs: string[] = [];
	afterEach(() => {
		for (const dir of tempDirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});

	function folderThrough(tag: string): string {
		const journal = JSON.parse(
			readFileSync(join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"),
		) as {
			entries: Array<{
				idx: number;
				version: string;
				when: number;
				tag: string;
			}>;
		};
		const end = journal.entries.findIndex((entry) => entry.tag === tag);
		expect(end).toBeGreaterThan(-1);
		const entries = journal.entries.slice(0, end + 1);
		const dir = mkdtempSync(join(tmpdir(), "host-migrations-"));
		tempDirs.push(dir);
		mkdirSync(join(dir, "meta"));
		for (const entry of entries) {
			copyFileSync(
				join(MIGRATIONS_FOLDER, `${entry.tag}.sql`),
				join(dir, `${entry.tag}.sql`),
			);
		}
		writeFileSync(
			join(dir, "meta/_journal.json"),
			JSON.stringify({ version: "7", dialect: "sqlite", entries }),
		);
		return dir;
	}

	test("16. main rows become local, branch-named rows are renamed, custom names survive, singleton index gone", () => {
		const sqlite = new BunDatabase(":memory:");
		sqlite.exec("PRAGMA foreign_keys = OFF");
		migrate(drizzle(sqlite), {
			migrationsFolder: folderThrough("0034_terminal_session_custom_title"),
		});
		sqlite.exec(
			"INSERT INTO projects (id, repo_path, created_at, updated_at) VALUES ('p1', '/repo1', 1, 1), ('p2', '/repo2', 1, 1)",
		);
		sqlite.exec(
			"INSERT INTO workspaces (id, project_id, worktree_path, branch, name, type, created_at) VALUES " +
				"('w1', 'p1', '/repo1', 'main', 'main', 'main', 1), " +
				"('w2', 'p2', '/repo2', 'develop', 'Trunk work', 'main', 1), " +
				"('w3', 'p1', '/repo1/.worktrees/feat', 'feat', 'feat', 'worktree', 1)",
		);
		expect(() =>
			sqlite.exec(
				"INSERT INTO workspaces (id, project_id, worktree_path, branch, name, type, created_at) VALUES ('w4', 'p1', '/repo1', 'main', 'main', 'main', 1)",
			),
		).toThrow();

		migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_FOLDER });

		const rows = sqlite
			.prepare("SELECT id, name, type FROM workspaces ORDER BY id")
			.all() as Array<{ id: string; name: string; type: string }>;
		expect(rows).toEqual([
			{ id: "w1", name: "local", type: "local" },
			{ id: "w2", name: "Trunk work", type: "local" },
			{ id: "w3", name: "feat", type: "worktree" },
		]);
		expect(() =>
			sqlite.exec(
				"INSERT INTO workspaces (id, project_id, worktree_path, branch, name, type, created_at) VALUES ('w5', 'p1', '/repo1', 'main', 'local 2', 'local', 1)",
			),
		).not.toThrow();
		const indexes = (
			sqlite
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'workspaces'",
				)
				.all() as Array<{ name: string }>
		).map((r) => r.name);
		expect(indexes).not.toContain("workspaces_one_main_per_project");
	});
});

describe("local workspaces: sessions and sandbox seed", () => {
	let dispose: (() => Promise<void>) | null = null;
	afterEach(async () => {
		await dispose?.();
		dispose = null;
	});

	test("18. sandbox self-seed writes a local workspace on the checkout and is idempotent", async () => {
		const host = await createTestHost(hostOptions);
		dispose = () => host.dispose();
		const identity = {
			workspaceId: randomUUID(),
			worktreePath: "/data/repo",
			workspaceName: "sandbox ws",
			projectName: "sandbox project",
			branch: "main",
		} as Parameters<typeof runSandboxSelfSeed>[1];
		runSandboxSelfSeed(host.db, identity);
		runSandboxSelfSeed(host.db, identity);
		const rows = host.db.select().from(workspaces).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: identity.workspaceId,
			type: "local",
			worktreePath: "/data/repo",
			name: "sandbox ws",
		});
		// A sandbox's only workspace can still be retired record-only.
		const preview = await host.trpc.workspaceCleanup.inspect.query({
			workspaceId: identity.workspaceId,
		});
		expect(preview.sharesProjectCheckout).toBe(true);
	});
});
