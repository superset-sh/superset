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
	buildTeardownCommandString,
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

	test("single-quotes config command strings for exec bash -c", () => {
		expect(buildTeardownCommandString("echo 'hi' && exit")).toBe(
			`exec bash -c 'echo '\\''hi'\\'' && exit'`,
		);
	});
});

describe("resolveTeardownCommand", () => {
	// Fresh dirs per call; homeDir points at an empty dir so real user
	// overrides in ~/.superset can't leak into the resolution.
	function setup() {
		const root = mkdtempSync(join(tmpdir(), "host-service-teardown-resolve-"));
		const repoPath = join(root, "repo");
		const worktreePath = join(root, "worktree");
		const homeDir = join(root, "home");
		for (const dir of [repoPath, worktreePath, homeDir]) {
			mkdirSync(join(dir, ".superset"), { recursive: true });
		}
		return {
			root,
			args: { repoPath, worktreePath, projectId: "proj-1", homeDir },
		};
	}

	function writeScript(dir: string) {
		writeFileSync(join(dir, ".superset", "teardown.sh"), "exit 0\n", {
			mode: 0o755,
		});
	}

	test("config commands win over an existing worktree teardown.sh", () => {
		const { root, args } = setup();
		try {
			writeScript(args.worktreePath);
			writeFileSync(
				join(args.repoPath, ".superset", "config.json"),
				JSON.stringify({ teardown: ["./scripts/teardown.sh", "echo done"] }),
			);

			expect(resolveTeardownCommand(args)).toBe(
				"exec bash -c './scripts/teardown.sh && echo done'",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("falls back to the worktree teardown.sh when config has no teardown", () => {
		const { root, args } = setup();
		try {
			writeScript(args.worktreePath);
			writeFileSync(
				join(args.repoPath, ".superset", "config.json"),
				JSON.stringify({ setup: ["bun install"] }),
			);

			expect(resolveTeardownCommand(args)).toBe(
				`exec bash '${join(args.worktreePath, ".superset", "teardown.sh")}'`,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("falls back to the main repo teardown.sh when the worktree copy is gitignored", () => {
		const { root, args } = setup();
		try {
			writeScript(args.repoPath);

			expect(resolveTeardownCommand(args)).toBe(
				`exec bash '${join(args.repoPath, ".superset", "teardown.sh")}'`,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("returns null when nothing is configured", () => {
		const { root, args } = setup();
		try {
			expect(resolveTeardownCommand(args)).toBeNull();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("treats whitespace-only config commands as unconfigured", () => {
		const { root, args } = setup();
		try {
			writeFileSync(
				join(args.repoPath, ".superset", "config.json"),
				JSON.stringify({ teardown: ["  ", ""] }),
			);

			expect(resolveTeardownCommand(args)).toBeNull();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
