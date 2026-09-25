import { Trans } from "@lingui/react/macro";
import type { FightEvent } from "../../utils/simulateFight";

interface CombatLogProps {
	events: FightEvent[];
	names: { a: string; b: string };
}

export function CombatLog({ events, names }: CombatLogProps) {
	const shown = events.slice(-5);

	return (
		<div className="border border-border/70 bg-background/60 backdrop-blur-sm">
			<div className="flex items-center gap-2 border-b border-border/70 px-3 py-1.5">
				<span className="size-1.5 bg-brand" />
				<span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground">
					combat.log
				</span>
			</div>
			<ol className="flex flex-col px-3 py-2.5 gap-1 min-h-[7.5rem] justify-end">
				{shown.map((event) => (
					<li
						key={event.turn}
						className="font-mono text-[0.62rem] leading-relaxed text-muted-foreground flex gap-2"
					>
						<span className="text-muted-foreground/40 tabular-nums shrink-0">
							{String(event.turn).padStart(2, "0")}
						</span>
						<span
							className={`shrink-0 font-bold ${event.crit ? "text-[rgb(255,206,84)]" : "text-foreground/50"}`}
						>
							{event.move}
						</span>
						<span className={event.crit ? "text-brand" : ""}>{event.line}</span>
						<span className="ml-auto tabular-nums shrink-0 text-foreground/70">
							−{event.damage}
						</span>
					</li>
				))}
				{shown.length === 0 && (
					<li className="font-mono text-[0.62rem] text-muted-foreground/50">
						<Trans>
							waiting for {names.a} and {names.b}…
						</Trans>
					</li>
				)}
			</ol>
		</div>
	);
}
