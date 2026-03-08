import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyShellEnvToProcess, clearShellEnvCache } from "./shell-env";

describe("applyShellEnvToProcess", () => {
	beforeEach(() => {
		clearShellEnvCache();
	});

	afterEach(() => {
		clearShellEnvCache();
	});

	test("adds shell-only vars like GITHUB_TOKEN that are missing from the target env", async () => {
		// Simulates the minimal Electron process.env on macOS GUI app launch:
		// no GITHUB_TOKEN because ~/.zshrc hasn't been sourced.
		const targetEnv: NodeJS.ProcessEnv = {
			PATH: "/usr/bin:/bin",
			HOME: "/Users/test",
			NODE_ENV: "production",
		};

		// Simulates the full shell environment captured from an interactive login
		// shell — this includes GITHUB_TOKEN exported in ~/.zshrc.
		const shellEnvResult = {
			PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
			HOME: "/Users/test",
			SHELL: "/bin/zsh",
			GITHUB_TOKEN: "ghp_test_token_from_zshrc",
		};

		await applyShellEnvToProcess(targetEnv, shellEnvResult);

		// GITHUB_TOKEN from ~/.zshrc should now be available to child processes
		// (e.g., the mastracode agent harness running `gh` CLI commands).
		expect(targetEnv.GITHUB_TOKEN).toBe("ghp_test_token_from_zshrc");
	});

	test("does not overwrite vars already present in target env", async () => {
		const targetEnv: NodeJS.ProcessEnv = {
			PATH: "/usr/bin:/bin",
			NODE_ENV: "production",
			GITHUB_TOKEN: "existing_token",
		};

		const shellEnvResult = {
			PATH: "/opt/homebrew/bin:/usr/bin:/bin",
			GITHUB_TOKEN: "shell_token",
			NODE_ENV: "development",
		};

		await applyShellEnvToProcess(targetEnv, shellEnvResult);

		// Pre-existing vars must not be overwritten
		expect(targetEnv.NODE_ENV).toBe("production");
		expect(targetEnv.GITHUB_TOKEN).toBe("existing_token");
		// PATH was already set, so shell PATH must not replace it
		expect(targetEnv.PATH).toBe("/usr/bin:/bin");
	});

	test("adds GH_TOKEN when present in shell env but absent from target env", async () => {
		const targetEnv: NodeJS.ProcessEnv = {
			HOME: "/Users/test",
		};

		const shellEnvResult = {
			HOME: "/Users/test",
			GH_TOKEN: "ghp_gh_token",
		};

		await applyShellEnvToProcess(targetEnv, shellEnvResult);

		expect(targetEnv.GH_TOKEN).toBe("ghp_gh_token");
	});

	test("handles empty shell env gracefully", async () => {
		const targetEnv: NodeJS.ProcessEnv = {
			HOME: "/Users/test",
		};

		await applyShellEnvToProcess(targetEnv, {});

		expect(targetEnv.HOME).toBe("/Users/test");
	});
});
