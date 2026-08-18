import { afterEach, describe, expect, it } from "bun:test";
import {
	initTerminalBaseEnv,
	resetTerminalBaseEnvForTests,
} from "../terminal/env";
import { applyLoginShellEnvToProcess } from "./login-shell-env";

afterEach(() => {
	resetTerminalBaseEnvForTests();
});

describe("applyLoginShellEnvToProcess", () => {
	it("appends missing login-shell PATH entries after launcher entries", async () => {
		initTerminalBaseEnv({
			PATH: "/opt/homebrew/bin:/usr/bin:/home/u/.local/bin",
		});
		const target = { PATH: "/usr/bin:/bin" };

		await applyLoginShellEnvToProcess(target);

		expect(target.PATH).toBe(
			"/usr/bin:/bin:/opt/homebrew/bin:/home/u/.local/bin",
		);
	});

	it("keeps PATH untouched when the shell adds nothing new", async () => {
		initTerminalBaseEnv({ PATH: "/usr/bin" });
		const target = { PATH: "/custom/git:/usr/bin" };

		await applyLoginShellEnvToProcess(target);

		expect(target.PATH).toBe("/custom/git:/usr/bin");
	});

	it("merges missing shell vars without overwriting launcher vars", async () => {
		initTerminalBaseEnv({
			PATH: "/usr/bin",
			GH_TOKEN: "shell-token",
			EDITOR: "vim",
		});
		const target: NodeJS.ProcessEnv = {
			PATH: "/usr/bin",
			GH_TOKEN: "launcher-token",
		};

		await applyLoginShellEnvToProcess(target);

		expect(target.GH_TOKEN).toBe("launcher-token");
		expect(target.EDITOR).toBe("vim");
	});

	it("never imports runtime-altering vars from the shell", async () => {
		// NODE_ENV=development from a dotfile would flip serve.ts into dev-mode
		// shutdown, killing the pty-daemon (and every PTY) on host restart.
		initTerminalBaseEnv({
			PATH: "/usr/bin",
			NODE_ENV: "development",
			NODE_OPTIONS: "--inspect",
			ELECTRON_RUN_AS_NODE: "1",
			EDITOR: "vim",
		});
		const target: NodeJS.ProcessEnv = { PATH: "/usr/bin" };

		await applyLoginShellEnvToProcess(target);

		expect(target.NODE_ENV).toBeUndefined();
		expect(target.NODE_OPTIONS).toBeUndefined();
		expect(target.ELECTRON_RUN_AS_NODE).toBeUndefined();
		expect(target.EDITOR).toBe("vim");
	});

	it("adopts the shell PATH when the launcher has none", async () => {
		initTerminalBaseEnv({ PATH: "/opt/homebrew/bin:/usr/bin" });
		const target: NodeJS.ProcessEnv = {};

		await applyLoginShellEnvToProcess(target);

		expect(target.PATH).toBe("/opt/homebrew/bin:/usr/bin");
	});

	it("does not throw when the base env was never resolved", async () => {
		// waitForTerminalBaseEnv resolves immediately without a started
		// resolution and getTerminalBaseEnv throws — the merge must swallow it.
		const target = { PATH: "/usr/bin" };

		await applyLoginShellEnvToProcess(target);

		expect(target.PATH).toBe("/usr/bin");
	});
});
