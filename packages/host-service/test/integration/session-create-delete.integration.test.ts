import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import { defaultSessionsRoot } from "../../src/trpc/router/workspace-creation/shared/session-paths";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

/**
 * Session workspaces: project-less rows whose worktreePath is a standalone
 * git repo under `~/.superset/sessions`. Like the worktree suites, these
 * write into the real managed root and clean up after themselves.
 */
describe("workspaces.createSession + delete integration", () => {
	let host: TestHost | undefined;
	const createdPaths: string[] = [];

	// createSession makes an initial commit; CI runners have no global git
	// identity, so provide one via env for this process's git spawns (same
	// pattern as the project-setup empty-mode test).
	const savedEnv: Record<string, string | undefined> = {};
	beforeAll(() => {
		for (const key of [
			"GIT_AUTHOR_NAME",
			"GIT_AUTHOR_EMAIL",
			"GIT_COMMITTER_NAME",
			"GIT_COMMITTER_EMAIL",
		]) {
			savedEnv[key] = process.env[key];
		}
		process.env.GIT_AUTHOR_NAME = "Test Runner";
		process.env.GIT_AUTHOR_EMAIL = "test@superset.sh";
		process.env.GIT_COMMITTER_NAME = "Test Runner";
		process.env.GIT_COMMITTER_EMAIL = "test@superset.sh";
	});
	afterAll(() => {
		for (const [key, value] of Object.entries(savedEnv)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	afterEach(async () => {
		if (host) {
			await host.dispose();
			host = undefined;
		}
		for (const path of createdPaths.splice(0)) {
			if (
				path.startsWith(defaultSessionsRoot()) &&
				path !== defaultSessionsRoot()
			) {
				rmSync(path, { recursive: true, force: true });
			}
		}
	});

	async function createSession(input: Record<string, unknown> = {}) {
		if (!host) host = await createTestHost();
		const result = await host.trpc.workspaces.createSession.mutate(input);
		if (result.workspace) {
			const row = host.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, result.workspace.id))
				.get();
			if (row?.worktreePath) createdPaths.push(row.worktreePath);
		}
		return result;
	}

	test("creates a git-initialized folder and a project-less session row", async () => {
		const result = await createSession({ name: "my scratch space" });

		expect(result.workspace.projectId).toBeNull();
		expect(result.workspace.type).toBe("session");
		expect(result.workspace.branch).toBe("main");
		expect(result.workspace.name).toBe("my scratch space");

		const row = host?.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		expect(row?.projectId).toBeNull();
		expect(row?.type).toBe("session");
		expect(dirname(row?.worktreePath ?? "")).toBe(defaultSessionsRoot());
		expect(basename(row?.worktreePath ?? "")).toBe("my-scratch-space");
		expect(existsSync(join(row?.worktreePath ?? "", ".git"))).toBe(true);

		const log = execSync("git log --oneline", {
			cwd: row?.worktreePath,
			encoding: "utf8",
		});
		expect(log).toContain("Initial commit");
		const branch = execSync("git branch --show-current", {
			cwd: row?.worktreePath,
			encoding: "utf8",
		}).trim();
		expect(branch).toBe("main");
	});

	test("deduplicates folder names against existing sessions", async () => {
		const first = await createSession({ name: "dupe target" });
		const second = await createSession({ name: "dupe target" });

		const firstRow = host?.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, first.workspace.id))
			.get();
		const secondRow = host?.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, second.workspace.id))
			.get();
		expect(basename(firstRow?.worktreePath ?? "")).toBe("dupe-target");
		expect(basename(secondRow?.worktreePath ?? "")).toBe("dupe-target-2");
		expect(existsSync(secondRow?.worktreePath ?? "")).toBe(true);
	});

	test("sanitizes hostile names so the folder stays inside the sessions root", async () => {
		const result = await createSession({ name: "../../../etc passwd" });

		const row = host?.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		expect(dirname(row?.worktreePath ?? "")).toBe(defaultSessionsRoot());
		expect(basename(row?.worktreePath ?? "")).not.toContain("..");
	});

	test("destroy removes the folder and archives the row; cloud is never called", async () => {
		// No apiOverrides: any cloud call would throw inside the saga and
		// surface as a warning — assert none appear.
		const result = await createSession({ name: "delete me" });
		const row = host?.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		expect(existsSync(row?.worktreePath ?? "")).toBe(true);

		const destroyed = await host?.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: result.workspace.id,
			deleteBranch: false,
			force: false,
		});
		expect(destroyed?.success).toBe(true);
		expect(destroyed?.worktreeRemoved).toBe(true);
		expect(destroyed?.cloudDeleted).toBe(false);
		expect(destroyed?.warnings).toEqual([]);
		expect(existsSync(row?.worktreePath ?? "")).toBe(false);

		// Sessions tombstone like any workspace; no PR link means the
		// reason is always "deleted".
		const tombstone = host?.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		expect(tombstone?.archivedAt).not.toBeNull();
		expect(tombstone?.archiveReason).toBe("deleted");
	});

	test("dirty session blocks destroy with CONFLICT; force removes it", async () => {
		const result = await createSession({ name: "dirty session" });
		const row = host?.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		writeFileSync(join(row?.worktreePath ?? "", "scratch.txt"), "unsaved");

		await expect(
			host?.trpc.workspaceCleanup.destroy.mutate({
				workspaceId: result.workspace.id,
				deleteBranch: false,
				force: false,
			}),
		).rejects.toThrow(/uncommitted changes/i);
		expect(existsSync(row?.worktreePath ?? "")).toBe(true);

		const destroyed = await host?.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: result.workspace.id,
			deleteBranch: false,
			force: true,
		});
		expect(destroyed?.success).toBe(true);
		expect(existsSync(row?.worktreePath ?? "")).toBe(false);
	});

	test("inspect: fresh session reports no unpushed commits; committed work does", async () => {
		const result = await createSession({ name: "inspect me" });
		const row = host?.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();

		const fresh = await host?.trpc.workspaceCleanup.inspect.query({
			workspaceId: result.workspace.id,
		});
		expect(fresh?.canDelete).toBe(true);
		expect(fresh?.hasChanges).toBe(false);
		expect(fresh?.hasUnpushedCommits).toBe(false);

		writeFileSync(join(row?.worktreePath ?? "", "work.txt"), "real work");
		// Identity inline via -c: Bun's execSync does not reliably see the
		// beforeAll process.env mutations that the in-process host spawns do.
		execSync(
			'git add . && git -c user.name="Test Runner" -c user.email="test@superset.sh" commit -m work',
			{ cwd: row?.worktreePath },
		);

		const withWork = await host?.trpc.workspaceCleanup.inspect.query({
			workspaceId: result.workspace.id,
		});
		expect(withWork?.hasUnpushedCommits).toBe(true);
	});

	test("corrupt worktreePath outside the sessions root is never rm'd", async () => {
		if (!host) host = await createTestHost();
		const result = await createSession({ name: "hijack" });

		// Simulate a corrupt row pointing at user data outside the managed
		// root — in an isolated temp dir, never the real home directory.
		const outsideDir = mkdtempSync(join(tmpdir(), "session-guard-"));
		const outsidePath = join(outsideDir, "not-a-session");
		writeFileSync(outsidePath, "user data");
		host.db
			.update(workspaces)
			.set({ worktreePath: outsidePath })
			.where(eq(workspaces.id, result.workspace.id))
			.run();
		try {
			const destroyed = await host.trpc.workspaceCleanup.destroy.mutate({
				workspaceId: result.workspace.id,
				deleteBranch: false,
				force: true,
			});
			expect(destroyed?.success).toBe(true);
			expect(destroyed?.worktreeRemoved).toBe(false);
			expect(
				destroyed?.warnings.some((warning) =>
					warning.includes("not inside the managed sessions root"),
				),
			).toBe(true);
			expect(existsSync(outsidePath)).toBe(true);
		} finally {
			rmSync(outsideDir, { recursive: true, force: true });
		}
	});
});
