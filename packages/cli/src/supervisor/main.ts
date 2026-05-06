/**
 * superset-host-supervisor
 *
 * Sibling binary spawned by `host.update.start` on the running daemon. Its
 * single job is to outlive the daemon's self-exit, run `superset update`,
 * respawn the daemon, then exit.
 *
 * Entry point only: keep this file thin and dependency-free so the bundle
 * stays small and the trust surface stays small.
 */

import { spawn } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const POLL_INTERVAL_MS = 500;
const OLD_PID_GRACE_MS = 15_000;
const HEALTH_POLL_TIMEOUT_MS = 30_000;

function supersetHomeDir(): string {
	return process.env.SUPERSET_HOME_DIR || join(homedir(), ".superset");
}

function logPath(organizationId: string): string {
	return join(supersetHomeDir(), "host", organizationId, "update.log");
}

function lockPath(organizationId: string): string {
	return join(supersetHomeDir(), "host", organizationId, "update.lock");
}

function manifestPath(organizationId: string): string {
	return join(supersetHomeDir(), "host", organizationId, "manifest.json");
}

function lastUpdatePath(organizationId: string): string {
	return join(supersetHomeDir(), "host", organizationId, "last-update.json");
}

interface SupervisorResult {
	succeeded: boolean;
	finalVersion?: string;
	error?: string;
	completedAt: number;
}

function writeSupervisorResult(
	organizationId: string,
	result: SupervisorResult,
): void {
	const path = lastUpdatePath(organizationId);
	try {
		writeFileSync(path, JSON.stringify(result), { mode: 0o600 });
	} catch {
		// best-effort — the new daemon won't see it, but the log still has it
	}
}

function ensureLogDir(path: string): void {
	const dir = dirname(path);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
}

function makeLogger(organizationId: string): (msg: string) => void {
	const path = logPath(organizationId);
	ensureLogDir(path);
	return (msg: string) => {
		const line = `[${new Date().toISOString()}] ${msg}\n`;
		try {
			appendFileSync(path, line);
		} catch {
			// best-effort
		}
	};
}

function isPidAlive(pid: number): boolean {
	if (!pid) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === "EPERM";
	}
}

async function waitForExit(pid: number, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (!isPidAlive(pid)) return;
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
	}
}

function supersetBinaryPath(): string {
	const installRoot = process.env.SUPERSET_INSTALL_ROOT;
	if (installRoot) return join(installRoot, "bin", "superset");
	return join(dirname(process.execPath), "superset");
}

function runChild(bin: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, {
			stdio: "inherit",
			env: process.env,
		});
		child.once("error", reject);
		child.once("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${bin} ${args.join(" ")} exited ${code}`));
		});
	});
}

interface ManifestShape {
	pid?: number;
	version?: string;
	startedAt?: number;
}

function readManifest(organizationId: string): ManifestShape | null {
	const path = manifestPath(organizationId);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as ManifestShape;
	} catch {
		return null;
	}
}

async function pollNewDaemon(
	organizationId: string,
	startedBefore: number,
	log: (msg: string) => void,
): Promise<void> {
	const deadline = Date.now() + HEALTH_POLL_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const manifest = readManifest(organizationId);
		if (
			manifest &&
			typeof manifest.startedAt === "number" &&
			manifest.startedAt > startedBefore &&
			typeof manifest.pid === "number" &&
			isPidAlive(manifest.pid)
		) {
			log(
				`new daemon detected pid=${manifest.pid} version=${manifest.version}`,
			);
			return;
		}
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
	}
	throw new Error(
		`new daemon did not come online within ${HEALTH_POLL_TIMEOUT_MS}ms`,
	);
}

function required(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required env: ${name}`);
	}
	return value;
}

async function main(): Promise<void> {
	const organizationId = required("SUPERSET_UPDATE_ORG_ID");
	const oldPid = Number(required("SUPERSET_UPDATE_OLD_PID"));
	const targetVersion = process.env.SUPERSET_UPDATE_TARGET_VERSION || null;

	const log = makeLogger(organizationId);
	const startedAt = Date.now();
	log(
		`supervisor pid=${process.pid} oldPid=${oldPid} target=${targetVersion ?? "latest"}`,
	);

	try {
		log("waiting for old daemon to exit");
		await waitForExit(oldPid, OLD_PID_GRACE_MS);
		if (isPidAlive(oldPid)) {
			log("old daemon still alive — sending SIGKILL");
			try {
				process.kill(oldPid, "SIGKILL");
			} catch {
				// already gone
			}
			await waitForExit(oldPid, 5_000);
		}

		const updateArgs = ["update"];
		if (targetVersion) updateArgs.push("--version", targetVersion);
		log(`running superset ${updateArgs.join(" ")}`);
		await runChild(supersetBinaryPath(), updateArgs);

		log("respawning daemon (superset start --daemon)");
		await runChild(supersetBinaryPath(), ["start", "--daemon"]);

		log("polling for new daemon manifest");
		await pollNewDaemon(organizationId, startedAt, log);

		const finalManifest = readManifest(organizationId);
		writeSupervisorResult(organizationId, {
			succeeded: true,
			finalVersion: finalManifest?.version,
			completedAt: Date.now(),
		});
		log("supervisor done");
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log(`supervisor failed: ${message}`);
		writeSupervisorResult(organizationId, {
			succeeded: false,
			error: message,
			completedAt: Date.now(),
		});
		process.exitCode = 1;
	} finally {
		const lock = lockPath(organizationId);
		if (existsSync(lock)) {
			try {
				rmSync(lock, { force: true });
			} catch {
				// best-effort
			}
		}
	}
}

void main();
