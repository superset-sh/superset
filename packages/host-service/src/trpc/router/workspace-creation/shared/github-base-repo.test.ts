import { afterEach, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { getGitHubRemotes } from "../../project/utils/git-remote";
import {
	getForkParent,
	getGhDefaultRepo,
	resetForkParentCacheForTests,
} from "./github-base-repo";

afterEach(() => {
	resetForkParentCacheForTests();
});

const noOctokit = () => Promise.reject(new Error("octokit not expected"));

test("getGhDefaultRepo resolves the remote gh repo set-default marked base", async () => {
	const dir = mkdtempSync(join(tmpdir(), "superset-gh-default-"));
	try {
		const git = simpleGit(dir);
		await git.init();
		await git.addRemote("origin", "https://github.com/me/superset.git");
		await git.addRemote("upstream", "git@github.com:superset-sh/superset.git");
		await git.raw(["config", "remote.upstream.gh-resolved", "base"]);

		expect(await getGhDefaultRepo(git, await getGitHubRemotes(git))).toEqual({
			owner: "superset-sh",
			name: "superset",
		});
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("getForkParent returns the parent of a fork", async () => {
	const execGh = mock(async () => ({
		parent: { name: "superset", owner: { login: "superset-sh" } },
	}));
	expect(
		await getForkParent(
			{ owner: "me", name: "superset" },
			{ execGh, github: noOctokit },
		),
	).toEqual({ owner: "superset-sh", name: "superset" });
});

test("getForkParent is null for a repo that isn't a fork", async () => {
	const execGh = mock(async () => ({ fork: false }));
	expect(
		await getForkParent(
			{ owner: "superset-sh", name: "superset" },
			{ execGh, github: noOctokit },
		),
	).toBeNull();
});
