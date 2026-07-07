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
	function makeRepo(config?: unknown): {
		repoPath: string;
		worktreePath: string;
		homeDir: string;
		cleanup: () => void;
	} {
		const root = mkdtempSync(join(tmpdir(), "host-service-teardown-resolve-"));
		const repoPath = join(root, "repo");
		const worktreePath = join(root, "worktree");
		const homeDir = join(root, "home");
		mkdirSync(join(repoPath, ".superset"), { recursive: true });
		mkdirSync(worktreePath, { recursive: true });
		mkdirSync(homeDir, { recursive: true });
		if (config !== undefined) {
			writeFileSync(
				join(repoPath, ".superset", "config.json"),
				JSON.stringify(config),
			);
		}
		return {
			repoPath,
			worktreePath,
			homeDir,
			cleanup: () => rmSync(root, { recursive: true, force: true }),
		};
	}

	// Regression for #5486: repo-level `.superset/config.json` defines teardown
	// commands but the worktree has no `.superset/teardown.sh`. The delete path
	// previously only looked for the script file and silently skipped teardown,
	// leaving dev processes running.
	test("runs teardown commands from .superset/config.json when no teardown.sh exists", () => {
		const { repoPath, worktreePath, homeDir, cleanup } = makeRepo({
			teardown: ['bash "$SUPERSET_ROOT_PATH/.worktree/teardown.sh"'],
		});
		try {
			const command = resolveTeardownCommand({
				repoPath,
				projectId: "proj-1",
				worktreePath,
				homeDir,
			});
			expect(command).not.toBeNull();
			expect(command).toContain(
				'bash "$SUPERSET_ROOT_PATH/.worktree/teardown.sh"',
			);
		} finally {
			cleanup();
		}
	});

	test("joins multiple config teardown commands with &&", () => {
		const { repoPath, worktreePath, homeDir, cleanup } = makeRepo({
			teardown: ["echo one", "echo two"],
		});
		try {
			const command = resolveTeardownCommand({
				repoPath,
				projectId: "proj-1",
				worktreePath,
				homeDir,
			});
			expect(command).toContain("echo one && echo two");
		} finally {
			cleanup();
		}
	});

	test("falls back to worktree .superset/teardown.sh when config has no teardown", () => {
		const { repoPath, worktreePath, homeDir, cleanup } = makeRepo({
			setup: ["echo setup"],
		});
		try {
			const scriptPath = join(worktreePath, ".superset", "teardown.sh");
			mkdirSync(join(worktreePath, ".superset"), { recursive: true });
			writeFileSync(scriptPath, "#!/usr/bin/env bash\nexit 0\n");
			const command = resolveTeardownCommand({
				repoPath,
				projectId: "proj-1",
				worktreePath,
				homeDir,
			});
			expect(command).toBe(buildTeardownInitialCommand(scriptPath));
		} finally {
			cleanup();
		}
	});

	test("returns null when neither config teardown nor teardown.sh exists", () => {
		const { repoPath, worktreePath, homeDir, cleanup } = makeRepo();
		try {
			const command = resolveTeardownCommand({
				repoPath,
				projectId: "proj-1",
				worktreePath,
				homeDir,
			});
			expect(command).toBeNull();
		} finally {
			cleanup();
		}
	});
});
