import { describe, expect, test } from "bun:test";
import { applyShellEnvToProcess } from "./shell-env";

/**
 * Regression tests for issue #2216:
 * After upgrading from 1.0.7 to 1.1.2, GitHub is no longer connected.
 *
 * Root cause: Electron GUI apps launched from Finder/Dock start with a minimal
 * process.env that has NOT sourced ~/.zshrc. User-set tokens like GITHUB_TOKEN
 * or GH_TOKEN are absent, so `gh` CLI falls back to a keyring OAuth token that
 * may lack SSO authorization for private org repos.
 *
 * The fix: applyShellEnvToProcess() merges the user's full interactive shell env
 * into process.env at startup — only for keys not already present — so gh CLI
 * and all child processes inherit GITHUB_TOKEN without clobbering Electron vars.
 */
describe("applyShellEnvToProcess", () => {
	test("merges GITHUB_TOKEN from shell env into a minimal Electron process.env", async () => {
		// Simulate the minimal env that macOS GUI apps start with (no shell config sourced)
		const minimalElectronEnv: NodeJS.ProcessEnv = {
			PATH: "/usr/bin:/bin",
			HOME: "/Users/testuser",
			USER: "testuser",
		};

		// Simulate what ~/.zshrc exports (captured by getShellEnvironment)
		const shellEnv = {
			PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
			HOME: "/Users/testuser",
			USER: "testuser",
			GITHUB_TOKEN: "ghp_testTokenFromZshrc",
		};

		await applyShellEnvToProcess(minimalElectronEnv, shellEnv);

		// GITHUB_TOKEN should now be present so gh CLI can use it
		expect(minimalElectronEnv.GITHUB_TOKEN).toBe("ghp_testTokenFromZshrc");
	});

	test("does NOT overwrite keys already present in process.env", async () => {
		// Electron manages NODE_ENV, DATABASE_URL, etc. — these must not be clobbered
		const electronEnv: NodeJS.ProcessEnv = {
			NODE_ENV: "production",
			PATH: "/usr/bin",
		};

		const shellEnv = {
			NODE_ENV: "development", // shell config tries to override — must be ignored
			PATH: "/opt/homebrew/bin:/usr/bin",
			GITHUB_TOKEN: "ghp_shouldBeAdded",
		};

		await applyShellEnvToProcess(electronEnv, shellEnv);

		expect(electronEnv.NODE_ENV).toBe("production"); // Electron value preserved
		expect(electronEnv.GITHUB_TOKEN).toBe("ghp_shouldBeAdded"); // new key added
	});

	test("merges GH_TOKEN (alternative GitHub token env var)", async () => {
		const targetEnv: NodeJS.ProcessEnv = {
			PATH: "/usr/bin",
		};

		const shellEnv = {
			GH_TOKEN: "gho_fallbackToken",
		};

		await applyShellEnvToProcess(targetEnv, shellEnv);

		expect(targetEnv.GH_TOKEN).toBe("gho_fallbackToken");
	});

	test("handles empty shell env without error", async () => {
		const targetEnv: NodeJS.ProcessEnv = {
			PATH: "/usr/bin",
			HOME: "/Users/testuser",
		};

		await applyShellEnvToProcess(targetEnv, {});

		// Nothing should change
		expect(targetEnv.PATH).toBe("/usr/bin");
		expect(targetEnv.HOME).toBe("/Users/testuser");
		expect(Object.keys(targetEnv)).toHaveLength(2);
	});
});
