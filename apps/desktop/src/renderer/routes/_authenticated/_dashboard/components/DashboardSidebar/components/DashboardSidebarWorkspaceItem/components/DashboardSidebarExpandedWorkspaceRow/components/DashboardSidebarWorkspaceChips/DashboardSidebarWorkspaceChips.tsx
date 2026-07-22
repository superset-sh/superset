import { cn } from "@superset/ui/utils";
import { useDashboardSidebarWorkspacePorts } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarPortsProvider";
import { useInlineWorkspacePortsEnabled } from "renderer/stores/inline-workspace-ports";
import { useWorkspaceAgentsRowEnabled } from "renderer/stores/workspace-agents-row";
import { DashboardSidebarAgentsChip } from "./components/DashboardSidebarAgentsChip";
import { DashboardSidebarPortsChip } from "./components/DashboardSidebarPortsChip";
import { useDashboardSidebarWorkspaceRunningAgents } from "./hooks/useDashboardSidebarWorkspaceRunningAgents";

interface DashboardSidebarWorkspaceChipsProps {
	workspaceId: string;
	isInSection?: boolean;
	/** Invoked when the strip itself (not one of its chips) is clicked. */
	onClick?: () => void;
}

/**
 * Activity line beneath a workspace row, left-aligned with the title: an
 * agents chip and a ports chip. Agent chips appear only when more than one
 * agent is running — a lone agent is the norm for a workspace and showing it
 * adds no signal.
 */
export function DashboardSidebarWorkspaceChips({
	workspaceId,
	isInSection = false,
	onClick,
}: DashboardSidebarWorkspaceChipsProps) {
	const inlineWorkspacePortsEnabled = useInlineWorkspacePortsEnabled();
	const workspaceAgentsRowEnabled = useWorkspaceAgentsRowEnabled();

	const portGroup = useDashboardSidebarWorkspacePorts(workspaceId);
	const ports = inlineWorkspacePortsEnabled ? (portGroup?.ports ?? []) : [];
	const runningAgents = useDashboardSidebarWorkspaceRunningAgents(
		workspaceId,
		workspaceAgentsRowEnabled,
	);
	const agents =
		workspaceAgentsRowEnabled && runningAgents.length > 1 ? runningAgents : [];

	if (ports.length === 0 && agents.length === 0) {
		return null;
	}

	return (
		// Stop pointer/touch starts from bubbling to the sortable workspace
		// item's drag listeners, so pressing a chip isn't captured as a
		// workspace-reorder gesture.
		// biome-ignore lint/a11y/noStaticElementInteractions: clicks on the strip's empty area mirror the row click; chips are real buttons
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard activation lives on the workspace row button; the strip click is a pointer convenience
		<div
			className={cn(
				"flex h-7 items-center gap-1 pr-2",
				isInSection ? "pl-[58px]" : "pl-[50px]",
				onClick && "cursor-pointer",
			)}
			onMouseDown={(event) => event.stopPropagation()}
			onTouchStart={(event) => event.stopPropagation()}
			onClick={(event) => {
				if (!onClick) return;
				const target = event.target as HTMLElement;
				if (!event.currentTarget.contains(target)) return;
				if (target.closest("button, a, [role='button'], [role='menuitem']"))
					return;
				onClick();
			}}
		>
			{agents.length > 0 && (
				<DashboardSidebarAgentsChip workspaceId={workspaceId} agents={agents} />
			)}
			{ports.length > 0 && <DashboardSidebarPortsChip ports={ports} />}
		</div>
	);
}
