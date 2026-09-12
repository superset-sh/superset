import { execFile, spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { HostInstallSource } from "@superset/shared/host-version";
import { acquireInstallUpdateLock } from "@superset/shared/install-update-lock";

export type SelfUpdatePhase = "idle" | "downloading" | "restarting" | "failed";

/**
 * Written by the process that ran an update, read by whatever process
 * serves next, so the outcome survives the restart in between.
 */
export interface LastUpdateResult {
	outcome: "updated" | "rolled-back" | "failed";
	from: string;
	to: string;
	at: number;
	error?: string;
}

export interface SelfUpdateStatus {
	phase: SelfUpdatePhase;
	target: string | null;
	startedAt: number | null;
	error: string | null;
	/** True when this process can update itself in place. */
	updatable: boolean;
	installSource: HostInstallSource;
	lastResult: LastUpdateResult | null;
}

export interface StartUpdateInput {
	/** Semver to install; the CLI's rolling latest when omitted. */
	version?: string;
	/** Reinstall even when already on the target. */
	force?: boolean;
}

export interface CliUpdateResult {
	ok: boolean;
	stdout: string;
	stderr: string;
}

export interface SpawnedHost {
	pid: number;
	kill(): Promise<void>;
	isRunning(): boolean;
}

/**
 * Everything the updater touches outside its own state, so tests can drive
 * the whole sequence (download, swap, restart, verify, roll back) without a
 * real install or a real process restart.
 */
export interface SelfUpdaterDeps {
	installSource: HostInstallSource;
	currentVersion: string;
	/** `<installRoot>/lib/node` for a standalone install. */
	execPath: string;
	/** Where the host listens; the successor must answer here. */
	port: number;
	secret: string;
	/** Directory holding host.db, the manifest and the update marker. */
	stateDir: string;
	runCliUpdate(cliBin: string, args: string[]): Promise<CliUpdateResult>;
	spawnHost(hostBin: string): SpawnedHost;
	/** Resolves to the version answering on the port, or null on timeout. */
	pollHealth(
		port: number,
		secret: string,
		timeoutMs: number,
	): Promise<{ version: string; pid?: number } | null>;
	/** Stop listening and drop the relay so the successor can take the port. */
	stopServing(): Promise<void>;
	exit(code: number): void;
	log(message: string): void;
}

const SUCCESSOR_HEALTH_TIMEOUT_MS = 90_000;
const ROLLBACK_HEALTH_TIMEOUT_MS = 60_000;

export class SelfUpdateError extends Error {
	constructor(
		public readonly reason: "not-updatable" | "no-install",
		message: string,
	) {
		super(message);
	}
}

/** `<root>/lib/node` → `<root>`. */
export function installRootFromExecPath(execPath: string): string {
	return dirname(dirname(execPath));
}

export function updateMarkerPath(stateDir: string): string {
	return join(stateDir, "host-update.json");
}

export class SelfUpdater {
	private phase: SelfUpdatePhase = "idle";
	private target: string | null = null;
	private startedAt: number | null = null;
	private error: string | null = null;
	private releaseLock: (() => void) | null = null;

	constructor(private readonly deps: SelfUpdaterDeps) {}

	status(): SelfUpdateStatus {
		return {
			phase: this.phase,
			target: this.target,
			startedAt: this.startedAt,
			error: this.error,
			updatable: this.installRoot() !== null,
			installSource: this.deps.installSource,
			lastResult: this.readMarker(),
		};
	}

	/**
	 * Kick off an update and return at once; progress is read back through
	 * {@link status} until the process restarts, then through the marker.
	 * A second call while one is running returns the running one.
	 */
	start(input: StartUpdateInput): SelfUpdateStatus {
		if (this.phase === "downloading" || this.phase === "restarting") {
			return this.status();
		}
		const root = this.installRoot();
		if (!root) {
			throw this.deps.installSource === "cli"
				? new SelfUpdateError(
						"no-install",
						`No standalone install around ${this.deps.execPath}`,
					)
				: new SelfUpdateError(
						"not-updatable",
						`A ${this.deps.installSource} host-service cannot update itself`,
					);
		}
		this.releaseLock = acquireInstallUpdateLock(root);
		this.phase = "downloading";
		this.target = input.version ?? null;
		this.startedAt = Date.now();
		this.error = null;
		void this.run(root, input)
			.catch((error) => {
				this.fail(error instanceof Error ? error.message : String(error));
			})
			.finally(() => this.unlock());
		return this.status();
	}

	private unlock(): void {
		this.releaseLock?.();
		this.releaseLock = null;
	}

	private installRoot(): string | null {
		if (this.deps.installSource !== "cli") return null;
		const root = installRootFromExecPath(this.deps.execPath);
		const hasBins =
			existsSync(join(root, "bin", "superset")) &&
			existsSync(join(root, "bin", "superset-host"));
		return hasBins ? root : null;
	}

	private fail(message: string): void {
		this.phase = "failed";
		this.error = message;
		this.deps.log(`[self-update] failed: ${message}`);
	}

	private async run(root: string, input: StartUpdateInput): Promise<void> {
		const from = this.deps.currentVersion;
		const args = ["update", "--json", "--keep-backup"];
		if (input.version) args.push("--version", input.version);
		if (input.force) args.push("--force");
		this.deps.log(`[self-update] running superset ${args.join(" ")}`);
		const result = await this.deps.runCliUpdate(
			join(root, "bin", "superset"),
			args,
		);
		if (!result.ok) {
			this.fail(
				tail(result.stderr || result.stdout) || "superset update failed",
			);
			return;
		}
		const parsed = parseUpdateOutput(result.stdout);
		if (!parsed) {
			this.fail(
				`unexpected output from superset update: ${tail(result.stdout)}`,
			);
			return;
		}
		if (!parsed.updated && parsed.target === from) {
			this.phase = "idle";
			return;
		}
		const to = parsed.target;
		this.target = to;
		this.phase = "restarting";
		// If this process dies mid-restart the successor (or the restored old
		// build) still finds a marker that says the update never completed.
		this.writeMarker({
			outcome: "failed",
			from,
			to,
			at: Date.now(),
			error: "restart interrupted",
		});
		this.deps.log(`[self-update] ${from} → ${to} installed; restarting`);

		await this.deps.stopServing();
		const hostBin = join(root, "bin", "superset-host");
		let successor: SpawnedHost | null = null;
		let health: { version: string; pid?: number } | null = null;
		try {
			successor = this.deps.spawnHost(hostBin);
			if (successor.pid > 0)
				health = await this.deps.pollHealth(
					this.deps.port,
					this.deps.secret,
					SUCCESSOR_HEALTH_TIMEOUT_MS,
				);
		} catch (error) {
			this.deps.log(`[self-update] successor failed: ${String(error)}`);
		}
		if (
			successor?.isRunning() &&
			health?.version === to &&
			(health.pid === undefined || health.pid === successor.pid)
		) {
			this.writeManifestPid(successor.pid);
			await rm(`${root}.bak`, { recursive: true, force: true });
			this.writeMarker({
				outcome: "updated",
				from,
				to: health.version,
				at: Date.now(),
			});
			this.deps.log(
				`[self-update] successor healthy on ${health.version} (pid ${successor.pid}); exiting`,
			);
			this.unlock();
			this.deps.exit(0);
			return;
		}

		this.deps.log("[self-update] successor never answered; rolling back");
		await successor?.kill();
		const error = health
			? `The new build answered on ${health.version}, expected ${to}`
			: `The new build did not answer within ${SUCCESSOR_HEALTH_TIMEOUT_MS / 1000}s`;
		const backup = `${root}.bak`;
		if (!existsSync(backup)) {
			this.writeMarker({ outcome: "failed", from, to, at: Date.now(), error });
			this.unlock();
			this.deps.exit(1);
			return;
		}
		if (existsSync(backup)) {
			const failed = `${root}.failed`;
			await rm(failed, { recursive: true, force: true });
			renameSync(root, failed);
			renameSync(backup, root);
			await rm(failed, { recursive: true, force: true });
		}
		let restored: SpawnedHost | null = null;
		let restoredHealth: { version: string; pid?: number } | null = null;
		try {
			restored = this.deps.spawnHost(hostBin);
			if (restored.pid > 0)
				restoredHealth = await this.deps.pollHealth(
					this.deps.port,
					this.deps.secret,
					ROLLBACK_HEALTH_TIMEOUT_MS,
				);
		} catch (error) {
			this.deps.log(`[self-update] rollback failed: ${String(error)}`);
		}
		const rollbackHealthy =
			restored?.isRunning() === true &&
			restoredHealth?.version === from &&
			restoredHealth.pid === restored.pid;
		if (rollbackHealthy && restored) this.writeManifestPid(restored.pid);
		this.writeMarker({
			outcome: rollbackHealthy ? "rolled-back" : "failed",
			from,
			to,
			at: Date.now(),
			error: rollbackHealthy
				? error
				: `${error}; rollback did not return the expected process on ${from}`,
		});
		this.deps.log(
			rollbackHealthy
				? `[self-update] rolled back to ${from} (pid ${restored?.pid})`
				: "[self-update] rollback did not come up either; check the log",
		);
		this.unlock();
		this.deps.exit(rollbackHealthy ? 0 : 1);
	}

	private readMarker(): LastUpdateResult | null {
		try {
			const raw = readFileSync(updateMarkerPath(this.deps.stateDir), "utf8");
			return JSON.parse(raw) as LastUpdateResult;
		} catch {
			return null;
		}
	}

	private writeMarker(result: LastUpdateResult): void {
		try {
			mkdirSync(this.deps.stateDir, { recursive: true });
			writeFileSync(
				updateMarkerPath(this.deps.stateDir),
				JSON.stringify(result, null, 2),
			);
		} catch (error) {
			this.deps.log(`[self-update] could not write marker: ${String(error)}`);
		}
	}

	/**
	 * The CLI recorded the pid it spawned; `superset status`/`stop` read it, so
	 * the successor has to take its place in the manifest.
	 */
	private writeManifestPid(pid: number): void {
		const path = join(this.deps.stateDir, "manifest.json");
		try {
			if (!existsSync(path)) return;
			const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<
				string,
				unknown
			>;
			writeFileSync(
				path,
				JSON.stringify({ ...manifest, pid, startedAt: Date.now() }, null, 2),
				{ mode: 0o600 },
			);
		} catch (error) {
			this.deps.log(
				`[self-update] could not update manifest: ${String(error)}`,
			);
		}
	}
}

function tail(text: string, max = 400): string {
	const trimmed = text.trim();
	return trimmed.length > max ? trimmed.slice(-max) : trimmed;
}

/** `superset update --json` prints the command's data object. */
export function parseUpdateOutput(
	stdout: string,
): { updated: boolean; target: string } | null {
	const start = stdout.indexOf("{");
	if (start === -1) return null;
	try {
		const value = JSON.parse(stdout.slice(start)) as {
			updated?: boolean;
			target?: string;
			data?: { updated?: boolean; target?: string };
		};
		const data = value.data ?? value;
		if (typeof data.target !== "string") return null;
		return { updated: data.updated === true, target: data.target };
	} catch {
		return null;
	}
}

/* Production dependencies                                              */

export function execCliUpdate(
	cliBin: string,
	args: string[],
): Promise<CliUpdateResult> {
	return new Promise((resolve) => {
		execFile(
			cliBin,
			args,
			{
				maxBuffer: 4 * 1024 * 1024,
				timeout: 10 * 60_000,
				env: {
					...process.env,
					SUPERSET_INSTALL_ROOT: dirname(dirname(cliBin)),
				},
			},
			(error, stdout, stderr) => {
				resolve({
					ok: !error,
					stdout: String(stdout),
					stderr: String(stderr),
				});
			},
		);
	});
}

/**
 * Start the successor the way the CLI would: detached, inheriting this
 * process's env (which carries the port, secret and install source) and its
 * stdio (the rotating log file under `superset start --daemon`).
 */
export function spawnDetachedHost(hostBin: string): SpawnedHost {
	const child = spawn(hostBin, [], {
		detached: true,
		stdio: "inherit",
		env: process.env,
	});
	child.on("error", () => {
		// Startup failure is observed by the health probe and triggers rollback.
	});
	child.unref();
	const isRunning = () =>
		child.pid !== undefined &&
		child.exitCode === null &&
		child.signalCode === null;
	const waitForExit = (timeoutMs: number) =>
		new Promise<boolean>((resolve) => {
			if (!isRunning()) {
				resolve(true);
				return;
			}
			const done = () => {
				clearTimeout(timer);
				resolve(true);
			};
			const timer = setTimeout(() => {
				child.off("exit", done);
				resolve(false);
			}, timeoutMs);
			child.once("exit", done);
		});
	return {
		pid: child.pid ?? 0,
		isRunning,
		kill: async () => {
			if (!isRunning()) return;
			child.kill("SIGTERM");
			if (await waitForExit(5_000)) return;
			child.kill("SIGKILL");
			if (!(await waitForExit(5_000)))
				throw new Error(
					"Failed successor did not exit; refusing to replace its install",
				);
		},
	};
}

export async function pollHostHealth(
	port: number,
	secret: string,
	timeoutMs: number,
): Promise<{ version: string; pid?: number } | null> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(
				`http://127.0.0.1:${port}/trpc/health.check`,
				{
					headers: { Authorization: `Bearer ${secret}` },
					signal: AbortSignal.timeout(2_000),
				},
			);
			if (response.ok) {
				const body = (await response.json()) as {
					result?: {
						data?: {
							json?: { status?: string; version?: string; pid?: number };
						};
					};
				};
				const health = body.result?.data?.json;
				if (health?.status === "ok" && typeof health.version === "string") {
					return {
						version: health.version,
						...(typeof health.pid === "number" ? { pid: health.pid } : {}),
					};
				}
			}
		} catch {
			// not up yet
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	return null;
}
