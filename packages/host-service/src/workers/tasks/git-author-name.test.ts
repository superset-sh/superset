import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { gitAuthorNameTask, gitIdentityTask } from "./git";

// Regression coverage for a review finding on #7413: branch-prefix
// resolution must read the same repo `create` bound its on-loop client to
// (gitAuthorNameTask), not the home-directory identity (gitIdentityTask) —
// otherwise a repo-local `user.name` override disagrees with the prefix
// `create` already applied to the branch.
let tmpDir: string;
let home: string;
let repoDir: string;

function setOrDelete(key: string, value: string | undefined): void {
	if (value === undefined) delete process.env[key];
	else process.env[key] = value;
}

beforeAll(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-author-name-test-"));
	home = path.join(tmpDir, "home");
	repoDir = path.join(tmpDir, "repo");
	fs.mkdirSync(path.join(home, ".config"), { recursive: true });
	fs.writeFileSync(
		path.join(home, ".gitconfig"),
		"[user]\n\tname = home-identity\n",
	);
	fs.mkdirSync(repoDir);
	execFileSync("git", ["init"], { cwd: repoDir });
	execFileSync("git", ["config", "user.name", "repo-identity"], {
		cwd: repoDir,
	});
});

afterAll(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("gitAuthorNameTask vs gitIdentityTask", () => {
	test("gitAuthorNameTask reads the repo's own user.name, not the home identity", async () => {
		const restore = {
			home: process.env.HOME,
			xdg: process.env.XDG_CONFIG_HOME,
			cwd: process.cwd(),
		};
		try {
			process.env.HOME = home;
			process.env.XDG_CONFIG_HOME = path.join(home, ".config");
			// Standing somewhere other than the repo proves the task binds to
			// the given worktreePath, not the process's cwd.
			process.chdir(tmpDir);

			const repoScoped = await gitAuthorNameTask.handler({
				worktreePath: repoDir,
			});
			expect(repoScoped).toBe("repo-identity");

			// Same environment, but the home-directory task: proves the two
			// really can disagree, which is exactly what the fix routes
			// branch-prefix resolution around.
			const homeScoped = await gitIdentityTask.handler({
				shellEnv: process.env as Record<string, string>,
			});
			expect(homeScoped.authorName).toBe("home-identity");
		} finally {
			process.chdir(restore.cwd);
			setOrDelete("HOME", restore.home);
			setOrDelete("XDG_CONFIG_HOME", restore.xdg);
		}
	});
});
