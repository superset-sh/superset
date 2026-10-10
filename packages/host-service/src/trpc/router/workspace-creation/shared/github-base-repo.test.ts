import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Octokit } from "@octokit/rest";
import { type SimpleGit, simpleGit } from "simple-git";
import { getGitHubRemotes } from "../../project/utils/git-remote";
import {
	getForkParent,
	getGhDefaultRepo,
	resetForkParentCacheForTests,
} from "./github-base-repo";

describe("getGhDefaultRepo", () => {
	let dir: string;
	let git: SimpleGit;

	beforeEach(async () => {
		dir = mkdtempSync(join(tmpdir(), "superset-gh-default-"));
		git = simpleGit(dir);
		await git.init();
		await git.addRemote("origin", "https://github.com/me/superset.git");
		await git.addRemote("upstream", "git@github.com:superset-sh/superset.git");
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const read = async () => getGhDefaultRepo(git, await getGitHubRemotes(git));

	test("is null when gh repo set-default hasn't run", async () => {
		expect(await read()).toBeNull();
	});

	test("resolves the remote marked base", async () => {
		await git.raw(["config", "remote.upstream.gh-resolved", "base"]);
		expect(await read()).toEqual({ owner: "superset-sh", name: "superset" });
	});

	test("resolves an OWNER/REPO slug", async () => {
		await git.raw(["config", "remote.origin.gh-resolved", "acme/widgets"]);
		expect(await read()).toEqual({ owner: "acme", name: "widgets" });
	});

	test("ignores a base marker on a remote that isn't on GitHub", async () => {
		await git.addRemote("gitlab", "https://gitlab.com/me/superset.git");
		await git.raw(["config", "remote.gitlab.gh-resolved", "base"]);
		expect(await read()).toBeNull();
	});
});

describe("getForkParent", () => {
	afterEach(() => {
		resetForkParentCacheForTests();
	});

	const fork = { owner: "me", name: "superset" };
	const forkResponse = {
		fork: true,
		parent: { name: "superset", owner: { login: "superset-sh" } },
	};
	const unusedGithub = () => Promise.reject(new Error("octokit not expected"));

	test("returns the parent of a fork", async () => {
		const execGh = mock(async () => forkResponse);
		expect(await getForkParent(fork, { execGh, github: unusedGithub })).toEqual(
			{ owner: "superset-sh", name: "superset" },
		);
		expect(execGh).toHaveBeenCalledWith(["api", "repos/me/superset"]);
	});

	test("is null for a repo that isn't a fork", async () => {
		const execGh = mock(async () => ({ fork: false }));
		expect(
			await getForkParent(fork, { execGh, github: unusedGithub }),
		).toBeNull();
	});

	test("falls back to Octokit when gh fails", async () => {
		const execGh = mock(async () => {
			throw new Error("gh: not logged in");
		});
		const get = mock(async () => ({ data: forkResponse }));
		const github = async () => ({ repos: { get } }) as unknown as Octokit;
		expect(await getForkParent(fork, { execGh, github })).toEqual({
			owner: "superset-sh",
			name: "superset",
		});
		expect(get).toHaveBeenCalledWith({ owner: "me", repo: "superset" });
	});

	test("asks GitHub once per repo", async () => {
		const execGh = mock(async () => forkResponse);
		await getForkParent(fork, { execGh, github: unusedGithub });
		await getForkParent(
			{ owner: "ME", name: "Superset" },
			{ execGh, github: unusedGithub },
		);
		expect(execGh).toHaveBeenCalledTimes(1);
	});

	test("doesn't cache a failed lookup", async () => {
		const failing = mock(async () => {
			throw new Error("offline");
		});
		await expect(
			getForkParent(fork, { execGh: failing, github: unusedGithub }),
		).rejects.toThrow("octokit not expected");

		const execGh = mock(async () => forkResponse);
		expect(await getForkParent(fork, { execGh, github: unusedGithub })).toEqual(
			{ owner: "superset-sh", name: "superset" },
		);
	});
});
