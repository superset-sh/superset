import type { HostDb } from "../../db/index.ts";
import { terminalSessions } from "../../db/schema.ts";
import { portManager } from "../../ports/port-manager.ts";
import { getDaemonClient } from "../daemon-client-singleton.ts";
import { disposeSessionAndWait, isLiveTerminalSession } from "../terminal.ts";

interface ReapResult {
	reaped: number;
	failed: number;
}

export const REAP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * A host-service restart begins with an empty port scanner while the detached
 * pty-daemon keeps dev servers alive. The reap pass re-registers those sessions,
 * but it runs only once immediately and then every {@link REAP_INTERVAL_MS} — and
 * the just-adopted daemon may not yet list its sessions the instant that first
 * pass runs. Re-sync the port scanner a few times over the first ~90s so restored
 * dev-server ports appear promptly, instead of waiting for the next reap tick or
 * a renderer attach. All offsets stay below REAP_INTERVAL_MS so the warm-up fully
 * covers the gap before the first scheduled reap.
 */
export const PORT_SCAN_WARMUP_DELAYS_MS = [
	2_000, 5_000, 10_000, 20_000, 45_000, 90_000,
];

interface TerminalRow {
	status: string;
	originWorkspaceId: string | null;
}

export interface PortScanSyncPlan {
	register: { terminalId: string; workspaceId: string; pid: number }[];
	unregister: string[];
}

/**
 * Decide which terminals the port scanner should start and stop watching,
 * given the daemon's live sessions and this host's session rows. Pure so the
 * policy is unit testable without a daemon, database, or port manager.
 *
 * Register every alive daemon session that maps to an active workspace row and
 * isn't already owned by a live in-memory session. This is what makes a
 * workspace's dev-server ports appear before any renderer attaches to the
 * terminal — e.g. sessions the daemon kept alive across a host-service restart.
 * v1 desktop did this in its startup reconcile; v2 previously only registered
 * terminals a renderer had explicitly opened, so ports were detected less
 * completely.
 *
 * Unregister every currently-watched terminal the daemon no longer reports and
 * that no live in-memory session owns. Sessions adopted here never get the
 * daemon exit subscription that normally unregisters them, so without this they
 * would be scanned forever after the process exits. The `isLive` guard keeps a
 * renderer-attached session from being dropped if it's momentarily absent from
 * a racy `daemon.list()`.
 */
export function planPortScanSync({
	liveSessions,
	rowById,
	registeredTerminalIds,
	isLive,
}: {
	liveSessions: { id: string; pid: number }[];
	rowById: Map<string, TerminalRow>;
	registeredTerminalIds: string[];
	isLive: (terminalId: string) => boolean;
}): PortScanSyncPlan {
	const aliveIds = new Set(liveSessions.map((session) => session.id));

	const register: PortScanSyncPlan["register"] = [];
	for (const session of liveSessions) {
		if (isLive(session.id)) continue;
		const row = rowById.get(session.id);
		if (!row?.originWorkspaceId) continue;
		if (row.status !== "active") continue;
		register.push({
			terminalId: session.id,
			workspaceId: row.originWorkspaceId,
			pid: session.pid,
		});
	}

	const unregister: string[] = [];
	for (const terminalId of registeredTerminalIds) {
		if (aliveIds.has(terminalId)) continue;
		if (isLive(terminalId)) continue;
		unregister.push(terminalId);
	}

	return { register, unregister };
}

function loadTerminalRowsById(db: HostDb): Map<string, TerminalRow> {
	const rows = db
		.select({
			id: terminalSessions.id,
			status: terminalSessions.status,
			originWorkspaceId: terminalSessions.originWorkspaceId,
		})
		.from(terminalSessions)
		.all();
	return new Map(rows.map((row) => [row.id, row]));
}

// Port scanning is best-effort: a port-manager error must not propagate to the
// caller — the reap pass (whose orphan cleanup must still run) or a warm-up sync.
function applyPortScanSync(
	liveSessions: { id: string; pid: number }[],
	rowById: Map<string, TerminalRow>,
): void {
	try {
		const plan = planPortScanSync({
			liveSessions,
			rowById,
			registeredTerminalIds: portManager.getRegisteredTerminalIds(),
			isLive: isLiveTerminalSession,
		});
		for (const entry of plan.register) {
			portManager.upsertSession(entry.terminalId, entry.workspaceId, entry.pid);
		}
		if (plan.register.length > 0) {
			console.log(
				`[host-service] port-scan sync: registered ${plan.register.length} unattached daemon session(s) for scanning`,
			);
		}
		for (const terminalId of plan.unregister) {
			portManager.unregisterSession(terminalId);
		}
	} catch (err) {
		console.warn("[host-service] port-scan sync failed:", err);
	}
}

