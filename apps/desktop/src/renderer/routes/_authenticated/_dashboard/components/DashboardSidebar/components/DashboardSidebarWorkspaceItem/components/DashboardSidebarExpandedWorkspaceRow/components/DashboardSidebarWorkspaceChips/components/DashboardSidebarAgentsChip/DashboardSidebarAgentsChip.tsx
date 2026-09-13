import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Badge } from "@superset/ui/badge";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { useId } from "react";
import { AgentTree } from "renderer/routes/_authenticated/_dashboard/components/AgentTree";
import { STATUS_PRIORITY } from "shared/tabs-types";
import type { DashboardSidebarWorkspaceAgentTree } from "../../../../hooks/useDashboardSidebarWorkspaceAgentTree";
import { useOpenAgentTreeNode } from "../../../../hooks/useOpenAgentTreeNode";
import { useSidebarAgentTreeShown } from "../../../../hooks/useSidebarAgentTreeShown";
import { useDashboardSidebarChipHoverSuppression } from "../../hooks/useDashboardSidebarChipHoverSuppression";
import { DashboardSidebarAgentAvatar } from "./components/DashboardSidebarAgentAvatar";

interface DashboardSidebarAgentsChipProps {
	workspaceId: string;
	agentTree: DashboardSidebarWorkspaceAgentTree;
}

/**
 * Running-agents chip on the workspace row: one avatar (the agent whose
 * status most needs attention, newest session on ties), the agent count,
 * and `+N` live subagents coloured by the worst child state. Hovering or
 * clicking opens a card with the agent tree and the switch that keeps the
 * tree open in the sidebar.
 */
export function DashboardSidebarAgentsChip({
	workspaceId,
	agentTree,
}: DashboardSidebarAgentsChipProps) {
	const { t } = useLingui();
	const { agents, tree, childrenStatus } = agentTree;
	const { isOpen, onOpenChange, onPointerEnter, onPointerLeave, toggleOpen } =
		useDashboardSidebarChipHoverSuppression();
	const [shown, setShown] = useSidebarAgentTreeShown(workspaceId);
	const openNode = useOpenAgentTreeNode(workspaceId, agents);
	const switchId = useId();

	const subagentCount = agents.reduce(
		(total, agent) => total + agent.subagents.length,
		0,
	);

	const primaryAgent = agents.reduce((best, agent) => {
		if (STATUS_PRIORITY[agent.status] !== STATUS_PRIORITY[best.status]) {
			return STATUS_PRIORITY[agent.status] > STATUS_PRIORITY[best.status]
				? agent
				: best;
		}
		return agent.startedAt > best.startedAt ? agent : best;
	});

	return (
		<HoverCard
			open={isOpen}
			openDelay={150}
			closeDelay={120}
			onOpenChange={onOpenChange}
		>
			<HoverCardTrigger asChild>
				<Badge asChild variant="secondary">
					<button
						type="button"
						onPointerEnter={onPointerEnter}
						onPointerLeave={onPointerLeave}
						onPointerDown={(event) => {
							event.stopPropagation();
						}}
						onClick={(event) => {
							event.stopPropagation();
							toggleOpen();
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.stopPropagation();
							}
						}}
						aria-expanded={isOpen}
						aria-label={[
							isOpen
								? t({
										message: plural(agents.length, {
											one: "# running agent — hide details",
											other: "# running agents — hide details",
										}),
									})
								: t({
										message: plural(agents.length, {
											one: "# running agent — show details",
											other: "# running agents — show details",
										}),
									}),
							subagentCount > 0
								? t({
										message: plural(subagentCount, {
											one: "# subagent running",
											other: "# subagents running",
										}),
									})
								: null,
						]
							.filter(Boolean)
							.join(", ")}
						className={cn(
							"group/chip h-[18px] overflow-visible bg-muted/60 px-1.5 py-0 text-[9px] font-medium tabular-nums text-muted-foreground",
							"[&>svg]:size-2.5 hover:bg-muted hover:text-foreground",
						)}
					>
						<DashboardSidebarAgentAvatar agent={primaryAgent} />
						<span className="shrink-0">{agents.length}</span>
						{subagentCount > 0 && (
							<span
								className={cn(
									"shrink-0 font-normal",
									childrenStatus === "waiting"
										? "text-yellow-500"
										: childrenStatus === "failed"
											? "text-red-500"
											: "text-muted-foreground",
								)}
							>
								+{subagentCount}
							</span>
						)}
					</button>
				</Badge>
			</HoverCardTrigger>
			<HoverCardContent
				side="right"
				align="start"
				sideOffset={8}
				className="w-72 p-1"
			>
				<div className="flex items-center justify-between px-2 py-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
					<span>
						<Trans>Agents</Trans>
					</span>
					<span className="tabular-nums">
						{subagentCount > 0
							? `${agents.length} · ${t({
									message: plural(subagentCount, {
										one: "# subagent",
										other: "# subagents",
									}),
								})}`
							: agents.length}
					</span>
				</div>
				<AgentTree
					tree={tree}
					variant="card"
					onOpen={openNode}
					className="max-h-72 overflow-y-auto"
				/>
				<div className="mt-1 flex items-center justify-between border-t border-border px-2 pt-2 pb-1">
					<label htmlFor={switchId} className="text-xs">
						<Trans>Show tree in sidebar</Trans>
					</label>
					<Switch
						id={switchId}
						checked={shown}
						onCheckedChange={setShown}
						className="scale-90"
					/>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
