import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { createGitEnvResolver } from "./git";
import type { GitCredentialProvider } from "./types";

// Real temp repos (not mocks): the cache under test exists to avoid a real
// `git remote get-url` subprocess, so the assertion must be on how many
// times the provider sees the resolved URL, driven by actual git state.
async function initRepoWithOrigin(url: string): Promise<string> {
	const dir = mkdtempSync(join(tmpdir(), "git-env-resolver-"));
	const git = simpleGit(dir);
	await git.init();
	await git.addRemote("origin", url);
	return dir;
}

function createRecordingProvider(): GitCredentialProvider & {
	urlsSeen: (string | null)[];
} {
	const urlsSeen: (string | null)[] = [];
	return {
		urlsSeen,
		getCredentials: async (remoteUrl: string | null) => {
			if (remoteUrl !== null) urlsSeen.push(remoteUrl);
			return { env: {} };
		},
		getToken: async () => null,
		credentialRemedy: () => "no credentials",
	};
}

describe("createGitEnvResolver", () => {
	test("resolves the origin remote URL into provider credentials", async () => {
		const repo = await initRepoWithOrigin("https://github.com/acme/one.git");
		const provider = createRecordingProvider();

		await createGitEnvResolver(provider)(repo);

		expect(provider.urlsSeen).toEqual(["https://github.com/acme/one.git"]);
	});

	test("caches the remote URL per repoPath across resolver instances", async () => {
		const repo = await initRepoWithOrigin("https://github.com/acme/two.git");
		const provider = createRecordingProvider();

		// Fresh resolver per call mirrors resolveGitTaskEnv, which constructs
		// one per request — the cache must live at module level to help.
		await createGitEnvResolver(provider)(repo);
		await createGitEnvResolver(provider)(repo);
		await createGitEnvResolver(provider)(repo);

		expect(provider.urlsSeen).toEqual([
			"https://github.com/acme/two.git",
			"https://github.com/acme/two.git",
			"https://github.com/acme/two.git",
		]);
		// The subprocess-level dedupe is observable via timing-independent
		// state: mutate the remote and confirm the stale URL is still served
		// from cache within the TTL.
		const git = simpleGit(repo);
		await git.remote([
			"set-url",
			"origin",
			"https://github.com/acme/moved.git",
		]);
		await createGitEnvResolver(provider)(repo);
		expect(provider.urlsSeen[3]).toBe("https://github.com/acme/two.git");
	});

	test("does not leak one repo's URL to another repoPath", async () => {
		const repoA = await initRepoWithOrigin("https://github.com/acme/a.git");
		const repoB = await initRepoWithOrigin("https://github.com/acme/b.git");
		const provider = createRecordingProvider();

		await createGitEnvResolver(provider)(repoA);
		await createGitEnvResolver(provider)(repoB);

		expect(provider.urlsSeen).toEqual([
			"https://github.com/acme/a.git",
			"https://github.com/acme/b.git",
		]);
	});

	test("sets the git-invocation env and merges provider env", async () => {
		const repo = await initRepoWithOrigin("https://github.com/acme/env.git");
		const provider: GitCredentialProvider = {
			getCredentials: async (remoteUrl: string | null) => {
				const env: Record<string, string> = remoteUrl
					? { GIT_ASKPASS: "/tmp/askpass" }
					: { BASE: "1" };
				return { env };
			},
			getToken: async () => null,
			credentialRemedy: () => "no credentials",
		};

		const env = await createGitEnvResolver(provider)(repo);

		expect(env).toEqual({
			BASE: "1",
			GIT_ASKPASS: "/tmp/askpass",
			GIT_OPTIONAL_LOCKS: "0",
			LC_ALL: "C",
		});
	});
});
