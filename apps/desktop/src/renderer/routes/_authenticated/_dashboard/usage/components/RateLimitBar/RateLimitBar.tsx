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
		<div className="space-y-1.5">
			<div className="flex items-baseline justify-between">
				<span className="text-xs text-foreground">{window.label}</span>
				<span className="font-mono text-xs font-bold tabular-nums text-foreground">
					{Math.round(remainingPct)}% left
				</span>
			</div>

			<div className="relative h-1 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="h-full rounded-full bg-foreground/70"
					style={{ width: `${remainingPct}%` }}
				/>
				{showReserveTick && (
					<div
						className="absolute top-0 h-full w-px bg-foreground/30"
						style={{
							left: `${Math.max(0, Math.min(100, 100 - window.reservePct))}%`,
						}}
					/>
				)}
			</div>

			<div className="flex items-start justify-between text-[10px] text-muted-foreground">
				<span>{Math.round(window.reservePct)}% in reserve</span>
				<div className="flex flex-col items-end">
					{window.resetAt && (
						<span>Resets in {formatTimeUntil(window.resetAt)}</span>
					)}
					{window.lastsUntilReset && <span>Lasts until reset</span>}
				</div>
			</div>
		</div>
	);
}
