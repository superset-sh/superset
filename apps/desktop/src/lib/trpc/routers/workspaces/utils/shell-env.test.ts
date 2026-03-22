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

describe("getProcessEnvWithShellPath", () => {
	test("includes /usr/bin in PATH even when shell env omits it (issue #2670)", async () => {
		// Reproduces: shellEnv() succeeds but returns a PATH from a custom
		// shell profile that omits system directories. getProcessEnvWithShellPath
		// overwrites env.PATH with the shell PATH, losing /usr/bin/git.
		const origPlatform = process.platform;
		Object.defineProperty(process, "platform", { value: "darwin" });
		try {
			const env = await getProcessEnvWithShellPath(
				{ PATH: "/usr/bin:/bin" } as unknown as NodeJS.ProcessEnv,
				{ forceRefresh: true },
			);
			// On macOS, system paths must always be present
			expect(env.PATH).toContain("/usr/bin");
			expect(env.PATH).toContain("/bin");
		} finally {
			Object.defineProperty(process, "platform", { value: origPlatform });
		}
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
