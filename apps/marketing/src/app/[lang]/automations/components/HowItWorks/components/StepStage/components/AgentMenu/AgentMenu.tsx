import { Trans } from "@lingui/react/macro";
import { Bot, Check } from "lucide-react";

const AGENTS = ["Claude", "Codex", "Amp"];

export function AgentMenu() {
	return (
		<div className="absolute right-4 bottom-4 left-4 overflow-hidden rounded-md border border-border bg-popover text-sm shadow-xl sm:right-8 sm:bottom-8 sm:left-auto sm:w-60">
			<p className="px-3 pt-2.5 pb-1.5 font-medium text-xs">
				<Trans>Agent</Trans>
			</p>
			<div className="space-y-0.5 px-1.5 pb-1.5 text-xs">
				{AGENTS.map((agent, index) => (
					<p
						key={agent}
						className={`flex items-center gap-2 rounded-sm px-2 py-1.5 ${index === 0 ? "bg-accent text-foreground" : "text-muted-foreground"}`}
					>
						<Bot className="size-3.5" />
						<span className="flex-1">{agent}</span>
						{index === 0 && <Check className="size-3.5" />}
					</p>
				))}
			</div>
			<p className="border-border border-t px-3 py-2 text-muted-foreground text-xs">
				<Trans>Add more agents in Settings.</Trans>
			</p>
		</div>
	);
}
