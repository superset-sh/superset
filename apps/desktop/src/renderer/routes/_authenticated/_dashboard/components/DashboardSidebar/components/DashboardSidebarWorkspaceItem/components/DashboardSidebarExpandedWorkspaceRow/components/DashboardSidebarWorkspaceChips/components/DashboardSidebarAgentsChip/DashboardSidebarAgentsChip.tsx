import { Badge } from "@superset/ui/badge";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { Separator } from "@superset/ui/separator";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { STATUS_PRIORITY } from "shared/tabs-types";
import { useDashboardSidebarAgentKill } from "../../hooks/useDashboardSidebarAgentKill";
import { useDashboardSidebarChipHoverSuppression } from "../../hooks/useDashboardSidebarChipHoverSuppression";
import type { DashboardSidebarRunningAgent } from "../../hooks/useDashboardSidebarWorkspaceRunningAgents";
import { DashboardSidebarAgentAvatar } from "./components/DashboardSidebarAgentAvatar";
import { DashboardSidebarAgentHoverRow } from "./components/DashboardSidebarAgentHoverRow";
import { DashboardSidebarStopAllAgentsButton } from "./components/DashboardSidebarStopAllAgentsButton";
import { DashboardSidebarStopAllAgentsDialog } from "./components/DashboardSidebarStopAllAgentsDialog";
import { getAgentsChipLabel } from "./utils/agentsChipCopy";

interface DashboardSidebarAgentsChipProps {
	workspaceId: string;
	agents: DashboardSidebarRunningAgent[];
}

/**
 * Running-agents chip on the workspace row: one avatar (the agent whose
 * status most needs attention, newest session on ties) plus the total count.
 * The chip is inspect-only — hovering or clicking it opens a card listing each
 * agent with its own open/stop actions. Stopping happens inside that card:
 * per agent on its row, or all at once behind a confirm, because disposing a
 * terminal session can't be undone.
 */
export function DashboardSidebarAgentsChip({
	workspaceId,
	agents,
}: DashboardSidebarAgentsChipProps) {
	const { isPending, killAgents } = useDashboardSidebarAgentKill(workspaceId);
	const { hold, release } = useDashboardSidebarChipHoverSuppression();
	const [isCardOpen, setIsCardOpen] = useState(false);
	const [isConfirmOpen, setIsConfirmOpen] = useState(false);
	const isCardOpenRef = useRef(false);

	const primaryAgent = agents.reduce((best, agent) => {
		if (STATUS_PRIORITY[agent.status] !== STATUS_PRIORITY[best.status]) {
			return STATUS_PRIORITY[agent.status] > STATUS_PRIORITY[best.status]
				? agent
				: best;
		}
		return agent.startedAt > best.startedAt ? agent : best;
	});

	// The card can open from hover, focus, or a click; route every path through
	// here so the sidebar hover-card hold stays balanced one-per-open.
	const setCardOpen = useCallback(
		(next: boolean) => {
			if (isCardOpenRef.current === next) return;
			isCardOpenRef.current = next;
			if (next) hold();
			else release();
			setIsCardOpen(next);
		},
		[hold, release],
	);

	// The confirm is modal, but the workspace row it covers is still under the
	// pointer — keep its hover card suppressed until the dialog closes.
	useEffect(() => {
		if (!isConfirmOpen) return;
		hold();
		return release;
	}, [isConfirmOpen, hold, release]);

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
		<>
			<HoverCard
				open={isCardOpen}
				onOpenChange={setCardOpen}
				openDelay={150}
				closeDelay={120}
			>
				<HoverCardTrigger asChild>
					<Badge asChild variant="secondary">
						<button
							type="button"
							onPointerEnter={hold}
							onPointerLeave={release}
							// Open, never toggle: focus already opens the card, so a toggle
							// would read as "clicking the chip closes it".
							onClick={(event) => {
								event.stopPropagation();
								setCardOpen(true);
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.stopPropagation();
								}
							}}
							aria-busy={isPending}
							aria-expanded={isCardOpen}
							aria-label={getAgentsChipLabel(agents.length)}
							className={cn(
								"h-[18px] overflow-visible bg-muted/60 px-1.5 py-0 text-[9px] font-medium tabular-nums text-muted-foreground",
								"[&>svg]:size-2.5 hover:bg-muted hover:text-foreground",
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
					{/* Generous gap: overshooting the agent list by a few pixels must not
					    land on the control that stops every agent. */}
					<Separator className="mt-2 mb-1" />
					<div className="pt-1">
						<DashboardSidebarStopAllAgentsButton
							disabled={isPending}
							onRequestStopAll={() => {
								setCardOpen(false);
								setIsConfirmOpen(true);
							}}
						/>
					</div>
				</HoverCardContent>
			</HoverCard>
			<DashboardSidebarStopAllAgentsDialog
				open={isConfirmOpen}
				onOpenChange={setIsConfirmOpen}
				agentCount={agents.length}
				isPending={isPending}
				onConfirm={() => {
					setIsConfirmOpen(false);
					void handleStopAll();
				}}
			/>
		</>
	);
}
