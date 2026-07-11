/**
 * One-shot supervisor for a remotely requested standalone host update.
 * It remains outside the host-service process so it can replace the install,
 * restart the host, and verify the exact version that came back online.
 */
import { spawn } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	readUpdateLock,
	releaseUpdateLock,
	updateLogPath,
	writeUpdateResult,
} from "@superset/host-service/update-protocol";
import { isProcessAlive } from "../lib/process-state";

const POLL_INTERVAL_MS = 500;
const OLD_HOST_EXIT_TIMEOUT_MS = 15_000;
const NEW_HOST_TIMEOUT_MS = 60_000;
const LOCK_HANDOFF_TIMEOUT_MS = 5_000;
const UPDATE_COMMAND_TIMEOUT_MS = 5 * 60_000;
const START_COMMAND_TIMEOUT_MS = 30_000;
const COMMAND_TERMINATION_GRACE_MS = 2_000;
const MAX_RESULT_ERROR_LENGTH = 1_000;

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function isMainModule(
	moduleUrl: string,
	entryPath: string | undefined = process.argv[1],
): boolean {
	if (!entryPath) return false;
	try {
		return resolve(fileURLToPath(moduleUrl)) === resolve(entryPath);
	} catch {
		return false;
	}
}

export interface HostManifest {
	pid: number;
	endpoint: string;
	authToken: string;
	startedAt: number;
	organizationId: string;
	version?: string;
}

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required environment variable ${name}`);
	return value;
}

function parsePid(value: string, name: string): number {
	const pid = Number(value);
	if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) {
		throw new Error(`Invalid ${name}: ${value}`);
	}
	return pid;
}

function supersetHomeDir(): string {
	return process.env.SUPERSET_HOME_DIR || join(homedir(), ".superset");
}

function organizationDir(
	organizationId: string,
	homeDir = supersetHomeDir(),
): string {
	return join(homeDir, "host", organizationId);
}

function manifestPath(
	organizationId: string,
	homeDir = supersetHomeDir(),
): string {
	return join(organizationDir(organizationId, homeDir), "manifest.json");
}

export function removeStaleHostManifest(
	organizationId: string,
	homeDir = supersetHomeDir(),
): void {
	rmSync(manifestPath(organizationId, homeDir), { force: true });
}

function createLogger(organizationId: string): (message: string) => void {
	const directory = organizationDir(organizationId);
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	const path = updateLogPath(organizationId, supersetHomeDir());
	return (message) => {
		try {
			appendFileSync(path, `[${new Date().toISOString()}] ${message}\n`, {
				mode: 0o600,
			});
		} catch {
			// Logging is best-effort; the result file remains authoritative.
		}
	};
}

function readManifest(organizationId: string): HostManifest | null {
	try {
		const parsed = JSON.parse(
			readFileSync(manifestPath(organizationId), "utf8"),
		) as Partial<HostManifest>;
		if (
			typeof parsed.pid !== "number" ||
			typeof parsed.endpoint !== "string" ||
			typeof parsed.authToken !== "string" ||
			typeof parsed.startedAt !== "number" ||
			parsed.organizationId !== organizationId
		) {
			return null;
		}
		return parsed as HostManifest;
	} catch {
		return null;
	}
}

async function waitForProcessExit(
	pid: number,
	timeoutMs: number,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (!isProcessAlive(pid)) return;
		await delay(POLL_INTERVAL_MS);
	}
}

function resolveInstallRoot(): string {
	const installRoot = process.env.SUPERSET_INSTALL_ROOT;
	if (!installRoot) {
		throw new Error("Missing SUPERSET_INSTALL_ROOT");
	}
	return installRoot;
}

function resolveSupersetBinary(): string {
	return join(resolveInstallRoot(), "bin", "superset");
}

function installBackupRoot(installRoot = resolveInstallRoot()): string {
	return `${installRoot}.bak`;
}

async function waitForLockOwnership(organizationId: string) {
	const deadline = Date.now() + LOCK_HANDOFF_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const lock = readUpdateLock(organizationId, supersetHomeDir());
		if (lock?.pid === process.pid) return lock;
		await delay(50);
	}
	throw new Error("Host did not transfer the update lock to the supervisor");
}

function discardInstallBackup(log: (message: string) => void): void {
	const backupRoot = installBackupRoot();
	try {
		rmSync(backupRoot, { recursive: true, force: true });
		log("removed verified previous install backup");
	} catch (error) {
		log(
			`could not remove previous install backup: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export function rollbackInstall(installRoot = resolveInstallRoot()): void {
	const backupRoot = installBackupRoot(installRoot);
	if (!existsSync(backupRoot)) {
		throw new Error(`Previous install backup is missing at ${backupRoot}`);
	}

	const failedRoot = `${installRoot}.failed-${process.pid}`;
	rmSync(failedRoot, { recursive: true, force: true });
	if (existsSync(installRoot)) renameSync(installRoot, failedRoot);
	try {
		renameSync(backupRoot, installRoot);
	} catch (error) {
		if (existsSync(failedRoot) && !existsSync(installRoot)) {
			renameSync(failedRoot, installRoot);
		}
		throw error;
	}
	rmSync(failedRoot, { recursive: true, force: true });
}

