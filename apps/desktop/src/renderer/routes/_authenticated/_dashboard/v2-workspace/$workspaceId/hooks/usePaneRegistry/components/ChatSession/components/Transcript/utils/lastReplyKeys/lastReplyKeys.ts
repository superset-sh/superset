import type { TranscriptRow } from "../transcriptRows";

/** The key of each turn's last agent reply, whatever rows follow it in the turn. */
export function lastReplyKeys(rows: readonly TranscriptRow[]): Set<string> {
	const keys = new Set<string>();
	let lastInTurn: string | null = null;
	for (const row of rows) {
		if (row.groupStart) {
			if (lastInTurn) keys.add(lastInTurn);
			lastInTurn = null;
		}
		if (row.kind === "item" && row.item.kind === "agent_message") {
			lastInTurn = row.key;
		}
	}
	if (lastInTurn) keys.add(lastInTurn);
	return keys;
}
