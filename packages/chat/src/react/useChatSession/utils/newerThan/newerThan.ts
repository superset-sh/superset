import type { SessionSnapshot } from "../../../../core";
import type { Envelope } from "../../../../protocol/envelope";
import {
	isDeltaEnvelope,
	isDurableEnvelope,
} from "../../../../protocol/envelope";

export function newerThan(
	snapshot: SessionSnapshot,
	envelopes: readonly Envelope[],
): Envelope[] {
	const cursor = snapshot.cursor;
	return envelopes.filter((envelope) => {
		if (isDurableEnvelope(envelope)) {
			return (
				!cursor ||
				envelope.cursor.epoch !== cursor.epoch ||
				envelope.cursor.seq > cursor.seq
			);
		}
		if (!isDeltaEnvelope(envelope)) return false;
		const stored = snapshot.items.get(envelope.delta.itemId);
		return stored?.item.completedAtMs === undefined;
	});
}
