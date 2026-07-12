import { formatDistanceToNow } from "date-fns";

export interface SnapshotNoteProps {
	snapshotAt: Date | null | undefined;
}

/** Activity numbers come from an hourly-cached PostHog snapshot. */
export function SnapshotNote({ snapshotAt }: SnapshotNoteProps) {
	if (!snapshotAt) return null;
	return (
		<p className="text-muted-foreground text-xs">
			Activity data as of {formatDistanceToNow(snapshotAt, { addSuffix: true })}{" "}
			· refreshes hourly
		</p>
	);
}