function assertRestartOrganization(organizationId: string): void {
	const configPath =
		process.env.SUPERSET_AUTH_CONFIG_PATH ??
		join(supersetHomeDir(), "config.json");
	let configuredOrganizationId: unknown;
	try {
		const config = JSON.parse(readFileSync(configPath, "utf8")) as {
			organizationId?: unknown;
		};
		configuredOrganizationId = config.organizationId;
	} catch (error) {
		throw new Error(
			`Cannot read persisted Superset auth config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (configuredOrganizationId !== organizationId) {
		throw new Error(
			`Refusing to restart organization ${organizationId}; persisted CLI organization is ${String(configuredOrganizationId ?? "unset")}`,
		);
	}
}

export function signalDetachedProcessGroup(
	pid: number,
	signal: NodeJS.Signals,
	signalProcess: typeof process.kill = process.kill,
): void {
	if (!Number.isSafeInteger(pid) || pid <= 1) {
		throw new Error(`Refusing to signal invalid process group ${pid}`);
	}
	try {
		signalProcess(-pid, signal);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
	}
}

interface RunCommandOptions {
	log: (message: string) => void;
	timeoutMs: number;
	environmentOverrides?: NodeJS.ProcessEnv;
	terminationGraceMs?: number;
	spawnProcess?: typeof spawn;
	signalProcessGroup?: (pid: number, signal: NodeJS.Signals) => void;
}

export async function runCommand(
	command: string,
	args: string[],
	options: RunCommandOptions,
): Promise<void> {
	options.log(`running ${command} ${args.join(" ")}`);
	await new Promise<void>((resolve, reject) => {
		const spawnProcess = options.spawnProcess ?? spawn;
		const child = spawnProcess(command, args, {
			detached: true,
			env: { ...process.env, ...options.environmentOverrides },
			stdio: ["ignore", "pipe", "pipe"],
		});
		const terminationGraceMs =
			options.terminationGraceMs ?? COMMAND_TERMINATION_GRACE_MS;
		const signalProcessGroup =
			options.signalProcessGroup ?? signalDetachedProcessGroup;
		const timeoutError = new Error(
			`${command} ${args.join(" ")} timed out after ${options.timeoutMs}ms`,
		);
		let settled = false;
		let timedOut = false;
		let killTimer: ReturnType<typeof setTimeout> | null = null;
		let hardDeadline: ReturnType<typeof setTimeout> | null = null;

		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			if (killTimer) clearTimeout(killTimer);
			if (hardDeadline) clearTimeout(hardDeadline);
			if (timedOut) {
				child.stdout?.destroy();
				child.stderr?.destroy();
				child.unref();
			}
			if (error) reject(error);
			else resolve();
		};

		const terminate = (signal: NodeJS.Signals) => {
			if (!child.pid) return;
			try {
				signalProcessGroup(child.pid, signal);
			} catch (error) {
				options.log(
					`failed to signal command process group ${child.pid}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		};

		const timeout = setTimeout(() => {
			timedOut = true;
			options.log(
				`command timed out after ${options.timeoutMs}ms; terminating process group`,
			);
			terminate("SIGTERM");
			killTimer = setTimeout(() => terminate("SIGKILL"), terminationGraceMs);
			hardDeadline = setTimeout(
				() => finish(timeoutError),
				terminationGraceMs * 2,
			);
		}, options.timeoutMs);

		child.stdout?.on("data", (chunk: Buffer | string) => {
			for (const line of String(chunk).trimEnd().split("\n")) {
				if (line) options.log(`stdout: ${line}`);
			}
		});
		child.stderr?.on("data", (chunk: Buffer | string) => {
			for (const line of String(chunk).trimEnd().split("\n")) {
				if (line) options.log(`stderr: ${line}`);
			}
		});
		child.once("error", (error) => finish(error));
		child.once("close", (code, signal) => {
			if (timedOut) {
				finish(timeoutError);
				return;
			}
			if (code === 0) {
				finish();
				return;
			}
			finish(
				new Error(
					`${command} ${args.join(" ")} exited ${code ?? `on ${signal ?? "unknown signal"}`}`,
				),
			);
		});
	});
}

