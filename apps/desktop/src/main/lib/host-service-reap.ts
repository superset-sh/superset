import type { HostServiceManifest } from "./host-service-manifest";

/**
 * Reaping a previous host-service before spawning a new one for an org.
 *
 * The coordinator only tracks host-services it spawned in this Electron
 * process (its in-memory `instances` map). After an Electron restart that map
 * is empty, so a host-service left alive by a *previous* process is invisible:
 *
 *   - Electron died before `before-quit` ran (hard crash / SIGKILL / OOM), so
 *     the child was never SIGTERMed and the parent watchdog hadn't fired yet;
 *   - a CLI-spawned host-service (no `HOST_PARENT_PID`, so no watchdog at all);
 *   - a wedged child from a failed spawn that ignored SIGTERM.
 *
 * Any of these keeps an open connection to the org's `host.db`. A second writer
 * is what produces migration lock contention. So before spawning we reap based
 * on the manifest — the only cross-process record that a host-service exists.
 *
 * PID-reuse safety: we only kill a pid we can positively identify as our
 * host-service (`confirmOurHostService`). A live-but-unrecognized pid is left
 * alone — we just drop the stale manifest. Killing blind would risk an
 * unrelated process that happened to inherit the recycled pid.
 */

export const REAP_SIGTERM_GRACE_MS = 4_000;
export const REAP_SIGKILL_GRACE_MS = 2_000;
const PID_EXIT_POLL_INTERVAL_MS = 100;

export type ReapReason =
	| "no-manifest"
	| "own-live-instance"
	| "dead-pid-cleared"
	| "unidentified-left-alone"
	| "terminated-sigterm"
	| "terminated-sigkill";

export interface ReapResult {
	reaped: boolean;
	reason: ReapReason;
	pid?: number;
}

export interface ReapDeps {
	readManifest: (organizationId: string) => HostServiceManifest | null;
	removeManifest: (organizationId: string) => void;
	isProcessAlive: (pid: number) => boolean;
	killProcess: (pid: number, signal: NodeJS.Signals) => void;
	/** True when `pid` is a live host-service this process already tracks. */
	isOwnLivePid: (pid: number) => boolean;
	/** Positively confirm the live `pid` is our host-service (health + argv). */
	confirmOurHostService: (manifest: HostServiceManifest) => Promise<boolean>;
	log?: { info: (message: string) => void; warn: (message: string) => void };
	/** Injectable for tests; defaults to setTimeout. */
	sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPidExit(
	pid: number,
	timeoutMs: number,
	isProcessAlive: (pid: number) => boolean,
	sleep: (ms: number) => Promise<void>,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (!isProcessAlive(pid)) return true;
		await sleep(PID_EXIT_POLL_INTERVAL_MS);
	}
	return !isProcessAlive(pid);
}

export async function reapPreviousHostService(
	organizationId: string,
	deps: ReapDeps,
): Promise<ReapResult> {
	const sleep = deps.sleep ?? defaultSleep;
	const manifest = deps.readManifest(organizationId);
	if (!manifest) return { reaped: false, reason: "no-manifest" };

	const { pid } = manifest;

	// Never reap something we already own and track as live.
	if (deps.isOwnLivePid(pid)) {
		return { reaped: false, reason: "own-live-instance", pid };
	}

	if (!deps.isProcessAlive(pid)) {
		deps.removeManifest(organizationId);
		return { reaped: false, reason: "dead-pid-cleared", pid };
	}

	if (!(await deps.confirmOurHostService(manifest))) {
		deps.log?.warn(
			`[host-service:${organizationId}] manifest pid=${pid} is alive but not identifiable as our host-service; leaving it (possible PID reuse) and dropping the stale manifest`,
		);
		deps.removeManifest(organizationId);
		return { reaped: false, reason: "unidentified-left-alone", pid };
	}

	deps.log?.info(
		`[host-service:${organizationId}] reaping previous host-service pid=${pid} before spawn`,
	);

	let reason: ReapReason = "terminated-sigterm";
	try {
		deps.killProcess(pid, "SIGTERM");
	} catch {
		// Exited between the liveness check and the signal — nothing to do.
		deps.removeManifest(organizationId);
		return { reaped: true, reason: "terminated-sigterm", pid };
	}

	if (
		!(await waitForPidExit(
			pid,
			REAP_SIGTERM_GRACE_MS,
			deps.isProcessAlive,
			sleep,
		))
	) {
		try {
			deps.killProcess(pid, "SIGKILL");
			reason = "terminated-sigkill";
		} catch {
			// Raced to exit during the grace window.
		}
		await waitForPidExit(
			pid,
			REAP_SIGKILL_GRACE_MS,
			deps.isProcessAlive,
			sleep,
		);
	}

	deps.removeManifest(organizationId);
	return { reaped: true, reason, pid };
}
