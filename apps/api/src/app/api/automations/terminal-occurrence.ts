import { bucketToMinute } from "@superset/shared/rrule";

/**
 * Checks that a terminal message still refers to the occurrence stored on the
 * automation. `legacyPendingNextRunAt` keeps already-queued messages from the
 * previous reservation format deliverable during a rolling deployment.
 */
export function matchesTerminalOccurrence({
	nextRunAt,
	scheduledFor,
	legacyPendingNextRunAt,
}: {
	nextRunAt: Date;
	scheduledFor: Date;
	legacyPendingNextRunAt?: string;
}): boolean {
	if (
		legacyPendingNextRunAt !== undefined &&
		nextRunAt.getTime() === new Date(legacyPendingNextRunAt).getTime()
	) {
		return true;
	}

	return (
		bucketToMinute(nextRunAt).getTime() ===
		bucketToMinute(scheduledFor).getTime()
	);
}

export function matchesTerminalReservation({
	updatedAt,
	terminalDispatchToken,
}: {
	updatedAt: Date;
	terminalDispatchToken?: string;
}): boolean {
	return (
		terminalDispatchToken !== undefined &&
		updatedAt.getTime() === new Date(terminalDispatchToken).getTime()
	);
}