export function extractHostInfoVersion(payload: unknown): string | null {
	if (!payload || typeof payload !== "object") return null;
	const result = (payload as { result?: unknown }).result;
	if (!result || typeof result !== "object") return null;
	const data = (result as { data?: unknown }).data;
	if (!data || typeof data !== "object") return null;
	const json = (data as { json?: unknown }).json;
	if (!json || typeof json !== "object") return null;
	const version = (json as { version?: unknown }).version;
	return typeof version === "string" ? version : null;
}

async function queryHostVersion(
	manifest: HostManifest,
): Promise<string | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 2_000);
	try {
		const url = new URL("/trpc/host.info", manifest.endpoint);
		url.searchParams.set("input", JSON.stringify({ json: null }));
		const response = await fetch(url, {
			headers: { Authorization: `Bearer ${manifest.authToken}` },
			signal: controller.signal,
		});
		if (!response.ok) return null;
		return extractHostInfoVersion(await response.json());
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

export function isUnchangedHostManifest(
	expected: HostManifest,
	actual: HostManifest | null,
): actual is HostManifest {
	return (
		actual !== null &&
		actual.pid === expected.pid &&
		actual.endpoint === expected.endpoint &&
		actual.authToken === expected.authToken &&
		actual.startedAt === expected.startedAt &&
		actual.organizationId === expected.organizationId &&
		actual.version === expected.version
	);
}

export async function verifyAuthenticatedHost(options: {
	expectedManifest: HostManifest;
	expectedVersion: string;
	readCurrentManifest?: (organizationId: string) => HostManifest | null;
	queryVersion?: (manifest: HostManifest) => Promise<string | null>;
}): Promise<HostManifest> {
	const readCurrentManifest = options.readCurrentManifest ?? readManifest;
	const queryVersion = options.queryVersion ?? queryHostVersion;
	const current = readCurrentManifest(options.expectedManifest.organizationId);
	if (!isUnchangedHostManifest(options.expectedManifest, current)) {
		throw new Error(
			"Host manifest changed during update; refusing to signal it",
		);
	}

	const reportedVersion = await queryVersion(current);
	if (reportedVersion !== options.expectedVersion) {
		throw new Error(
			`Host identity check failed before signal (expected ${options.expectedVersion}, reported ${reportedVersion ?? "unreachable"})`,
		);
	}
	return current;
}

async function stopVerifiedHost(
	manifest: HostManifest,
	expectedVersion: string,
	log: (message: string) => void,
): Promise<void> {
	const verified = await verifyAuthenticatedHost({
		expectedManifest: manifest,
		expectedVersion,
	});
	try {
		process.kill(verified.pid, "SIGTERM");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
	}
	await waitForProcessExit(verified.pid, OLD_HOST_EXIT_TIMEOUT_MS);
	if (isProcessAlive(verified.pid)) {
		// PID reuse or a rewritten manifest must never turn the fallback into a
		// SIGKILL of an unrelated process. Authenticate the host again first.
		await verifyAuthenticatedHost({
			expectedManifest: manifest,
			expectedVersion,
		});
		log(`verified host pid=${verified.pid} did not exit; sending SIGKILL`);
		process.kill(verified.pid, "SIGKILL");
		await waitForProcessExit(verified.pid, 5_000);
	}
	if (isProcessAlive(verified.pid)) {
		throw new Error(`Verified host pid=${verified.pid} did not exit`);
	}
}

async function waitForTargetHost(
	organizationId: string,
	previousStartedAt: number,
	targetVersion: string,
	log: (message: string) => void,
): Promise<void> {
	const deadline = Date.now() + NEW_HOST_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const manifest = readManifest(organizationId);
		if (
			manifest &&
			manifest.startedAt > previousStartedAt &&
			isProcessAlive(manifest.pid)
		) {
			const reportedVersion = await queryHostVersion(manifest);
			if (reportedVersion === targetVersion) {
				log(`verified host pid=${manifest.pid} version=${reportedVersion}`);
				return;
			}
			if (reportedVersion) {
				log(`host reported ${reportedVersion}; waiting for ${targetVersion}`);
			}
		}
		await delay(POLL_INTERVAL_MS);
	}
	throw new Error(
		`Host did not return on version ${targetVersion} within ${NEW_HOST_TIMEOUT_MS / 1_000}s`,
	);
}