async function runPortScanSync(db: HostDb) {
	const daemon = await getDaemonClient();
	const liveSessions = (await daemon.list()).filter((session) => session.alive);
	const rowById =
		liveSessions.length > 0
			? loadTerminalRowsById(db)
			: new Map<string, TerminalRow>();
	applyPortScanSync(liveSessions, rowById);
	return { liveSessions, rowById };
}

let inFlightPortScanSync: ReturnType<typeof runPortScanSync> | null = null;

/**
 * Re-register the port scanner against the daemon's live sessions. Extracted so
 * it can run on its own cadence — decoupled from the 5-minute orphan reap —
 * because restored dev-server ports must appear promptly after a host-service
 * restart. Returns the daemon's live sessions so the reap pass can reuse them
 * without a second `daemon.list()`.
 *
 * Coalesces concurrent callers onto one in-flight run: the warm-up timers and
 * the reap pass both call this, and a slow `daemon.list()` right after adoption
 * (exactly when the warm-up fires) could otherwise let a second sync observe a
 * transiently-empty list and unregister sessions the first just registered.
 */
function syncPortScans(db: HostDb): ReturnType<typeof runPortScanSync> {
	if (inFlightPortScanSync) return inFlightPortScanSync;
	inFlightPortScanSync = runPortScanSync(db).finally(() => {
		inFlightPortScanSync = null;
	});
	return inFlightPortScanSync;
}

async function reapOrphanedSessions(
	db: HostDb,
	rowlessPendingSecondPass: Set<string>,
): Promise<ReapResult> {
	// Sync the port scanner before the empty-list short-circuit below so an idle
	// daemon still drops stale scans.
	const { liveSessions, rowById } = await syncPortScans(db);

	if (liveSessions.length === 0) {
		rowlessPendingSecondPass.clear();
		return { reaped: 0, failed: 0 };
	}

	const orphans: { id: string; rowless: boolean }[] = [];
	const stillRowless = new Set<string>();
	for (const session of liveSessions) {
		const row = rowById.get(session.id);
		if (!row) {
			if (rowlessPendingSecondPass.has(session.id)) {
				orphans.push({ id: session.id, rowless: true });
			} else {
				stillRowless.add(session.id);
			}
			continue;
		}
		if (
			row.status === "disposed" ||
			row.status === "exited" ||
			!row.originWorkspaceId
		) {
			orphans.push({ id: session.id, rowless: false });
		}
	}

	let reaped = 0;
	let failed = 0;
	for (const orphan of orphans) {
		try {
			const result = await disposeSessionAndWait(orphan.id, db);
			if (result.daemonCloseSucceeded) {
				reaped += 1;
				continue;
			}
		} catch {
			// fall through to the failure path below
		}
		failed += 1;
		// A failed kill on a confirmed (second-pass) rowless orphan is kept
		// pending so the next pass retries it instead of restarting its
		// two-pass clock.
		if (orphan.rowless) stillRowless.add(orphan.id);
	}

	rowlessPendingSecondPass.clear();
	for (const id of stillRowless) rowlessPendingSecondPass.add(id);

	return { reaped, failed };
}

export function startTerminalReaper(db: HostDb): () => void {
	const rowlessPendingSecondPass = new Set<string>();
	let running = false;
	const run = () => {
		if (running) return;
		running = true;
		void reapOrphanedSessions(db, rowlessPendingSecondPass)
			.then((result) => {
				if (result.reaped > 0 || result.failed > 0) {
					console.log(
						`[host-service] terminal reaper: ${result.reaped} reaped, ${result.failed} failed`,
					);
				}
			})
			.catch((err) => {
				console.warn("[host-service] terminal reaper failed:", err);
			})
			.finally(() => {
				running = false;
			});
	};
	run();
	const interval = setInterval(run, REAP_INTERVAL_MS);
	interval.unref();

	// Runs only the port-scan sync, not the full reap, so the warm-up never
	// disturbs the reaper's two-pass rowless-orphan clock.
	const warmupTimers = PORT_SCAN_WARMUP_DELAYS_MS.map((delay) =>
		setTimeout(() => {
			void syncPortScans(db).catch((err) => {
				console.warn("[host-service] port-scan warm-up sync failed:", err);
			});
		}, delay),
	);
	for (const timer of warmupTimers) timer.unref();

	return () => {
		clearInterval(interval);
		for (const timer of warmupTimers) clearTimeout(timer);
	};
}
