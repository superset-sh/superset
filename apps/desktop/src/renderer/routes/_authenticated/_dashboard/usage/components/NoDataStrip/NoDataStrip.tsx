import { BUILTIN_TERMINAL_AGENTS } from "@superset/shared/agent-command";
import type { ProviderId } from "../../types";

// Providers with their own card; everything else in the registry falls into the
// "no data yet" strip, so new builtin agents appear here automatically.
const CARD_PROVIDER_IDS: ProviderId[] = [
	"claude",
	"codex",
	"copilot",
	"gemini",
];

const STRIP_AGENTS = BUILTIN_TERMINAL_AGENTS.filter(
	(agent) => !CARD_PROVIDER_IDS.includes(agent.id as ProviderId),
);

export function NoDataStrip() {
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
			<span className="flex items-center gap-1">
				<span aria-hidden>○</span> No data yet
			</span>
			{STRIP_AGENTS.map((agent) => (
				<span
					key={agent.id}
					className="flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5"
				>
					<span aria-hidden>◦</span>
					{agent.label}
				</span>
			))}
		</div>
	);
}
