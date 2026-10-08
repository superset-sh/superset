import { unlinkSync } from "node:fs";
import {
	listPtyDaemonManifests,
	type PtyDaemonManifest,
	removePtyDaemonManifest,
} from "@superset/host-service/daemon-manifest";
import {
	type DaemonProbeResult,
	type ProbeAttemptOutcome,
	probeDaemonHello,
} from "@superset/host-service/daemon-probe";
import {
	isPositiveInteger,
	signalProcessTreeAndGroups,
} from "@superset/pty-daemon/process-tree";
import { isProcessAlive, readManifest } from "./host-service-manifest";

/** The coordinator SIGKILLs a host-service 5 s after SIGTERM. */
const HOST_SERVICE_EXIT_TIMEOUT_MS = 6_000;
/** The daemon drains its PTY kills for up to 2 s before it exits. */
const DAEMON_EXIT_TIMEOUT_MS = 3_000;
/** A busy daemon can take seconds to answer; host-service adoption allows 3 s. */
const PROBE_TOTAL_TIMEOUT_MS = 3_000;
const PROBE_ATTEMPT_TIMEOUT_MS = 1_000;
const POLL_INTERVAL_MS = 50;

export interface StopPtyDaemonsDeps {
	listManifests: () => PtyDaemonManifest[];
	isHostServiceRunning: (organizationId: string) => boolean;
	probe: (socketPath: string) => Promise<DaemonProbeResult | null>;
	isAlive: (pid: number) => boolean;
	signalTree: (pid: number, signal: NodeJS.Signals) => void;
	removeManifest: (manifest: PtyDaemonManifest) => void;
	sleep: (ms: number) => Promise<void>;
	hostServiceExitTimeoutMs: number;
	daemonExitTimeoutMs: number;
}

const defaultDeps: StopPtyDaemonsDeps = {
	listManifests: listPtyDaemonManifests,
	isHostServiceRunning: (organizationId) => {
		const manifest = readManifest(organizationId);
		return manifest !== null && isProcessAlive(manifest.pid);
	},
	probe: probeWithRetry,
	isAlive: isProcessAlive,
	signalTree: (pid, signal) => {
		signalProcessTreeAndGroups(pid, signal);
	},
	removeManifest: (manifest) => {
		removePtyDaemonManifest(manifest.organizationId);
		try {
			unlinkSync(manifest.socketPath);
		} catch {
			// best-effort; a fresh daemon unlinks a stale socket on bind
		}
	},
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	hostServiceExitTimeoutMs: HOST_SERVICE_EXIT_TIMEOUT_MS,
	daemonExitTimeoutMs: DAEMON_EXIT_TIMEOUT_MS,
};

/**
 * Kills every pty-daemon and the terminals it owns. Waits for the stopped
 * host-services to exit first: a live host-service respawns a daemon that
 * dies. A daemon whose host-service is still running belongs to another app
 * instance and is left alone.
 */
export async function stopPtyDaemons(
	stoppedHostServicePids: number[],
	overrides: Partial<StopPtyDaemonsDeps> = {},
): Promise<void> {
	const deps = { ...defaultDeps, ...overrides };

	await waitForExit(
		stoppedHostServicePids,
		deps.hostServiceExitTimeoutMs,
		deps,
	);

	const results = await Promise.allSettled(
		deps.listManifests().map(async (manifest) => {
			if (deps.isHostServiceRunning(manifest.organizationId)) return;
			// The manifest pid can be recycled; only the socket proves which
			// process is the daemon.
			const probe = await deps.probe(manifest.socketPath);
			if (!probe || !isPositiveInteger(probe.daemonPid)) return;
			const pid = probe.daemonPid;

			deps.signalTree(pid, "SIGTERM");
			if (!(await waitForExit([pid], deps.daemonExitTimeoutMs, deps))) {
				deps.signalTree(pid, "SIGKILL");
				if (!(await waitForExit([pid], deps.daemonExitTimeoutMs, deps))) {
					throw new Error(
						`pty-daemon pid=${pid} for ${manifest.organizationId} survived SIGKILL`,
					);
				}
			}
			deps.removeManifest(manifest);
		}),
	);
	for (const result of results) {
		if (result.status === "rejected") {
			console.error("[quit] pty-daemon stop failed:", result.reason);
		}
	}
}

async function probeWithRetry(
	socketPath: string,
): Promise<DaemonProbeResult | null> {
	const deadline = Date.now() + PROBE_TOTAL_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const outcome: ProbeAttemptOutcome = {};
		const probe = await probeDaemonHello(
			socketPath,
			Math.min(deadline - Date.now(), PROBE_ATTEMPT_TIMEOUT_MS),
			outcome,
		);
		if (probe || outcome.noListener) return probe;
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
	return null;
}

async function waitForExit(
	pids: number[],
	timeoutMs: number,
	deps: StopPtyDaemonsDeps,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (pids.some(deps.isAlive)) {
		if (Date.now() >= deadline) return false;
		await deps.sleep(POLL_INTERVAL_MS);
	}
	return true;
}
