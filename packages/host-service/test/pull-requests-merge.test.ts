import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projects, workspaces } from "../src/db/schema";
import { createTestHost } from "./helpers/createTestHost";

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("pullRequests.mergePR", () => {
	test("uses glab for a GitLab workspace and preserves the selected merge mode", async () => {
		const repoPath = mkdtempSync(join(tmpdir(), "gitlab-merge-test-"));
		tempDirs.push(repoPath);
		execFileSync("git", ["init", repoPath]);
		execFileSync("git", [
			"-C",
			repoPath,
			"remote",
			"add",
			"origin",
			"https://gitlab.com/acme/app.git",
		]);

		const calls: Array<{ args: string[]; cwd?: string }> = [];
		const host = await createTestHost({
			execGlab: async (args, options) => {
				calls.push({
					args,
					cwd: (options as { cwd?: string } | undefined)?.cwd,
				});
				return "";
			},
		});
		try {
			host.db
				.insert(projects)
				.values({
					id: "project",
					name: "GitLab project",
					repoPath,
					repoProvider: "gitlab",
					repoOwner: "acme",
					repoName: "app",
					repoUrl: "https://gitlab.com/acme/app",
					remoteName: "origin",
				})
				.run();
			host.db
				.insert(workspaces)
				.values({
					id: "workspace",
					projectId: "project",
					worktreePath: repoPath,
					branch: "feature",
				})
				.run();

			await host.trpc.pullRequests.mergePR.mutate({
				workspaceId: "workspace",
				prNumber: 42,
				mergeMethod: "squash",
			});

			expect(calls).toEqual([
				{
					args: [
						"mr",
						"merge",
						"42",
						"--repo",
						"acme/app",
						"--auto-merge=false",
						"--yes",
						"--squash",
					],
					cwd: realpathSync(repoPath),
				},
			]);
		} finally {
			await host.dispose();
		}
	});

	test("keeps GitHub workspaces on the existing Octokit merge path", async () => {
		const repoPath = mkdtempSync(join(tmpdir(), "github-merge-test-"));
		tempDirs.push(repoPath);
		execFileSync("git", ["init", repoPath]);
		execFileSync("git", [
			"-C",
			repoPath,
			"remote",
			"add",
			"origin",
			"https://github.com/acme/app.git",
		]);

		const mergeCalls: unknown[] = [];
		const host = await createTestHost({
			githubFactory: async () => ({
				pulls: {
					merge: async (input: unknown) => {
						mergeCalls.push(input);
						return { data: { merged: true } };
					},
				},
			}),
		});
		try {
			host.db
				.insert(projects)
				.values({
					id: "project",
					name: "GitHub project",
					repoPath,
					repoProvider: "github",
					repoOwner: "acme",
					repoName: "app",
					repoUrl: "https://github.com/acme/app",
					remoteName: "origin",
				})
				.run();
			host.db
				.insert(workspaces)
				.values({
					id: "workspace",
					projectId: "project",
					worktreePath: repoPath,
					branch: "feature",
				})
				.run();

			await host.trpc.pullRequests.mergePR.mutate({
				workspaceId: "workspace",
				prNumber: 42,
				mergeMethod: "rebase",
			});

			expect(mergeCalls).toEqual([
				{
					owner: "acme",
					repo: "app",
					pull_number: 42,
					merge_method: "rebase",
				},
			]);
		} finally {
			await host.dispose();
		}
	});
});
