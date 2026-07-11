import { afterEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildClaudeCodeEnvironment,
	ClaudeCodeExecutableNotFoundError,
	resetClaudeCodeExecutableCacheForTests,
	resolveClaudeCodeExecutable,
} from "./claude-runtime";

const temporaryDirectories: string[] = [];

afterEach(() => {
	resetClaudeCodeExecutableCacheForTests();
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

function makeTemporaryHome(): string {
	const directory = mkdtempSync(join(tmpdir(), "superset-claude-runtime-"));
	temporaryDirectories.push(directory);
	return directory;
}

function writeExecutable(filePath: string): void {
	mkdirSync(join(filePath, ".."), { recursive: true });
	writeFileSync(filePath, "#!/bin/sh\nexit 0\n");
	chmodSync(filePath, 0o755);
}

describe("Claude Code runtime", () => {
	test("preserves user-owned Anthropic variables in the SDK environment", () => {
		const baseEnvironment = {
			PATH: "/usr/local/bin:/usr/bin",
			ANTHROPIC_API_KEY: "user-api-key",
			ANTHROPIC_AUTH_TOKEN: "user-auth-token",
		};

		expect(buildClaudeCodeEnvironment(baseEnvironment)).toEqual({
			...baseEnvironment,
			CLAUDE_AGENT_SDK_CLIENT_APP: "superset-host",
		});
	});

	test("does not overwrite a user-owned SDK attribution variable", () => {
		const baseEnvironment = {
			PATH: "/usr/local/bin:/usr/bin",
			CLAUDE_AGENT_SDK_CLIENT_APP: "user-owned-client-name",
		};

		expect(buildClaudeCodeEnvironment(baseEnvironment)).toEqual(
			baseEnvironment,
		);
	});

	test("skips all Superset wrapper directories and returns a canonical system path", () => {
		const home = makeTemporaryHome();
		const productionWrapper = join(home, ".superset", "bin", "claude");
		const developmentWrapper = join(home, ".superset-dev", "bin", "claude");
		const installDirectory = join(home, "Claude Code.app", "bin");
		const installedExecutable = join(home, "Claude Code.app", "claude-real");
		const pathExecutable = join(installDirectory, "claude");
		writeExecutable(productionWrapper);
		writeExecutable(developmentWrapper);
		writeExecutable(installedExecutable);
		mkdirSync(installDirectory, { recursive: true });
		symlinkSync(installedExecutable, pathExecutable);

		const resolved = resolveClaudeCodeExecutable({
			HOME: home,
			PATH: [
				join(home, ".superset", "bin"),
				join(home, ".superset-dev", "bin"),
				installDirectory,
			].join(":"),
		});

		expect(resolved).toBe(realpathSync(installedExecutable));
	});

	test("reports an actionable install and login error when only a wrapper exists", () => {
		const home = makeTemporaryHome();
		const wrapperDirectory = join(home, ".superset", "bin");
		writeExecutable(join(wrapperDirectory, "claude"));

		expect(() =>
			resolveClaudeCodeExecutable({ HOME: home, PATH: wrapperDirectory }),
		).toThrow(ClaudeCodeExecutableNotFoundError);
		try {
			resolveClaudeCodeExecutable({ HOME: home, PATH: wrapperDirectory });
		} catch (error) {
			expect(error).toBeInstanceOf(ClaudeCodeExecutableNotFoundError);
			expect((error as Error).message).toContain(
				"Only Superset's Claude wrapper was found",
			);
			expect((error as Error).message).toContain("Install Claude Code");
			expect((error as Error).message).toContain("sign in");
		}
	});

	test("does not retain a stale cached executable", () => {
		const home = makeTemporaryHome();
		const firstDirectory = join(home, "first", "bin");
		const secondDirectory = join(home, "second", "bin");
		const firstExecutable = join(firstDirectory, "claude");
		const secondExecutable = join(secondDirectory, "claude");
		writeExecutable(firstExecutable);
		writeExecutable(secondExecutable);
		const environment = {
			HOME: home,
			PATH: `${firstDirectory}:${secondDirectory}`,
		};

		expect(resolveClaudeCodeExecutable(environment)).toBe(
			realpathSync(firstExecutable),
		);
		unlinkSync(firstExecutable);
		expect(resolveClaudeCodeExecutable(environment)).toBe(
			realpathSync(secondExecutable),
		);
	});

	test("does not fall back to the current directory for an empty PATH entry", () => {
		const home = makeTemporaryHome();
		writeExecutable(join(home, "claude"));

		expect(() => resolveClaudeCodeExecutable({ HOME: home, PATH: "" })).toThrow(
			ClaudeCodeExecutableNotFoundError,
		);
	});
});
