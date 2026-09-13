import { cn } from "@superset/ui/utils";
import type { MouseEventHandler } from "react";
import { useDashboardSidebarWorkspacePorts } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarPortsProvider";
import { useInlineWorkspacePortsEnabled } from "renderer/stores/inline-workspace-ports";
import type { DashboardSidebarWorkspaceIndentation } from "../../../../../../types";
import { useDashboardSidebarWorkspaceAgentTree } from "../../hooks/useDashboardSidebarWorkspaceAgentTree";
import { DashboardSidebarAgentsChip } from "./components/DashboardSidebarAgentsChip";
import { DashboardSidebarPortsChip } from "./components/DashboardSidebarPortsChip";

interface DashboardSidebarWorkspaceChipsProps {
	workspaceId: string;
	isInSection?: boolean;
	indentation?: DashboardSidebarWorkspaceIndentation;
	/** Invoked when the strip itself (not one of its chips) is clicked. */
	onClick?: MouseEventHandler<HTMLDivElement>;
}

/**
 * Activity line beneath a workspace row, left-aligned with the title: an
 * agents chip and a ports chip.
 */
export function DashboardSidebarWorkspaceChips({
	workspaceId,
	isInSection = false,
	indentation,
	onClick,
}: DashboardSidebarWorkspaceChipsProps) {
	const inlineWorkspacePortsEnabled = useInlineWorkspacePortsEnabled();

	const portGroup = useDashboardSidebarWorkspacePorts(workspaceId);
	const ports = inlineWorkspacePortsEnabled ? (portGroup?.ports ?? []) : [];
	const agentTree = useDashboardSidebarWorkspaceAgentTree(workspaceId);
	const agents = agentTree.agents;

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
			{agents.length > 0 && (
				<DashboardSidebarAgentsChip
					workspaceId={workspaceId}
					agentTree={agentTree}
				/>
			)}
			{ports.length > 0 && <DashboardSidebarPortsChip ports={ports} />}
		</div>
	);
}
