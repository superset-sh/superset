import type { RateLimitWindow } from "../../types";
import { formatTimeUntil } from "../../utils/format";

interface RateLimitBarProps {
	window: RateLimitWindow;
}

export function RateLimitBar({ window }: RateLimitBarProps) {
	const remainingPct = Math.max(0, Math.min(100, 100 - window.usedPct));
	// The reserve marker only carries information when pace projection pulls it
	// below the plain remaining budget; otherwise it sits at the bar end and reads
	// as a dead pixel.
	const showReserveTick = window.reservePct < remainingPct - 1;

	return (
		<div className="space-y-2">
			<div className="flex items-baseline justify-between gap-3">
				<span className="truncate text-xs text-foreground">{window.label}</span>
				<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
					<span className="font-bold text-foreground">
						{Math.round(remainingPct)}%
					</span>{" "}
					left
				</span>
			</div>

			<div className="relative h-1 w-full overflow-hidden rounded-full bg-foreground/10">
				<div
					className="h-full rounded-full bg-foreground/60"
					style={{ width: `${remainingPct}%` }}
				/>
				{showReserveTick && (
					<div
						className="absolute top-0 h-full w-px bg-foreground"
						style={{
							left: `${Math.max(0, Math.min(100, 100 - window.reservePct))}%`,
						}}
					/>
				)}
			</div>

			<div className="flex items-start justify-between gap-3 text-[11px] text-muted-foreground">
				<span>{Math.round(window.reservePct)}% in reserve</span>
				<div className="flex flex-col items-end leading-tight">
					{window.resetAt && (
						<span>Resets in {formatTimeUntil(window.resetAt)}</span>
					)}
					{window.lastsUntilReset && <span>Lasts until reset</span>}
				</div>
			</div>
		</div>
	);
}
