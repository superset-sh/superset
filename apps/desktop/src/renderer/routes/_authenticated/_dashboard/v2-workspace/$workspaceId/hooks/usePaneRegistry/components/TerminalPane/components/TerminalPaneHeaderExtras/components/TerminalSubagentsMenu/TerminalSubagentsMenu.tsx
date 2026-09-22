import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { ChevronDown } from "lucide-react";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import type { SubagentPaneData } from "../../../../../../../../types";

interface TerminalSubagentsMenuProps {
	workspaceId: string;
	terminalId: string;
	onOpenSubagent: (data: SubagentPaneData) => void;
}

/**
 * "N subagents" dropdown in an agent pane's header, present only while the
 * bound agent has children running. Each entry opens that child's live
 * transcript pane.
 */
export function TerminalSubagentsMenu({
	workspaceId,
	terminalId,
	onOpenSubagent,
}: TerminalSubagentsMenuProps) {
	const { t } = useLingui();
	const binding = useTerminalAgentBinding(workspaceId, terminalId);
	const subagents = binding?.subagents ?? [];
	if (!binding || subagents.length === 0) return null;

	const label = t({
		message: plural(subagents.length, {
			one: "# subagent",
			other: "# subagents",
		}),
	});

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label={label}
					className={cn(
						// Lowest-priority header chip: first to go in a narrow pane so
						// the action icons keep their room.
						"mr-1 hidden h-5 items-center gap-0.5 rounded px-1.5 text-[10px] font-medium tabular-nums @min-[360px]/pane-header:flex",
						"text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
						"data-[state=open]:bg-secondary data-[state=open]:text-foreground",
					)}
				>
					<span>{label}</span>
					<ChevronDown className="size-3" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
					<Trans>Subagents</Trans>
				</DropdownMenuLabel>
				{subagents.map((subagent) => (
					<DropdownMenuItem
						key={subagent.id}
						onSelect={() =>
							onOpenSubagent({
								terminalId,
								subagentId: subagent.id,
								agentId: binding.agentId,
								...(subagent.agentType
									? { agentType: subagent.agentType }
									: {}),
							})
						}
					>
						<span className="min-w-0 flex-1 truncate">
							{subagent.agentType ?? <Trans>Subagent</Trans>}
						</span>
						<span className="shrink-0 text-[10px] text-muted-foreground">
							<Trans>Running</Trans>
						</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
