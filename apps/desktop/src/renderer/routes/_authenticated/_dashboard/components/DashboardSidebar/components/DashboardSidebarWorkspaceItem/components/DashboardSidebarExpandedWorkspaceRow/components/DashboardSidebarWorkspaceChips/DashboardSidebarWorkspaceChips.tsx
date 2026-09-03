import { cn } from "@superset/ui/utils";
import type { MouseEventHandler } from "react";
import { useDashboardSidebarWorkspacePorts } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarPortsProvider";
import { useInlineWorkspacePortsEnabled } from "renderer/stores/inline-workspace-ports";
import { useWorkspaceAgentsRowEnabled } from "renderer/stores/workspace-agents-row";
import { useWorkspaceBranchLabelEnabled } from "renderer/stores/workspace-branch-label";
import type { DashboardSidebarWorkspaceIndentation } from "../../../../../../types";
import { DashboardSidebarAgentsChip } from "./components/DashboardSidebarAgentsChip";
import { DashboardSidebarPortsChip } from "./components/DashboardSidebarPortsChip";
import { useDashboardSidebarWorkspaceRunningAgents } from "./hooks/useDashboardSidebarWorkspaceRunningAgents";

interface DashboardSidebarWorkspaceChipsProps {
	workspaceId: string;
	/**
	 * Branch or worktree name to show ahead of the chips. Null when the
	 * workspace title already reads as the branch.
	 */
	branchLabel?: string | null;
	isInSection?: boolean;
	indentation?: DashboardSidebarWorkspaceIndentation;
	/** Invoked when the strip itself (not one of its chips) is clicked. */
	onClick?: MouseEventHandler<HTMLDivElement>;
}

/**
 * Activity line beneath a workspace row, left-aligned with the title: the
 * branch label, an agents chip, and a ports chip. Agent chips appear only
 * when more than one agent is running — a lone agent is the norm for a
 * workspace and showing it adds no signal. The branch label follows the
 * branch-label setting alone.
 */
export function DashboardSidebarWorkspaceChips({
	workspaceId,
	branchLabel = null,
	isInSection = false,
	indentation,
	onClick,
}: DashboardSidebarWorkspaceChipsProps) {
	const inlineWorkspacePortsEnabled = useInlineWorkspacePortsEnabled();
	const workspaceAgentsRowEnabled = useWorkspaceAgentsRowEnabled();
	const workspaceBranchLabelEnabled = useWorkspaceBranchLabelEnabled();

	const portGroup = useDashboardSidebarWorkspacePorts(workspaceId);
	const ports = inlineWorkspacePortsEnabled ? (portGroup?.ports ?? []) : [];
	const runningAgents = useDashboardSidebarWorkspaceRunningAgents(workspaceId);
	const agents =
		workspaceAgentsRowEnabled && runningAgents.length > 1 ? runningAgents : [];

	const branch = workspaceBranchLabelEnabled ? branchLabel : null;

	if (!branch && agents.length === 0 && ports.length === 0) {
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
				indentation === "top-level"
					? "pl-[26px]"
					: indentation === "grouped" || isInSection
						? "pl-[50px]"
						: "pl-[42px]",
				onClick && "cursor-pointer",
			)}
			onMouseDown={(event) => event.stopPropagation()}
			onTouchStart={(event) => event.stopPropagation()}
			onClick={(event) => {
				if (!onClick) return;
				const target = event.target as HTMLElement;
				if (!event.currentTarget.contains(target)) return;
				const interactiveTarget = target.closest(
					"button, a, [role='button'], [role='menuitem']",
				);
				if (
					interactiveTarget &&
					event.currentTarget.contains(interactiveTarget)
				) {
					return;
				}
				onClick(event);
			}}
		>
			{branch && (
				<span
					title={branch}
					className="min-w-0 truncate font-mono text-[11px] leading-tight text-muted-foreground/60"
				>
					{branch}
				</span>
			)}
			{agents.length > 0 && (
				<DashboardSidebarAgentsChip workspaceId={workspaceId} agents={agents} />
			)}
			{ports.length > 0 && <DashboardSidebarPortsChip ports={ports} />}
		</div>
	);
}
