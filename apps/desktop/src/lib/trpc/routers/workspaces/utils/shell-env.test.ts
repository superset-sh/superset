import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyShellEnvToProcess,
	getProcessEnvWithShellEnv,
	getProcessEnvWithShellPath,
} from "./shell-env";

describe("shell env merging", () => {
	test("getProcessEnvWithShellEnv fills in missing shell variables", async () => {
		const env = await getProcessEnvWithShellEnv(
			{
				PATH: "/usr/bin:/bin",
				NODE_ENV: "development",
			},
			{
				PATH: "/opt/homebrew/bin:/usr/bin:/bin",
				GITHUB_TOKEN: "ghp_test",
				GH_TOKEN: "ghp_alt",
			},
		);

		expect(env.PATH).toBe("/usr/bin:/bin");
		expect(env.NODE_ENV).toBe("development");
		expect(env.GITHUB_TOKEN).toBe("ghp_test");
		expect(env.GH_TOKEN).toBe("ghp_alt");
	});

	test("applyShellEnvToProcess preserves existing values", async () => {
		const targetEnv: NodeJS.ProcessEnv = {
			NODE_ENV: "production",
			GITHUB_TOKEN: "existing-token",
		};

		await applyShellEnvToProcess(targetEnv, {
			NODE_ENV: "development",
			GITHUB_TOKEN: "shell-token",
			GH_TOKEN: "shell-gh-token",
		});

		expect(targetEnv.NODE_ENV).toBe("production");
		expect(targetEnv.GITHUB_TOKEN).toBe("existing-token");
		expect(targetEnv.GH_TOKEN).toBe("shell-gh-token");
	});

	test("applyShellEnvToProcess ignores empty shell env input", async () => {
		const targetEnv: NodeJS.ProcessEnv = {};

		await applyShellEnvToProcess(targetEnv, {});

		expect(targetEnv).toEqual({});
	});
});

describe("getProcessEnvWithShellPath strips unsafe git env vars", () => {
	// Repro for #4599: git ≥ 2.50 refuses to honor inherited PAGER, GIT_PAGER,
	// EDITOR, or GIT_EDITOR on non-interactive callers, emitting errors like
	// `Use of "EDITOR" is not permitted without enabling allowUnsafeEditor`.
	// simple-git surfaces these as GitPluginError and breaks workspace creation.
	test("strips PAGER and GIT_PAGER from the returned env", async () => {
		const env = await getProcessEnvWithShellPath({
			PATH: "/usr/bin:/bin",
			PAGER: "less",
			GIT_PAGER: "less",
		});

		expect("PAGER" in env).toBe(false);
		expect("GIT_PAGER" in env).toBe(false);
	});

	test("strips EDITOR and GIT_EDITOR from the returned env", async () => {
		const env = await getProcessEnvWithShellPath({
			PATH: "/usr/bin:/bin",
			EDITOR: "vim",
			GIT_EDITOR: "vim",
		});

		expect("EDITOR" in env).toBe(false);
		expect("GIT_EDITOR" in env).toBe(false);
	});
});

describe("shell env cache", () => {
	test("getShellEnvironment forceRefresh bypasses cached values", async () => {
		const { clearShellEnvCache, getShellEnvironment } = await import(
			"./shell-env"
		);
		const zshPath = ["/bin/zsh", "/usr/bin/zsh"].find((candidate) =>
			existsSync(candidate),
		);
		if (!zshPath) {
			return;
		}

		const tmpDir = mkdtempSync(
			join(realpathSync(tmpdir()), "shell-env-refresh-test-"),
		);
		const zshrcPath = join(tmpDir, ".zshrc");
		writeFileSync(
			zshrcPath,
			'export __SUPERSET_SHELL_ENV_REFRESH_TEST__="first"\n',
		);

		const origZDOTDIR = process.env.ZDOTDIR;
		const origShell = process.env.SHELL;
		process.env.SHELL = zshPath;
		process.env.ZDOTDIR = tmpDir;
		clearShellEnvCache();

		try {
			const cachedEnv = await getShellEnvironment();
			expect(cachedEnv.__SUPERSET_SHELL_ENV_REFRESH_TEST__).toBe("first");

			writeFileSync(
				zshrcPath,
				'export __SUPERSET_SHELL_ENV_REFRESH_TEST__="second"\n',
			);

			const stillCachedEnv = await getShellEnvironment();
			expect(stillCachedEnv.__SUPERSET_SHELL_ENV_REFRESH_TEST__).toBe("first");

			const refreshedEnv = await getShellEnvironment({ forceRefresh: true });
			expect(refreshedEnv.__SUPERSET_SHELL_ENV_REFRESH_TEST__).toBe("second");
		} finally {
			if (origZDOTDIR !== undefined) process.env.ZDOTDIR = origZDOTDIR;
			else delete process.env.ZDOTDIR;
			if (origShell !== undefined) process.env.SHELL = origShell;
			else delete process.env.SHELL;
			clearShellEnvCache();
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});
