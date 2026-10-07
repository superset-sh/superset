import { expect, mock, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.env.SUPERSET_GITLAB_ENV_FIXTURE !== "1") {
	test("native Git tasks accept resolved environments with the real factory", () => {
		const cwd = mkdtempSync(join(tmpdir(), "superset-gitlab-env-wrapper-"));
		try {
			const child = spawnSync(
				process.execPath,
				["--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: tmpdir(),
						SUPERSET_GITLAB_ENV_FIXTURE: "1",
					},
					encoding: "utf8",
					timeout: 30_000,
				},
			);
			process.stdout.write(child.stdout);
			process.stderr.write(child.stderr);
			expect(child.status).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 35_000);
} else {
	const dotenvName: string = "dotenv";
	mock.module(dotenvName, () => ({ config: () => ({ parsed: {} }) }));
	globalThis.fetch = Object.assign(
		async () => {
			throw new Error("Unexpected fixture network");
		},
		{ preconnect: () => {} },
	);
	const { gitResolveRepositoryTask, gitGitlabPushHeadTask, gitGitlabRawTask } =
		await import("./git");
	const gitEnv = {
		PATH: process.env.PATH ?? "/usr/bin:/bin",
		GIT_CONFIG_GLOBAL: "/dev/null",
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_TERMINAL_PROMPT: "0",
		GIT_OPTIONAL_LOCKS: "0",
		LC_ALL: "C",
	};
	for (const operation of ["resolve", "push", "raw"] as const) {
		test(`${operation} uses the exact resolved Git environment without a late guard failure`, async () => {
			const repoPath = mkdtempSync(join(tmpdir(), "superset-gitlab-env-repo-"));
			try {
				const git = (...args: string[]) =>
					execFileSync("git", args, {
						cwd: repoPath,
						env: gitEnv,
						encoding: "utf8",
					});
				git("init", "--initial-branch=feature");
				git(
					"remote",
					"add",
					"origin",
					"https://git.example.test:8443/Team/Repo.git",
				);
				if (operation === "resolve") {
					const result = await gitResolveRepositoryTask.handler({
						repoPath,
						includeStorage: true,
						gitEnv,
					});
					expect(result.repoPath).toBe(realpathSync(repoPath));
					expect(result.remotes[0]?.[1]).toMatchObject({
						host: "git.example.test:8443",
						owner: "Team",
						name: "Repo",
					});
					expect(result.storage?.commonDir).toBe(
						realpathSync(join(repoPath, ".git")),
					);
				} else if (operation === "push") {
					expect(
						await gitGitlabPushHeadTask.handler({
							worktreePath: repoPath,
							branch: "feature",
							remoteName: "origin",
							gitEnv,
						}),
					).toEqual({
						pushUrl: "https://git.example.test:8443/Team/Repo.git\n",
					});
				} else {
					const commonDir = realpathSync(join(repoPath, ".git"));
					const { dev: device, ino: inode } = statSync(commonDir);
					expect(
						await gitGitlabRawTask.handler({
							repoPath: realpathSync(repoPath),
							storage: { commonDir, device, inode },
							argv: ["config", "--get", "remote.origin.url"],
							gitEnv,
						}),
					).toBe("https://git.example.test:8443/Team/Repo.git\n");
				}
			} finally {
				rmSync(repoPath, { recursive: true, force: true });
			}
		});
	}
}
