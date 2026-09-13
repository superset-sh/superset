import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import {
	AgentTree,
	type AgentTreeNode,
	buildAgentTree,
} from "renderer/routes/_authenticated/_dashboard/components/AgentTree";
import type { SubagentPaneData } from "../../../../../../../../types";

interface TerminalSubagentsMenuProps {
	workspaceId: string;
	terminalId: string;
	onOpenSubagent: (data: SubagentPaneData) => void;
}

/**
 * "N subagents" chip in an agent pane's header, present while the bound
 * agent has children, live or recently ended. Opens the agent tree rooted
 * at this terminal; each row opens that child's live transcript pane.
 */
export function TerminalSubagentsMenu({
	workspaceId,
	terminalId,
	onOpenSubagent,
}: TerminalSubagentsMenuProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const binding = useTerminalAgentBinding(workspaceId, terminalId);
	const subagents = binding?.subagents ?? [];
	const endedSubagents = binding?.endedSubagents ?? [];

	const tree = useMemo(
		() =>
			binding
				? buildAgentTree([
						{
							terminalId,
							agentId: binding.agentId,
							title: AGENT_IDENTITY_LABELS[binding.agentId] ?? binding.agentId,
							status: "working",
							startedAt: binding.startedAt,
							subagents,
							endedSubagents,
						},
					])
				: { live: [], ended: [] },
		[binding, terminalId, subagents, endedSubagents],
	);

	if (!binding || (subagents.length === 0 && endedSubagents.length === 0)) {
		return null;
	}

	const label = t({
		message: plural(subagents.length, {
			one: "# subagent",
			other: "# subagents",
		}),
	});

	const liveCount = subagents.length;
	const liveLabel = t({ message: `${liveCount} live` });
	const endedLabel = t({
		message: plural(tree.ended.length, {
			one: "# ended",
			other: "# ended",
		}),
	});

	const handleOpen = (node: AgentTreeNode) => {
		if (node.subagentId === undefined) return;
		setOpen(false);
		onOpenSubagent({
			terminalId,
			subagentId: node.subagentId,
			agentId: binding.agentId,
			...(node.subtitle ? { agentType: node.subtitle } : {}),
		});
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
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
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 p-1">
				<div className="flex items-center justify-between px-2 py-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
					<span>
						<Trans>Subagents</Trans>
					</span>
					<span className="tabular-nums">
						{tree.ended.length > 0
							? `${liveLabel} · ${endedLabel}`
							: subagents.length}
					</span>
				</div>
				<AgentTree
					tree={tree}
					variant="menu"
					onOpen={handleOpen}
					className="max-h-80 overflow-y-auto"
				/>
			</PopoverContent>
		</Popover>
	);
}
