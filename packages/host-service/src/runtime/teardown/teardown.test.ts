import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { removeDevAppProfile } from "./dev-app-profile";
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

describe("removeDevAppProfile", () => {
	function makeAppDataDir(): { appDataDir: string; cleanup: () => void } {
		const appDataDir = mkdtempSync(join(tmpdir(), "host-service-appdata-"));
		return {
			appDataDir,
			cleanup: () => rmSync(appDataDir, { recursive: true, force: true }),
		};
	}

	function seedProfile(appDataDir: string, name: string): string {
		const dir = join(appDataDir, name);
		mkdirSync(join(dir, "Cache"), { recursive: true });
		writeFileSync(join(dir, "Cache", "data_0"), "x");
		return dir;
	}

	test("removes the profile the dev app minted for this workspace", async () => {
		const sb = makeAppDataDir();
		try {
			const profile = seedProfile(sb.appDataDir, "Superset (feature-x)");

			await removeDevAppProfile({
				workspaceName: "feature-x",
				appDataDir: sb.appDataDir,
			});

			expect(existsSync(profile)).toBe(false);
		} finally {
			sb.cleanup();
		}
	});

	test("leaves other workspaces' profiles alone", async () => {
		const sb = makeAppDataDir();
		try {
			const other = seedProfile(sb.appDataDir, "Superset (feature-y)");

			await removeDevAppProfile({
				workspaceName: "feature-x",
				appDataDir: sb.appDataDir,
			});

			expect(existsSync(other)).toBe(true);
		} finally {
			sb.cleanup();
		}
	});

	// The installed builds' profiles are real user data. No workspace name can
	// derive them (they carry no parens), but the guard is load-bearing enough
	// to pin: a naming change that made it possible would silently wipe the
	// user's installed Superset.
	test("never removes an installed build's profile", async () => {
		const sb = makeAppDataDir();
		try {
			const installed = ["Superset", "Superset Dev", "Superset Canary"].map(
				(name) => seedProfile(sb.appDataDir, name),
			);

			for (const workspaceName of ["", "  ", ")", "Dev", "Canary"]) {
				await removeDevAppProfile({
					workspaceName,
					appDataDir: sb.appDataDir,
				});
			}

			for (const dir of installed) expect(existsSync(dir)).toBe(true);
		} finally {
			sb.cleanup();
		}
	});

	test("refuses a workspace name that would escape the profiles directory", async () => {
		const sb = makeAppDataDir();
		try {
			const sibling = seedProfile(sb.appDataDir, "Superset (victim)");

			await removeDevAppProfile({
				workspaceName: "../Superset (victim)",
				appDataDir: join(sb.appDataDir, "nested"),
			});

			expect(existsSync(sibling)).toBe(true);
		} finally {
			sb.cleanup();
		}
	});

	// Deleting the workspace the running dev app was launched from must not
	// pull userData out from under its live windows. The startup sweep
	// reclaims it once that app exits.
	test("leaves a profile a live app still holds", async () => {
		const sb = makeAppDataDir();
		try {
			const profile = seedProfile(sb.appDataDir, "Superset (in-use)");
			symlinkSync(
				`${hostname()}-${process.pid}`,
				join(profile, "SingletonLock"),
			);

			await removeDevAppProfile({
				workspaceName: "in-use",
				appDataDir: sb.appDataDir,
			});

			expect(existsSync(profile)).toBe(true);
		} finally {
			sb.cleanup();
		}
	});

	test("removes a profile whose lock belongs to a dead process", async () => {
		const sb = makeAppDataDir();
		try {
			const profile = seedProfile(sb.appDataDir, "Superset (crashed)");
			symlinkSync(`${hostname()}-999999`, join(profile, "SingletonLock"));

			await removeDevAppProfile({
				workspaceName: "crashed",
				appDataDir: sb.appDataDir,
			});

			expect(existsSync(profile)).toBe(false);
		} finally {
			sb.cleanup();
		}
	});

	// A row written before the name column was backfilled carries no usable
	// name. Best-effort means that must not throw and take the delete with it.
	test("survives a workspace row with no name", async () => {
		await removeDevAppProfile({
			workspaceName: undefined as unknown as string,
			appDataDir: "/nonexistent",
		});
		await removeDevAppProfile({
			workspaceName: "",
			appDataDir: "/nonexistent",
		});
	});

	test("is a no-op when the workspace never minted a profile", async () => {
		const sb = makeAppDataDir();
		try {
			await removeDevAppProfile({
				workspaceName: "never-opened",
				appDataDir: sb.appDataDir,
			});
		} finally {
			sb.cleanup();
		}
	});
});
