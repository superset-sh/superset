import { expect, mock, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import type { HostServiceContext } from "../../../types";
import type { WorkerTaskDefinition } from "../../../workers/define-worker-task";
import { createGitlabWorkerGit } from "./gitlab-worker-git";

const storage = { commonDir: "/owned/physical.git", device: 1, inode: 7 };
function fakePool() {
	const calls: Array<{ type: string; input: unknown; options: unknown }> = [];
	let healthError: Error | undefined;
	return {
		calls,
		quarantine: () => {
			healthError = new Error("owned quarantine");
		},
		acquireMutationScope: async () => ({ release: () => {} }),
		assertMutationScopeHealthy: () => {
			if (healthError) throw healthError;
		},
		run: async <T, R>(
			task: WorkerTaskDefinition<T, R>,
			input: T,
			options: unknown,
		) => {
			calls.push({ type: task.type, input, options });
			if (task.type === "git/resolveRepository")
				return JSON.parse(
					JSON.stringify({ repoPath: "/owned/root", remotes: [], storage }),
				);
			return JSON.parse(JSON.stringify("owned result"));
		},
	};
}
test("worker runner snapshots argv and env and preserves long-fetch budget", async () => {
	const pool = fakePool();
	const git = await createGitlabWorkerGit("/owned/root", pool);
	const env = { TOKEN_FIXTURE: "first" },
		argv = ["-c", "http.followRedirects=false", "fetch", "remote"];
	git.env(env);
	const pending = git.raw(argv);
	env.TOKEN_FIXTURE = "changed";
	argv[3] = "changed";
	git.env({ TOKEN_FIXTURE: "next" });
	expect(await pending).toBe("owned result");
	expect(pool.calls[1]).toEqual({
		type: "git/gitlabRaw",
		input: {
			repoPath: "/owned/root",
			storage,
			argv: ["-c", "http.followRedirects=false", "fetch", "remote"],
			gitEnv: { TOKEN_FIXTURE: "first" },
		},
		options: { timeoutMs: 900000 },
	});
	await git.raw(["config", "name", "value"]);
	expect(pool.calls[2]?.options).toEqual({ timeoutMs: 60000 });
});
test("quarantine blocks later queued commands and final handoff health check", async () => {
	const pool = fakePool(),
		git = await createGitlabWorkerGit("/owned/root", pool);
	pool.quarantine();
	await expect(git.raw(["worktree", "remove", "path"])).rejects.toThrow(
		"owned quarantine",
	);
	expect(() => git.assertHealthy()).toThrow("owned quarantine");
	expect(pool.calls).toHaveLength(1);
});

test("commands remain ordered and an ordinary command rejection permits cleanup", async () => {
	const pool = fakePool();
	const originalRun = pool.run;
	let release: () => void = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const order: string[] = [];
	pool.run = async (task, input, options) => {
		if (task.type !== "git/gitlabRaw") return originalRun(task, input, options);
		const request = JSON.parse(JSON.stringify(input));
		order.push(request.argv[0]);
		if (request.argv[0] === "first") {
			await held;
			throw new Error("ordinary Git command failure");
		}
		return originalRun(task, input, options);
	};
	const git = await createGitlabWorkerGit("/owned/root", pool);
	const first = git.raw(["first"]).catch((error) => error.message);
	const cleanup = git.raw(["worktree", "remove", "owned"]);
	await Promise.resolve();
	expect(order).toEqual(["first"]);
	release();
	expect(await first).toBe("ordinary Git command failure");
	expect(await cleanup).toBe("owned result");
	expect(order).toEqual(["first", "worktree"]);
	git.assertHealthy();
});

test("uncertain command failure blocks already queued rollback after quarantine", async () => {
	const pool = fakePool();
	const originalRun = pool.run;
	pool.run = async (task, input, options) => {
		if (task.type !== "git/gitlabRaw") return originalRun(task, input, options);
		pool.quarantine();
		throw new Error("owned uncertain command failure");
	};
	const git = await createGitlabWorkerGit("/owned/root", pool);
	const outcomes = await Promise.allSettled([
		git.raw(["worktree", "add", "owned"]),
		git.raw(["worktree", "remove", "owned"]),
	]);
	expect(outcomes.map((outcome) => outcome.status)).toEqual([
		"rejected",
		"rejected",
	]);
	expect(pool.calls).toHaveLength(1);
	expect(() => git.assertHealthy()).toThrow("owned quarantine");
});

if (process.env.SUPERSET_GITLAB_ADOPTION_FIXTURE !== "owned") {
	test("actual adoption rejects quarantined best-effort config before persistence", () => {
		const cwd = mkdtempSync("/tmp/superset-gitlab-adoption-");
		try {
			const child = spawnSync(
				process.execPath,
				["test", "--no-env-file", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_GITLAB_ADOPTION_FIXTURE: "owned",
					},
					stdio: "pipe",
					timeout: 10000,
				},
			);
			if (child.stdout) process.stdout.write(child.stdout);
			if (child.stderr) process.stderr.write(child.stderr);
			if (child.error) throw child.error;
			expect(child.status).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
} else {
	globalThis.fetch = Object.assign(
		async () => {
			throw new Error("Owned adoption denied network");
		},
		{ preconnect: () => {} },
	);
	const projectFixture = {
		requireLocalProject: () => ({ id: "project", repoPath: "/owned/root" }),
	};
	mock.module(
		"../workspace-creation/shared/local-project",
		() => projectFixture,
	);
	const projectModule = await import(
		"../workspace-creation/shared/local-project"
	);
	expect(
		Object.is(
			projectModule.requireLocalProject,
			projectFixture.requireLocalProject,
		),
	).toBe(true);
	let writes = 0;
	const row = {
		id: "workspace",
		projectId: "project",
		type: "worktree",
		branch: "Feature",
		worktreePath: "/owned/linked",
	};
	const storeFixture = {
		getLocalWorkspace: () => undefined,
		deleteLocalWorkspace: () => {
			writes++;
		},
		updateLocalWorkspace: () => {
			writes++;
			return row;
		},
		insertLocalWorkspace: () => {
			writes++;
			return row;
		},
		toCloudShape: () => row,
	};
	mock.module("../../../workspaces/local-workspace-store", () => storeFixture);
	const storeModule = await import("../../../workspaces/local-workspace-store");
	for (const [name, value] of Object.entries(storeFixture))
		expect(Object.is(Reflect.get(storeModule, name), value)).toBe(true);
	const { adoptExistingWorktree } = await import(
		"../workspace-creation/shared/adopt-existing-worktree"
	);
	const ctx = {
		db: {
			select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }),
		},
		organizationId: "org",
	} as unknown as HostServiceContext;
	for (const uncertain of [false, true])
		test(`actual adoption ${uncertain ? "rejects quarantine" : "retains ordinary best-effort config failure"}`, async () => {
			writes = 0;
			let calls = 0;
			const git = {
				raw: async () => {
					calls++;
					throw new Error("owned config error");
				},
				assertHealthy: () => {
					if (uncertain) throw new Error("owned quarantined storage");
				},
			};
			const outcome = adoptExistingWorktree({
				ctx,
				git,
				projectId: "project",
				branch: "Feature",
				worktreePath: "/owned/linked",
				workspaceName: "Feature",
				baseBranch: "main",
				existingWorkspaceId: "workspace",
			});
			if (uncertain) {
				await expect(outcome).rejects.toThrow("owned quarantined storage");
				expect(writes).toBe(0);
			} else {
				expect((await outcome).alreadyExists).toBe(true);
				expect(writes).toBe(1);
			}
			expect(calls).toBe(1);
		});
}
