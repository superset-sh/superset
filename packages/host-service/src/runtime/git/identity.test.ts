import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { simpleGit } from "simple-git";
import {
	getGitAuthorName,
	getGitHubUsernameViaGh,
	readGitIdentity,
} from "./identity";

let tmpDir: string;
let repoDir: string;
let stubBinDir: string;

// Env that hides the machine's global git config so `user.name` resolution
// is fully controlled by the temp repo's local config. Isolation goes
// through HOME/XDG (empty temp dir) because simple-git rejects GIT_CONFIG_*
// and GIT_EDITOR env keys as unsafe.
function isolatedGitEnv(): Record<string, string> {
	return {
		HOME: path.join(tmpDir, "home"),
		XDG_CONFIG_HOME: path.join(tmpDir, "home", ".config"),
		PATH: process.env.PATH ?? "",
	};
}

function writeGhStub(script: string): void {
	const stubPath = path.join(stubBinDir, "gh");
	fs.writeFileSync(stubPath, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
}

/** Env whose PATH resolves `gh` to the stub (plus /bin etc. for sh). */
function stubGhEnv(): Record<string, string> {
	return {
		...isolatedGitEnv(),
		PATH: `${stubBinDir}:/usr/bin:/bin`,
	};
}

beforeAll(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-identity-test-"));
	repoDir = path.join(tmpDir, "repo");
	stubBinDir = path.join(tmpDir, "bin");
	fs.mkdirSync(repoDir);
	fs.mkdirSync(stubBinDir);
	fs.mkdirSync(path.join(tmpDir, "home"));
	execFileSync("git", ["init"], { cwd: repoDir });
});

afterAll(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("getGitAuthorName", () => {
	test("returns the configured user.name", async () => {
		execFileSync("git", ["config", "user.name", "Test Author"], {
			cwd: repoDir,
		});
		const git = simpleGit(repoDir).env(isolatedGitEnv());
		expect(await getGitAuthorName(git)).toBe("Test Author");
	});

	test("returns null when user.name is unset", async () => {
		// Tolerant unset: exits non-zero when the key was never set, so this
		// test doesn't depend on the set-test having run first.
		try {
			execFileSync("git", ["config", "--unset", "user.name"], {
				cwd: repoDir,
			});
		} catch {
			// key already absent
		}
		const git = simpleGit(repoDir).env(isolatedGitEnv());
		expect(await getGitAuthorName(git)).toBeNull();
	});
});

describe("getGitHubUsernameViaGh", () => {
	test("returns the login printed by gh", async () => {
		writeGhStub('echo "octocat"');
		expect(await getGitHubUsernameViaGh(stubGhEnv())).toBe("octocat");
	});

	test("returns null when gh exits non-zero", async () => {
		writeGhStub("exit 1");
		expect(await getGitHubUsernameViaGh(stubGhEnv())).toBeNull();
	});

	test("returns null when gh prints nothing", async () => {
		writeGhStub("exit 0");
		expect(await getGitHubUsernameViaGh(stubGhEnv())).toBeNull();
	});

	test("returns null when gh is not installed", async () => {
		const env = { ...isolatedGitEnv(), PATH: path.join(tmpDir, "empty") };
		expect(await getGitHubUsernameViaGh(env)).toBeNull();
	});
});

describe("readGitIdentity", () => {
	test("combines gh login with the process-env git author", async () => {
		writeGhStub('echo "hubster"');
		// The git read intentionally uses the process env (not shellEnv), so
		// compare against the same read done directly.
		const { createUserSimpleGit } = await import("./simple-git");
		const expectedAuthor = await getGitAuthorName(createUserSimpleGit());
		expect(await readGitIdentity(stubGhEnv())).toEqual({
			githubUsername: "hubster",
			authorName: expectedAuthor,
		});
	});
});
