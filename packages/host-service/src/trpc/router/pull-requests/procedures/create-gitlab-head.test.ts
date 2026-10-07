import { expect, mock, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";

if (process.env.SUPERSET_GITLAB_HEAD_WORKER_TEST !== "owned") {
	test("GitLab push head uses isolated worker caller controls", () => {
		const cwd = mkdtempSync("/tmp/superset-gitlab-head-worker-");
		try {
			const child = spawnSync(
				process.execPath,
				["test", "--no-env-file", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_GITLAB_HEAD_WORKER_TEST: "owned",
					},
					stdio: "pipe",
					timeout: 15000,
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
			throw new Error("Unexpected head-worker network");
		},
		{ preconnect: () => {} },
	);
	const gitFixture = {
		createUserSimpleGit: () => {
			throw new Error("main-thread Git construction");
		},
	};
	mock.module("../../../../runtime/git/simple-git", () => gitFixture);
	const gitModule = await import("../../../../runtime/git/simple-git");
	expect(
		Object.is(gitModule.createUserSimpleGit, gitFixture.createUserSimpleGit),
	).toBe(true);
	let pushUrl = "https://gl.example.test:8443/Fork/Widget.git";
	const calls: Array<{ type: string; input: unknown; options: unknown }> = [];
	const poolFixture = {
		getHostWorkerPool: () => ({
			run: async (task: { type: string }, input: unknown, options: unknown) => {
				calls.push({ type: task.type, input, options });
				return { pushUrl };
			},
		}),
	};
	mock.module("../../../../workers/host-worker-pool", () => poolFixture);
	const poolModule = await import("../../../../workers/host-worker-pool");
	expect(
		Object.is(poolModule.getHostWorkerPool, poolFixture.getHostWorkerPool),
	).toBe(true);
	const { createGitLabHead } = await import("./create-gitlab-head");
	const repo = {
		provider: "gitlab" as const,
		host: "gl.example.test:8443",
		owner: "Team",
		name: "Widget",
		url: "https://gl.example.test:8443/Team/Widget",
		repoPath: "/owned/root",
		remoteName: "gitlab",
	};
	test("selected worker URL carries fork identity and original branch", async () => {
		expect(await createGitLabHead("/owned/worktree", repo, "Feature")).toEqual({
			owner: "Fork",
			repo: "Widget",
			branch: "Feature",
		});
		expect(calls.at(-1)).toEqual({
			type: "git/gitlabPushHead",
			input: {
				worktreePath: "/owned/worktree",
				branch: "Feature",
				remoteName: "gitlab",
			},
			options: { timeoutMs: 15000 },
		});
	});
	test("already resolved Git credential environment reaches readonly discovery", async () => {
		await createGitLabHead("/owned/worktree", repo, "Feature", {
			OWNED_FIXTURE_AUTHORITY: "exact-host",
		});
		expect(calls.at(-1)?.input).toEqual({
			worktreePath: "/owned/worktree",
			branch: "Feature",
			remoteName: "gitlab",
			gitEnv: { OWNED_FIXTURE_AUTHORITY: "exact-host" },
		});
	});
	test("SSH transport matches the selected custom web authority by hostname", async () => {
		pushUrl = "ssh://git@gl.example.test:2222/Fork/Widget.git";
		expect(await createGitLabHead("/owned/worktree", repo, "Feature")).toEqual({
			owner: "Fork",
			repo: "Widget",
			branch: "Feature",
		});
		pushUrl = "https://gl.example.test:9443/Fork/Widget.git";
		await expect(
			createGitLabHead("/owned/worktree", repo, "Feature"),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
	test("wrong instance worker result rejects before a provider mutation", async () => {
		pushUrl = "https://other.example.test/Fork/Widget.git";
		await expect(
			createGitLabHead("/owned/worktree", repo, "Feature"),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
}
