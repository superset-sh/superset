import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Badge } from "@superset/ui/badge";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { cn } from "@superset/ui/utils";
import { STATUS_PRIORITY } from "shared/tabs-types";
import { useDashboardSidebarChipHoverSuppression } from "../../hooks/useDashboardSidebarChipHoverSuppression";
import type { DashboardSidebarRunningAgent } from "../../hooks/useDashboardSidebarWorkspaceRunningAgents";
import { DashboardSidebarAgentAvatar } from "./components/DashboardSidebarAgentAvatar";
import { DashboardSidebarAgentHoverRow } from "./components/DashboardSidebarAgentHoverRow";

interface DashboardSidebarAgentsChipProps {
	workspaceId: string;
	agents: DashboardSidebarRunningAgent[];
}

/**
 * Running-agents chip on the workspace row: one avatar (the agent whose
 * status most needs attention, newest session on ties) plus the total count.
 * Hovering or clicking the chip opens a card listing each agent with an
 * open action; clicking the chip again closes the card.
 */
export function DashboardSidebarAgentsChip({
	workspaceId,
	agents,
}: DashboardSidebarAgentsChipProps) {
	const { t } = useLingui();
	const { isOpen, onOpenChange, onPointerEnter, onPointerLeave, toggleOpen } =
		useDashboardSidebarChipHoverSuppression();

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
						aria-label={
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
									})
						}
						className={cn(
							"group/chip h-[18px] overflow-visible bg-muted/60 px-1.5 py-0 text-[9px] font-medium tabular-nums text-muted-foreground",
							"[&>svg]:size-2.5 hover:bg-muted hover:text-foreground",
						)}
					>
						<DashboardSidebarAgentAvatar agent={primaryAgent} />
						<span className="shrink-0">{agents.length}</span>
					</button>
				</Badge>
			</HoverCardTrigger>
			<HoverCardContent
				side="right"
				align="start"
				sideOffset={8}
				className="w-64 p-1"
			>
				<div className="flex items-center justify-between px-2 py-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
					<span>
						<Trans>Agents</Trans>
					</span>
					<span className="tabular-nums">{agents.length}</span>
				</div>
				<div className="max-h-60 overflow-y-auto">
					{agents.map((agent) => (
						<DashboardSidebarAgentHoverRow
							key={agent.sourceKey}
							workspaceId={workspaceId}
							agent={agent}
						/>
					))}
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
