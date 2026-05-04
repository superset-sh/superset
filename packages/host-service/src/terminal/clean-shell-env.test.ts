import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	clearStrictShellEnvCache,
	getStrictShellEnvironment,
} from "./clean-shell-env";

// Repro for #4025: when host-service inherits a cwd that isn't readable to
// the user (e.g. an Electron launchd-spawned helper), the env-snapshot shell
// inherits that cwd too. Tools called from the user's .zshrc — brew is the
// reported case — abort with "current working directory must be readable
// to <user>". The shell should run from a known-readable dir ($HOME).
describe("getStrictShellEnvironment cwd", () => {
	let originalCwd: string;
	let originalShell: string | undefined;
	let tmpDir: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		originalShell = process.env.SHELL;
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clean-shell-env-cwd-"));
		clearStrictShellEnvCache();
	});

	afterEach(() => {
		try {
			process.chdir(originalCwd);
		} catch {
			// best-effort
		}
		if (originalShell === undefined) {
			delete process.env.SHELL;
		} else {
			process.env.SHELL = originalShell;
		}
		clearStrictShellEnvCache();
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// best-effort
		}
	});

	test("snapshot shell runs from HOME, not the host-service cwd", async () => {
		// Fake shell that emits the delimited contract with TESTPWD set to
		// its own pwd. Bypasses the user's .zshrc — narrow check on what
		// cwd the spawn() call gives the child.
		const fakeShell = path.join(tmpDir, "fake-shell.sh");
		fs.writeFileSync(
			fakeShell,
			[
				"#!/bin/sh",
				'printf "__SUPERSET_SHELL_ENV__"',
				'printf "TESTPWD=%s\\n" "$(pwd)"',
				'printf "__SUPERSET_SHELL_ENV__"',
				"",
			].join("\n"),
			{ mode: 0o755 },
		);

		// chdir somewhere that is NOT $HOME so cwd inheritance is detectable.
		process.chdir(tmpDir);
		process.env.SHELL = fakeShell;

		const env = await getStrictShellEnvironment();

		expect(env.TESTPWD).toBeDefined();
		const home = fs.realpathSync(os.homedir());
		const captured = fs.realpathSync(env.TESTPWD);
		expect(captured).toBe(home);
	});
});
