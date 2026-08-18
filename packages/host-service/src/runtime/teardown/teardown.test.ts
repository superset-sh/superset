import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
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
	buildTeardownCommandFromShell,
	buildTeardownInitialCommand,
	resolveTeardownCommand,
} from "./teardown";

function isFishAvailable(): boolean {
	const result = spawnSync("fish", ["-c", "exit 0"], { stdio: "ignore" });
	return result.status === 0;
}

describe("teardown initial command", () => {
	test("uses exec instead of shell-specific exit status syntax", () => {
		const command = buildTeardownInitialCommand(
			"/tmp/worktree/.superset/teardown.sh",
		);

		expect(command).toBe("exec bash '/tmp/worktree/.superset/teardown.sh'");
		expect(command).not.toContain("$?");
	});

	test("shell-command form runs via `bash -c` and avoids $?", () => {
		const command = buildTeardownCommandFromShell(
			"docker compose down && rm -rf .cache",
		);

		expect(command).toBe("exec bash -c 'docker compose down && rm -rf .cache'");
		expect(command).not.toContain("$?");
	});

	test("shell-command form single-quote-escapes the command", () => {
		expect(buildTeardownCommandFromShell("echo 'bye'")).toBe(
			"exec bash -c 'echo '\\''bye'\\'''",
		);
	});

	test("exits fish with the teardown script status", () => {
		if (!isFishAvailable()) return;

		const root = mkdtempSync(join(tmpdir(), "host-service-teardown-"));
		const dirWithQuote = join(root, "quote's dir");
		const scriptPath = join(dirWithQuote, "teardown.sh");

		try {
			mkdirSync(dirWithQuote, { recursive: true });
			writeFileSync(scriptPath, "#!/usr/bin/env bash\nexit 7\n", {
				mode: 0o755,
			});
			chmodSync(scriptPath, 0o755);

			const result = spawnSync("fish", [
				"-c",
				buildTeardownInitialCommand(scriptPath),
			]);

			expect(result.status).toBe(7);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("resolveTeardownCommand", () => {
	function makeSandbox(): {
		repoPath: string;
		homeDir: string;
		cleanup: () => void;
	} {
		const root = mkdtempSync(join(tmpdir(), "host-service-teardown-resolve-"));
		const repoPath = join(root, "repo");
		const homeDir = join(root, "home");
		mkdirSync(join(repoPath, ".superset"), { recursive: true });
		mkdirSync(homeDir, { recursive: true });
		return {
			repoPath,
			homeDir,
			cleanup: () => rmSync(root, { recursive: true, force: true }),
		};
	}

	function writeConfig(repoPath: string, config: unknown): void {
		writeFileSync(
			join(repoPath, ".superset", "config.json"),
			JSON.stringify(config),
		);
	}

	// Reproduces #5486: configured `teardown` commands must run on delete.
	// Before the fix, teardown never consulted the resolved config and
	// silently skipped when no teardown.sh script existed.
	test("runs configured teardown commands from .superset/config.json", () => {
		const sb = makeSandbox();
		try {
			writeConfig(sb.repoPath, {
				setup: ["bash setup.sh"],
				teardown: ["docker compose down", "bash teardown.sh"],
			});

			const resolved = resolveTeardownCommand({
				repoPath: sb.repoPath,
				projectId: "proj-1",
				worktreePath: join(sb.repoPath, ".worktrees", "feature"),
				homeDir: sb.homeDir,
			});

			expect(resolved).toEqual({
				initialCommand:
					"exec bash -c 'docker compose down && bash teardown.sh'",
			});
		} finally {
			sb.cleanup();
		}
	});

	test("configured teardown takes precedence over a teardown.sh script", () => {
		const sb = makeSandbox();
		try {
			writeConfig(sb.repoPath, { teardown: ["echo configured"] });
			writeFileSync(
				join(sb.repoPath, ".superset", "teardown.sh"),
				"#!/usr/bin/env bash\n",
			);

			const resolved = resolveTeardownCommand({
				repoPath: sb.repoPath,
				projectId: "proj-1",
				worktreePath: join(sb.repoPath, ".worktrees", "feature"),
				homeDir: sb.homeDir,
			});

			expect(resolved).toEqual({
				initialCommand: "exec bash -c 'echo configured'",
			});
		} finally {
			sb.cleanup();
		}
	});

	test("falls back to <repoPath>/.superset/teardown.sh when no teardown is configured", () => {
		const sb = makeSandbox();
		try {
			// Config exists but only defines setup — teardown must fall back.
			// The main repo is the source, matching setup.sh resolution:
			// gitignored scripts don't exist in worktrees.
			writeConfig(sb.repoPath, { setup: ["bash setup.sh"] });
			const scriptPath = join(sb.repoPath, ".superset", "teardown.sh");
			writeFileSync(scriptPath, "#!/usr/bin/env bash\n");

			const resolved = resolveTeardownCommand({
				repoPath: sb.repoPath,
				projectId: "proj-1",
				worktreePath: join(sb.repoPath, ".worktrees", "feature"),
				homeDir: sb.homeDir,
			});

			expect(resolved).toEqual({ initialCommand: `exec bash '${scriptPath}'` });
		} finally {
			sb.cleanup();
		}
	});

	test("worktree teardown.sh wins over the main repo copy", () => {
		const sb = makeSandbox();
		try {
			writeFileSync(
				join(sb.repoPath, ".superset", "teardown.sh"),
				"#!/usr/bin/env bash\n",
			);
			const worktreePath = join(sb.repoPath, ".worktrees", "feature");
			mkdirSync(join(worktreePath, ".superset"), { recursive: true });
			const worktreeScript = join(worktreePath, ".superset", "teardown.sh");
			writeFileSync(worktreeScript, "#!/usr/bin/env bash\n");

			const resolved = resolveTeardownCommand({
				repoPath: sb.repoPath,
				projectId: "proj-1",
				worktreePath,
				homeDir: sb.homeDir,
			});

			expect(resolved).toEqual({
				initialCommand: `exec bash '${worktreeScript}'`,
			});
		} finally {
			sb.cleanup();
		}
	});

	test("carries config cwd for the teardown session", () => {
		const sb = makeSandbox();
		try {
			writeConfig(sb.repoPath, {
				teardown: ["docker compose down"],
				cwd: "apps/web",
			});

			const resolved = resolveTeardownCommand({
				repoPath: sb.repoPath,
				projectId: "proj-1",
				worktreePath: join(sb.repoPath, ".worktrees", "feature"),
				homeDir: sb.homeDir,
			});

			expect(resolved).toEqual({
				initialCommand: "exec bash -c 'docker compose down'",
				cwd: "apps/web",
			});
		} finally {
			sb.cleanup();
		}
	});

	test("returns null (skipped) when neither config nor script provides a teardown", () => {
		const sb = makeSandbox();
		try {
			const resolved = resolveTeardownCommand({
				repoPath: sb.repoPath,
				projectId: "proj-1",
				worktreePath: join(sb.repoPath, ".worktrees", "feature"),
				homeDir: sb.homeDir,
			});

			expect(resolved).toBeNull();
		} finally {
			sb.cleanup();
		}
	});
});
