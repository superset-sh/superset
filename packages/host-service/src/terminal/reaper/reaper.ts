import type { HostDb } from "../../db/index.ts";
import { terminalSessions } from "../../db/schema.ts";
import { getDaemonClient } from "../daemon-client-singleton.ts";
import { disposeSessionAndWait } from "../terminal.ts";

interface ReapResult {
	reaped: number;
	failed: number;
}

const REAP_INTERVAL_MS = 5 * 60 * 1000;

async function reapOrphanedSessions(
	db: HostDb,
	rowlessPendingSecondPass: Set<string>,
): Promise<ReapResult> {
	const daemon = await getDaemonClient();
	const liveSessions = (await daemon.list()).filter((session) => session.alive);
	if (liveSessions.length === 0) {
		rowlessPendingSecondPass.clear();
		return { reaped: 0, failed: 0 };
	}

	const rows = db
		.select({
			id: terminalSessions.id,
			status: terminalSessions.status,
			originWorkspaceId: terminalSessions.originWorkspaceId,
		})
		.from(terminalSessions)
		.all();
	const rowById = new Map(rows.map((row) => [row.id, row]));

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
	return () => clearInterval(interval);
}
