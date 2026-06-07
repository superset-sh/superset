import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	SIMPLE_GIT_UNSAFE_OPTION_FLAGS,
	USER_GIT_ENV_SIMPLE_GIT_OPTIONS,
} from "@superset/shared/simple-git-options";
import simpleGit, { type SimpleGit } from "simple-git";
import { createUserSimpleGit } from "./simple-git";

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

describe("createUserSimpleGit", () => {
	let workRoot: string;

	beforeEach(() => {
		workRoot = mkdtempSync(join(tmpdir(), "superset-host-simple-git-"));
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

		const git = createUserSimpleGit(repoPath).env(makeBlockedGitEnv(workRoot));

		const status = await git.raw(["status", "--short"]);
		expect(status).toBe("");
	});
});
