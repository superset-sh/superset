import { Badge } from "@superset/ui/badge";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { Separator } from "@superset/ui/separator";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { LuLoaderCircle, LuX } from "react-icons/lu";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { STATUS_PRIORITY } from "shared/tabs-types";
import { useDashboardSidebarAgentKill } from "../../hooks/useDashboardSidebarAgentKill";
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
 * Hovering or clicking the chip opens a card listing each agent with its own
 * open/stop actions; clicking the chip again closes the card.
 */
export function DashboardSidebarAgentsChip({
	workspaceId,
	agents,
}: DashboardSidebarAgentsChipProps) {
	const { isPending, killAgents } = useDashboardSidebarAgentKill(workspaceId);
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

	const handleStopAll = async () => {
		if (isPending) return;
		const stoppedCount = await killAgents(
			agents.map((agent) => agent.terminalId),
		);
		if (stoppedCount > 0) {
			toast.success(
				stoppedCount === 1
					? "Stopped 1 agent"
					: `Stopped ${stoppedCount} agents`,
			);
		}
	};

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
						disabled={isPending}
						aria-busy={isPending}
						aria-expanded={isOpen}
						aria-label={`${agents.length} running agents — ${isOpen ? "hide" : "show"} details`}
						className={cn(
							"group/chip h-[18px] overflow-visible bg-muted/60 px-1.5 py-0 text-[9px] font-medium tabular-nums text-muted-foreground",
							"[&>svg]:size-2.5 hover:bg-muted hover:text-foreground disabled:opacity-70",
						)}
					>
						<DashboardSidebarAgentAvatar agent={primaryAgent} />
						{isPending ? (
							<LuLoaderCircle
								className="size-2.5 shrink-0 animate-spin"
								strokeWidth={STROKE_WIDTH}
							/>
						) : (
							<span className="shrink-0">{agents.length}</span>
						)}
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
					<span>Agents</span>
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
				<Separator className="my-1" />
				<button
					type="button"
					onClick={() => void handleStopAll()}
					disabled={isPending}
					className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-70"
				>
					<LuX className="size-3" strokeWidth={STROKE_WIDTH} />
					Stop all agents
				</button>
			</HoverCardContent>
		</HoverCard>
	);
}
