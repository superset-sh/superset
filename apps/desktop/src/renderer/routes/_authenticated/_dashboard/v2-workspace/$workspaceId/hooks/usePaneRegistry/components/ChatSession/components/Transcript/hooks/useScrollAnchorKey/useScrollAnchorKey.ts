import type { OutboxEntry } from "@superset/chat/core";
import { type RefObject, useMemo, useRef, useState } from "react";
import type { TranscriptRow } from "../../utils/transcriptRows";

/**
 * The key of the latest message sent from this view: the scroller pins it to
 * the top and follows the reply once it outgrows the screen. A message is
 * sent here when it went through this view's outbox after the view opened,
 * so a message from another client never takes the anchor.
 */
export function useScrollAnchorKey(
	rows: readonly TranscriptRow[],
	outbox: readonly OutboxEntry[],
	{
		turnRunning,
		readerScrolledAway,
	}: { turnRunning: boolean; readerScrolledAway: RefObject<boolean> },
): string | null {
	const [rowKeysAtMount] = useState(() => new Set(rows.map((row) => row.key)));
	const sentHereKeys = useRef(new Set<string>());
	const anchor = useRef<string | null>(null);
	return useMemo(() => {
		for (const entry of outbox) {
			if (!rowKeysAtMount.has(entry.clientId))
				sentHereKeys.current.add(entry.clientId);
		}
		const latest = rows.findLast(
			(row) =>
				sentHereKeys.current.has(row.key) &&
				!(turnRunning && row.kind === "outbox"),
		);
		const startedFromQueue =
			latest !== undefined &&
			latest.kind !== "outbox" &&
			latest.key !== anchor.current;
		if (!startedFromQueue || !readerScrolledAway.current) {
			anchor.current = latest?.key ?? null;
		}
		return anchor.current;
	}, [rows, outbox, rowKeysAtMount, turnRunning, readerScrolledAway]);
}
