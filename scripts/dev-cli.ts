#!/usr/bin/env bun
/**
 * Run the dev CLI against the running dev desktop app's local host.
 *
 * The desktop app is local-first (v2): it registers its host under a local-db
 * organization (e.g. a1b2c3d4-…), which has nothing to do with the org your
 * `superset auth login` lands in. So a plain `bun run --cwd packages/cli dev`
 * authenticates as the wrong org and can't find the dev host. This wrapper
 * reads the live host manifest under `<worktree>/superset-dev-data/host/*` and
 * points the CLI at it:
 *   - SUPERSET_HOME_DIR      → the dev data dir (so it reads the dev manifests)
 *   - SUPERSET_ORGANIZATION_ID → the live host's org (so the local host resolves)
 *   - SUPERSET_API_KEY       → a placeholder to satisfy the auth gate; local
 *                              host commands use the manifest token, not this.
 *
 * Usage:  bun scripts/dev-cli.ts browser list --workspace <id> --json
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function repoRoot(): string {
	try {
		return execFileSync("git", ["rev-parse", "--show-toplevel"], {
			encoding: "utf-8",
		}).trim();
	} catch {
		// Fall back to walking up from this file to the first dir with a superset-dev-data.
		let dir = dirname(new URL(import.meta.url).pathname);
		for (let i = 0; i < 8; i++) {
			if (existsSync(join(dir, "package.json"))) return dir;
			dir = dirname(dir);
		}
		return resolve(".");
	}
}

function isAlive(pid: number): boolean {
	if (!pid) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

interface Manifest {
	pid: number;
	endpoint: string;
	organizationId: string;
	startedAt: number;
}

function findLiveHost(homeDir: string): Manifest | null {
	const hostRoot = join(homeDir, "host");
	if (!existsSync(hostRoot)) return null;
	const live: Manifest[] = [];
	for (const org of readdirSync(hostRoot)) {
		const path = join(hostRoot, org, "manifest.json");
		if (!existsSync(path)) continue;
		try {
			const m = JSON.parse(readFileSync(path, "utf-8")) as Manifest;
			if (m.organizationId && isAlive(m.pid)) live.push(m);
		} catch {}
	}
	// Newest wins if more than one org has a live host.
	live.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
	return live[0] ?? null;
}

const root = repoRoot();
const homeDir = join(root, "superset-dev-data");
const host = findLiveHost(homeDir);
if (!host) {
	console.error(
		`No live dev host found under ${homeDir}/host/*.\n` +
			"Start the dev desktop app first (bun run dev:desktop) and open a workspace, then retry.",
	);
	process.exit(1);
}

console.error(
	`[dev-cli] targeting local host org ${host.organizationId} @ ${host.endpoint}`,
);

const env: NodeJS.ProcessEnv = {
	...process.env,
	SUPERSET_HOME_DIR: homeDir,
	SUPERSET_ORGANIZATION_ID: host.organizationId,
	// Placeholder just satisfies the "logged in" gate and bypasses OAuth refresh;
	// local host commands authenticate with the manifest token, not this.
	SUPERSET_API_KEY: process.env.SUPERSET_API_KEY ?? "sk_dev_local_placeholder",
};

try {
	execFileSync(
		"bun",
		[
			"run",
			"--cwd",
			join(root, "packages/cli"),
			"dev",
			"--",
			...process.argv.slice(2),
		],
		{ stdio: "inherit", env },
	);
} catch (err) {
	process.exit((err as { status?: number }).status ?? 1);
}
