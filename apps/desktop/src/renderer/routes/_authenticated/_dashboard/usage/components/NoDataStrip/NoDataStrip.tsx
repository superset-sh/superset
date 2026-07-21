import { BUILTIN_TERMINAL_AGENTS } from "@superset/shared/agent-command";
import type { ProviderId } from "../../types";
import { ProviderLogo } from "../ProviderLogo";

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
		<div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 pt-1 pb-2">
			<span className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
				○ No data yet
			</span>
			{STRIP_AGENTS.map((agent) => (
				<span
					key={agent.id}
					className="flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground"
				>
					<ProviderLogo id={agent.id} className="size-3.5" />
					{agent.label}
				</span>
			))}
		</div>
	);
}
