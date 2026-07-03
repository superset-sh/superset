import { OverflowFadeContainer } from "@superset/ui/overflow-fade-container";
import { cn } from "@superset/ui/utils";
import type { CSSProperties } from "react";
import { LuRadioTower, LuX } from "react-icons/lu";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { useInlineWorkspacePortsEnabled } from "renderer/stores/inline-workspace-ports";
import { useWorkspaceAgentsRowEnabled } from "renderer/stores/workspace-agents-row";
import { useDashboardSidebarWorkspacePorts } from "../../../../providers/DashboardSidebarPortsProvider";
import { DashboardSidebarPortBadge } from "../../../DashboardSidebarPortsList/components/DashboardSidebarPortBadge";
import { useDashboardSidebarPortKill } from "../../../DashboardSidebarPortsList/hooks/useDashboardSidebarPortKill";
import { DashboardSidebarWorkspaceAgentBadge } from "./components/DashboardSidebarWorkspaceAgentBadge";
import { DashboardSidebarWorkspaceDetailsAction } from "./components/DashboardSidebarWorkspaceDetailsAction";
import { useDashboardSidebarWorkspaceRunningAgents } from "./hooks/useDashboardSidebarWorkspaceRunningAgents";

interface DashboardSidebarWorkspaceDetailsProps {
	workspaceId: string;
	isInSection?: boolean;
	/** Invoked when the strip itself (not one of its chips) is clicked. */
	onClick?: () => void;
}

/**
 * Wraps one element that unfolds when the strip is `details-expanded`: its
 * max-width, margin and opacity animate from zero, so the content slides out
 * of the cluster and retracts back into it (rather than fading in place).
 * `visibility` rides the transition so collapsed content isn't interactive.
 */
const UNFOLD_WRAPPER = cn(
	"invisible max-w-0 shrink-0 overflow-hidden opacity-0",
	"transition-[max-width,margin,opacity,visibility] duration-500 ease-out motion-reduce:transition-none",
	"details-expanded:visible details-expanded:ml-1.5 details-expanded:opacity-100 details-expanded:duration-200",
);

/** Cap the port-pill stagger so long lists don't drag the animation out. */
const MAX_STAGGERED_PORTS = 8;
const STAGGER_STEP_MS = 25;

/**
 * Single activity line rendered beneath a workspace row, left-aligned with
 * the workspace title. At rest it's a compact cluster: overlapping agent
 * circles plus a port-count pill. When the workspace item is hovered or
 * focused (`details-expanded`, defined in globals.css), the cluster morphs
 * open — agent circles grow into labeled pills and the count pill unfolds
 * into the individual port pills with a slight stagger — and retracts the
 * same way in reverse. Everything is one layer, so the motion is real
 * geometry, not a cross-fade.
 */
export function DashboardSidebarWorkspaceDetails({
	workspaceId,
	isInSection = false,
	onClick,
}: DashboardSidebarWorkspaceDetailsProps) {
	const inlineWorkspacePortsEnabled = useInlineWorkspacePortsEnabled();
	const workspaceAgentsRowEnabled = useWorkspaceAgentsRowEnabled();
	const { isPending: isKillingPorts, killPorts } =
		useDashboardSidebarPortKill();

	const portGroup = useDashboardSidebarWorkspacePorts(workspaceId);
	const ports = inlineWorkspacePortsEnabled ? (portGroup?.ports ?? []) : [];
	const runningAgents = useDashboardSidebarWorkspaceRunningAgents(
		workspaceId,
		workspaceAgentsRowEnabled,
	);
	const agents = workspaceAgentsRowEnabled ? runningAgents : [];

	if (ports.length === 0 && agents.length === 0) {
		return null;
	}

	return (
		// Stop pointer/touch starts from bubbling to the sortable workspace item's
		// drag listeners, so scrolling overflowing badges or pressing a badge
		// control isn't captured as a workspace-reorder gesture.
		<OverflowFadeContainer
			observeChildren
			className={cn(
				// group/details scopes the menu-open half of `details-expanded`.
				"group/details flex h-[22px] items-center overflow-x-auto hide-scrollbar pr-2 mb-1.5",
				isInSection ? "pl-[58px]" : "pl-[50px]",
				onClick && "cursor-pointer",
			)}
			onMouseDown={(event) => event.stopPropagation()}
			onTouchStart={(event) => event.stopPropagation()}
			onClick={(event) => {
				if (!onClick) return;
				const target = event.target as HTMLElement;
				// Radix dropdown selections render in a portal; React bubbling still
				// reaches this handler but the target isn't inside the strip's DOM.
				if (!event.currentTarget.contains(target)) return;
				// Chips handle their own clicks (open agent, open port, menus);
				// only clicks on the strip's empty area open the workspace.
				if (target.closest("button, a, [role='button'], [role='menuitem']"))
					return;
				onClick();
			}}
		>
			{agents.map((agent) => (
				<DashboardSidebarWorkspaceAgentBadge
					key={agent.sourceKey}
					workspaceId={workspaceId}
					agent={agent}
				/>
			))}

			{ports.length > 0 && (
				<span
					className={cn(
						"flex h-[18px] shrink-0 items-center gap-1 overflow-hidden rounded-full bg-muted/60",
						"text-[9px] font-medium tabular-nums text-muted-foreground",
						"max-w-14 px-1.5 opacity-100",
						agents.length > 0 && "ml-2",
						"transition-[max-width,margin,padding,opacity] duration-500 ease-out motion-reduce:transition-none",
						"details-expanded:ml-0 details-expanded:max-w-0 details-expanded:px-0 details-expanded:opacity-0 details-expanded:duration-200",
					)}
				>
					<LuRadioTower
						className="size-2.5 shrink-0"
						strokeWidth={STROKE_WIDTH}
					/>
					{ports.length}
				</span>
			)}

			{ports.map((port, index) => (
				<div
					key={`${port.hostId}:${port.terminalId}:${port.port}`}
					// The stagger delay only applies while expanding; retraction is
					// uniform so the strip clears in one motion.
					className={cn(
						UNFOLD_WRAPPER,
						"details-expanded:max-w-44 details-expanded:[transition-delay:var(--unfold-delay)]",
					)}
					style={
						{
							"--unfold-delay": `${Math.min(index, MAX_STAGGERED_PORTS) * STAGGER_STEP_MS}ms`,
						} as CSSProperties
					}
				>
					<DashboardSidebarPortBadge port={port} />
				</div>
			))}

			{ports.length > 1 && (
				<div className={cn(UNFOLD_WRAPPER, "details-expanded:max-w-8")}>
					<DashboardSidebarWorkspaceDetailsAction
						label="Close all ports"
						icon={<LuX className="size-3" strokeWidth={STROKE_WIDTH} />}
						busy={isKillingPorts}
						onClick={() => void killPorts(ports)}
					/>
				</div>
			)}
		</OverflowFadeContainer>
	);
}
