import type { TranscriptRow } from "../transcriptRows";

/** The key of each settled turn's last agent reply, whatever rows follow it in the turn. */
export function lastReplyKeys(rows: readonly TranscriptRow[]): Set<string> {
	const keys = new Set<string>();
	let lastInTurn: string | null = null;
	let turnRunning = false;
	for (const row of rows) {
		if (row.groupStart) {
			if (lastInTurn && !turnRunning) keys.add(lastInTurn);
			lastInTurn = null;
			turnRunning = false;
		}
		if (row.kind === "working") turnRunning = row.running;
		if (row.kind === "item" && row.item.kind === "agent_message") {
			lastInTurn = row.key;
		}
	}
	if (lastInTurn && !turnRunning) keys.add(lastInTurn);
	return keys;
}
