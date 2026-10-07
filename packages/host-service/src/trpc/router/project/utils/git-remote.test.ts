import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ParsedRemote, parseGitRemote } from "@superset/shared/git-remote";
import { simpleGit } from "simple-git";
import {
	findMatchingRepoRemote,
	getAllRepoRemotes,
	getGitHubRemotes,
	getRepoRemotes,
} from "./git-remote";

const directories: string[] = [];
afterEach(() => {
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

function remote(url: string): ParsedRemote {
	const parsed = parseGitRemote(url);
	if (!parsed) throw new Error(`Invalid test remote: ${url}`);
	return parsed;
}

test("reads all providers from real Git config, retaining nested groups and HTTPS ports", async () => {
	const directory = mkdtempSync(join(tmpdir(), "superset-remote-identity-"));
	directories.push(directory);
	const git = simpleGit(directory);
	await git.init();
	await git.addRemote(
		"origin",
		"https://git.example.test:8443/team/sub/app.git",
	);
	await git.addRemote("github.url", "git@github.com:Team/App.git");
	await git.addRemote("local", "file:///tmp/local.git");
	await git.raw(["config", "remote.origin.promisor", "true"]);
	const remotes = await getRepoRemotes(git);
	expect([...remotes.keys()]).toEqual(["origin", "github.url"]);
	expect(remotes.get("origin")).toEqual(
		remote("https://git.example.test:8443/team/sub/app.git"),
	);
	expect(remotes.get("github.url")).toEqual(
		remote("git@github.com:Team/App.git"),
	);
	expect([...(await getGitHubRemotes(git)).keys()]).toEqual(["github.url"]);
});

test("selects the full identity among identical slugs on different hosts", () => {
	const expected = remote("https://second.example.test/group/app");
	expect(
		findMatchingRepoRemote(
			new Map([
				["first", remote("https://first.example.test/group/app")],
				["second", expected],
			]),
			expected,
		),
	).toBe("second");
});

test("does not fall back to a matching slug on an unrelated host", () => {
	expect(
		findMatchingRepoRemote(
			new Map([["origin", remote("https://first.example.test/group/app")]]),
			remote("https://second.example.test/group/app"),
		),
	).toBeNull();
});

test("includes provider even when the host and slug match", () => {
	const parsed = remote("https://git.example.test/group/app");
	expect(
		findMatchingRepoRemote(
			new Map([
				["github", { ...parsed, provider: "github" }],
				["gitlab", { ...parsed, provider: "gitlab" }],
			]),
			{ ...parsed, provider: "gitlab" },
		),
	).toBe("gitlab");
});

test("distinguishes HTTPS ports", () => {
	expect(
		findMatchingRepoRemote(
			new Map([
				["default", remote("https://git.example.test/group/app")],
				["custom", remote("https://git.example.test:8443/group/app")],
			]),
			remote("https://git.example.test:8443/group/app"),
		),
	).toBe("custom");
});

test("keeps GitHub case-insensitive matching", () => {
	expect(
		findMatchingRepoRemote(
			new Map([["origin", remote("https://github.com/Team/App")]]),
			remote("https://github.com/team/app"),
		),
	).toBe("origin");
});

test("does not conflate differently cased GitLab paths", () => {
	const lower = remote("https://gitlab.com/team/app");
	expect(
		findMatchingRepoRemote(
			new Map([
				["upper", remote("https://gitlab.com/Team/App")],
				["lower", lower],
			]),
			lower,
		),
	).toBe("lower");
});

test("preserves each fetch URL on one remote and selects the matching URL", async () => {
	const directory = mkdtempSync(join(tmpdir(), "superset-multiple-urls-"));
	directories.push(directory);
	const git = simpleGit(directory);
	await git.init();
	await git.addRemote("origin", "https://gitlab.com/selected/repo.git");
	await git.raw([
		"config",
		"--add",
		"remote.origin.url",
		"https://gitlab.com/other/repo.git",
	]);
	const remotes = await getAllRepoRemotes(git);
	expect(remotes.map(([, value]) => value.owner)).toEqual([
		"selected",
		"other",
	]);
	expect(
		findMatchingRepoRemote(remotes, remote("https://gitlab.com/selected/repo")),
	).toBe("origin");
	expect(
		findMatchingRepoRemote(remotes, remote("https://gitlab.com/other/repo")),
	).toBe("origin");
});