function releaseOwnedLock(organizationId: string): void {
	releaseUpdateLock({
		organizationId,
		ownerPid: process.pid,
		homeDir: supersetHomeDir(),
	});
}

async function main(): Promise<void> {
	const organizationId = requiredEnv("SUPERSET_UPDATE_ORG_ID");
	const oldPid = parsePid(
		requiredEnv("SUPERSET_UPDATE_OLD_PID"),
		"SUPERSET_UPDATE_OLD_PID",
	);
	const targetVersion = requiredEnv("SUPERSET_UPDATE_TARGET_VERSION");
	let previousVersion =
		process.env.SUPERSET_UPDATE_PREVIOUS_VERSION || "unknown";
	const log = createLogger(organizationId);
	const previousManifest = readManifest(organizationId);
	let installSucceeded = false;

	log(
		`supervisor pid=${process.pid} hostPid=${oldPid} target=${targetVersion}`,
	);

	try {
		const ownedLock = await waitForLockOwnership(organizationId);
		if (previousVersion === "unknown") {
			previousVersion = ownedLock.previousVersion;
		}
		assertRestartOrganization(organizationId);
		if (!previousManifest || previousManifest.pid !== oldPid) {
			throw new Error(
				"Running host manifest does not match the update request",
			);
		}
		const supersetBinary = resolveSupersetBinary();
		if (!existsSync(supersetBinary)) {
			throw new Error(`Superset CLI not found at ${supersetBinary}`);
		}

		// Download and atomically replace the install while the old host remains
		// available. A failed download therefore never strands the remote host.
		await runCommand(supersetBinary, ["update", "--version", targetVersion], {
			log,
			timeoutMs: UPDATE_COMMAND_TIMEOUT_MS,
			environmentOverrides: { SUPERSET_UPDATE_KEEP_BACKUP: "1" },
		});
		installSucceeded = true;

		log(`authenticating old host pid=${oldPid} before restart`);
		await stopVerifiedHost(previousManifest, previousVersion, log);

		await runCommand(supersetBinary, ["start", "--daemon"], {
			log,
			timeoutMs: START_COMMAND_TIMEOUT_MS,
		});
		await waitForTargetHost(
			organizationId,
			previousManifest?.startedAt ?? 0,
			targetVersion,
			log,
		);

		writeUpdateResult(
			organizationId,
			{
				status: "succeeded",
				targetVersion,
				previousVersion,
				finalVersion: targetVersion,
				completedAt: Date.now(),
			},
			supersetHomeDir(),
		);
		discardInstallBackup(log);
		log(`update completed on ${targetVersion}`);
	} catch (error) {
		let message = error instanceof Error ? error.message : String(error);

		// If installation completed but the new host failed verification, stop
		// that process, restore the retained atomic backup, and restart the old
		// bundle. The result remains failed even when recovery succeeds.
		if (installSucceeded) {
			try {
				const currentManifest = readManifest(organizationId);
				const currentVersion = currentManifest
					? await queryHostVersion(currentManifest)
					: null;
				const currentIsOriginal = previousManifest
					? isUnchangedHostManifest(previousManifest, currentManifest)
					: false;
				if (currentManifest && currentVersion && !currentIsOriginal) {
					log(
						`stopping authenticated replacement host pid=${currentManifest.pid}`,
					);
					await stopVerifiedHost(currentManifest, currentVersion, log);
				}
				rollbackInstall();
				log("restored previous install backup");

				const rollbackManifest = readManifest(organizationId);
				const rollbackVersion = rollbackManifest
					? await queryHostVersion(rollbackManifest)
					: null;
				if (rollbackVersion !== previousVersion) {
					removeStaleHostManifest(organizationId);
					log("removed stale host manifest before recovery restart");
					await runCommand(resolveSupersetBinary(), ["start", "--daemon"], {
						log,
						timeoutMs: START_COMMAND_TIMEOUT_MS,
					});
				} else {
					log(
						`previous host remains authenticated on ${previousVersion}; restart not needed`,
					);
				}
			} catch (recoveryError) {
				message += `; rollback recovery failed: ${
					recoveryError instanceof Error
						? recoveryError.message
						: String(recoveryError)
				}`;
			}
		}

		writeUpdateResult(
			organizationId,
			{
				status: "failed",
				targetVersion,
				previousVersion,
				error: message.slice(0, MAX_RESULT_ERROR_LENGTH),
				completedAt: Date.now(),
			},
			supersetHomeDir(),
		);
		log(`update failed: ${message}`);
		process.exitCode = 1;
	} finally {
		releaseOwnedLock(organizationId);
	}
}

if (isMainModule(import.meta.url)) void main();
