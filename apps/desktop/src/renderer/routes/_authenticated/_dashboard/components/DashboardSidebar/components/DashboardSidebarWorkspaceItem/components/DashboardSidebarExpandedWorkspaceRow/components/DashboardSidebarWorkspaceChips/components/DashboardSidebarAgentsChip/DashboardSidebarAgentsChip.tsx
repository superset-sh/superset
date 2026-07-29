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
 * Hovering the row swaps the count for an × — clicking then stops every
 * agent; hovering the chip opens a card listing each agent with its own
 * open/stop actions.
 */
export function DashboardSidebarAgentsChip({
	workspaceId,
	agents,
}: DashboardSidebarAgentsChipProps) {
	const { isPending, killAgents } = useDashboardSidebarAgentKill(workspaceId);
	const { hold, release } = useDashboardSidebarChipHoverSuppression();

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
			openDelay={150}
			closeDelay={120}
			onOpenChange={(open) => (open ? hold() : release())}
		>
			<HoverCardTrigger asChild>
				<Badge asChild variant="secondary">
					<button
						type="button"
						onPointerEnter={hold}
						onPointerLeave={release}
						onClick={(event) => {
							event.stopPropagation();
							void handleStopAll();
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.stopPropagation();
							}
						}}
						disabled={isPending}
						aria-busy={isPending}
						aria-label={`${agents.length} running agents — stop all`}
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
							// The count and the × share one grid cell and cross-fade while
							// the chip itself is hovered, so it never changes width.
							<span className="grid shrink-0 items-center justify-items-center [&>*]:col-start-1 [&>*]:row-start-1">
								<span className="transition-opacity group-focus-within/chip:opacity-0 group-hover/chip:opacity-0 motion-reduce:transition-none">
									{agents.length}
								</span>
								<LuX
									className="size-2.5 opacity-0 transition-opacity group-focus-within/chip:opacity-100 group-hover/chip:opacity-100 motion-reduce:transition-none"
									strokeWidth={STROKE_WIDTH}
								/>
							</span>
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
