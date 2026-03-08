import { describe, expect, test } from "bun:test";
import { applyShellEnvToProcess, getProcessEnvWithShellEnv } from "./shell-env";

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
