import { Trans } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import type { RewindPoint } from "../../../../utils/rewindTimeline";

export function RewindPanel({
	points,
	onPick,
}: {
	points: RewindPoint[];
	onPick: (point: RewindPoint) => void;
}) {
	if (points.length === 0) {
		return (
			<p className="px-3 py-2 text-muted-foreground text-xs">
				<Trans>There are no messages to rewind to yet.</Trans>
			</p>
		);
	}
	const now = Date.now();
	return (
		<div className="flex max-h-72 flex-col overflow-y-auto py-1">
			<p className="px-3 pb-1 text-muted-foreground text-xs">
				<Trans>
					Pick a message. The chat goes back to just before it, and the message
					returns to the composer.
				</Trans>
			</p>
			{points.map((point) => (
				<button
					className="flex items-baseline gap-3 rounded-md px-3 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
					key={point.itemId}
					onClick={() => onPick(point)}
					type="button"
				>
					<span className="min-w-0 flex-1 truncate">{point.text}</span>
					<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
						{formatCompactRelativeTime(point.startedAtMs, now)}
					</span>
				</button>
			))}
		</div>
	);
}
