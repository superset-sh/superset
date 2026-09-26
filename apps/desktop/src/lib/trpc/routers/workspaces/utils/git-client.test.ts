import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	SIMPLE_GIT_UNSAFE_OPTION_FLAGS,
	USER_GIT_ENV_SIMPLE_GIT_OPTIONS,
} from "@superset/shared/simple-git-options";
import simpleGit, { type SimpleGit } from "simple-git";

function makeBlockedGitEnv(workRoot: string): Record<string, string> {
	const globalConfig = join(workRoot, "global.gitconfig");
	const systemConfig = join(workRoot, "system.gitconfig");
	const configFile = join(workRoot, "gitconfig");
	const templateDir = join(workRoot, "template");
	mkdirSync(templateDir);
	writeFileSync(globalConfig, "");
	writeFileSync(systemConfig, "");
	writeFileSync(configFile, "");

	return {
		EDITOR: "true",
		GIT_ASKPASS: "/bin/echo",
		GIT_CONFIG: configFile,
		GIT_CONFIG_COUNT: "0",
		GIT_CONFIG_GLOBAL: globalConfig,
		GIT_CONFIG_SYSTEM: systemConfig,
		GIT_EDITOR: "true",
		GIT_EXEC_PATH: execSync("git --exec-path", { encoding: "utf8" }).trim(),
		GIT_EXTERNAL_DIFF: "true",
		GIT_PAGER: "cat",
		GIT_PROXY_COMMAND: "true",
		GIT_SEQUENCE_EDITOR: "true",
		GIT_SSH: "ssh",
		GIT_SSH_COMMAND: "ssh",
		GIT_TEMPLATE_DIR: templateDir,
		PAGER: "cat",
		PREFIX: workRoot,
		SSH_ASKPASS: "/bin/echo",
	};
}

async function expectUnsafeEnvRejected(git: SimpleGit): Promise<void> {
	try {
		await git.raw(["status", "--short"]);
	} catch (err) {
		expect(String(err)).toContain("not permitted without enabling allowUnsafe");
		return;
	}

	throw new Error("Expected simple-git to reject unsafe git environment");
}

describe("simple-git user env options", () => {
	let workRoot: string;

	beforeEach(() => {
		workRoot = mkdtempSync(join(tmpdir(), "superset-git-client-"));
	});

	afterEach(() => {
		rmSync(workRoot, { recursive: true, force: true });
	});

	test("enables every simple-git unsafe compatibility flag", () => {
		for (const flag of SIMPLE_GIT_UNSAFE_OPTION_FLAGS) {
			expect(USER_GIT_ENV_SIMPLE_GIT_OPTIONS.unsafe[flag]).toBe(true);
		}
	});

	test("rejects the same env without the unsafe allow-list", async () => {
		const repoPath = join(workRoot, "repo");
		mkdirSync(repoPath);
		execSync("git init", { cwd: repoPath, stdio: "ignore" });

		await expectUnsafeEnvRejected(
			simpleGit(repoPath).env(makeBlockedGitEnv(workRoot)),
		);
	});

	test("allows user git env variables that simple-git blocks by default", async () => {
		const repoPath = join(workRoot, "repo");
		mkdirSync(repoPath);
		execSync("git init", { cwd: repoPath, stdio: "ignore" });

		const git = simpleGit(repoPath, USER_GIT_ENV_SIMPLE_GIT_OPTIONS).env(
			makeBlockedGitEnv(workRoot),
		);

		const status = await git.raw(["status", "--short"]);
		expect(status).toBe("");
	});

	// Repro for #5898 "Importing projects freeze on mac". Opening a folder runs
	// getDefaultBranch(), which can reach a network git op (`ls-remote origin
	// HEAD`). If that subprocess stalls with no output (unreachable remote, SSH
	// host-key / credential prompt without a TTY), simple-git must kill it — the
	// shared options carry a `timeout.block` for exactly this. Without one the
	// call never settles and the "open a folder" flow hangs indefinitely.
	test("ships a positive block timeout for every git command", () => {
		expect(USER_GIT_ENV_SIMPLE_GIT_OPTIONS.timeout?.block).toBeGreaterThan(0);
	});

	test("kills a git subprocess that stalls with no output", async () => {
		// Fake git that ignores its args and never produces output, standing in
		// for a real git op blocked on a hung network connection or auth prompt.
		// `exec` so the spawned process itself becomes `sleep`; a wrapper shell
		// would exit on SIGINT but leave `sleep` holding the stdio pipes open,
		// which stops simple-git from ever settling the task.
		const fakeGit = join(workRoot, "hang-git.sh");
		writeFileSync(fakeGit, "#!/bin/sh\nexec sleep 30\n");
		chmodSync(fakeGit, 0o755);

		const git = simpleGit({
			...USER_GIT_ENV_SIMPLE_GIT_OPTIONS,
			baseDir: workRoot,
			binary: fakeGit,
			// Real value lives in USER_GIT_ENV_SIMPLE_GIT_OPTIONS.timeout.block
			// (asserted above); shortened here only so the test runs quickly.
			timeout: { block: 500 },
		});

		const start = performance.now();
		let rejected = false;
		try {
			await git.raw(["ls-remote", "--symref", "origin", "HEAD"]);
		} catch {
			rejected = true;
		}
		const elapsedMs = performance.now() - start;

		expect(rejected).toBe(true);
		// Killed by the block timeout, nowhere near the 30s the fake git sleeps.
		expect(elapsedMs).toBeLessThan(5_000);
	}, 15_000);
});
