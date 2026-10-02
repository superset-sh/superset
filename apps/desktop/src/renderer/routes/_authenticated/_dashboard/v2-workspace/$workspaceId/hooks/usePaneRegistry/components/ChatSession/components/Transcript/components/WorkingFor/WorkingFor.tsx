import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

function elapsed(startedAtMs: number, completedAtMs: number | undefined) {
	const end = completedAtMs ?? Date.now();
	return Math.max(0, Math.floor((end - startedAtMs) / 1000));
}

/**
 * Turn-level progress, the way Codex shows it: one quiet line that counts while
 * the agent works and stays afterwards as "Worked for 8s", so a finished turn
 * still says what it cost. `onToggle` hangs the turn's work off it.
 */
export function WorkingFor({
	completedAtMs,
	expanded,
	onToggle,
	startedAtMs,
}: {
	startedAtMs: number;
	completedAtMs?: number | undefined;
	expanded?: boolean | undefined;
	onToggle?: (() => void) | undefined;
}) {
	const running = completedAtMs === undefined;
	const [seconds, setSeconds] = useState(() =>
		elapsed(startedAtMs, completedAtMs),
	);

	useEffect(() => {
		setSeconds(elapsed(startedAtMs, completedAtMs));
		if (!running) return;
		const timer = setInterval(
			() => setSeconds(elapsed(startedAtMs, undefined)),
			1000,
		);
		return () => clearInterval(timer);
	}, [startedAtMs, completedAtMs, running]);

	const label =
		seconds < 60 ? (
			running ? (
				<Trans>Working for {seconds}s</Trans>
			) : (
				<Trans>Worked for {seconds}s</Trans>
			)
		) : running ? (
			<Trans>
				Working for {Math.floor(seconds / 60)}m {seconds % 60}s
			</Trans>
		) : (
			<Trans>
				Worked for {Math.floor(seconds / 60)}m {seconds % 60}s
			</Trans>
		);

	const content = (
		<>
			<span className="whitespace-nowrap">{label}</span>
			{onToggle && (
				<ChevronRight
					className={cn(
						"size-3 shrink-0 opacity-60 transition-transform",
						expanded && "rotate-90",
					)}
				/>
			)}
		</>
	);

	return (
		<div className="flex items-center gap-3 pt-1 text-muted-foreground text-xs">
			{onToggle ? (
				<button
					className="flex items-center gap-1.5 hover:text-foreground"
					onClick={onToggle}
					type="button"
				>
					{content}
				</button>
			) : (
				<span className="flex items-center gap-1.5">{content}</span>
			)}
			<span className="h-px flex-1 bg-border/60" />
		</div>
	);
}
