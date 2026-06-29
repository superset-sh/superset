import { Fragment, type ReactNode } from "react";
import { LuX } from "react-icons/lu";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { useWorkspaceDetailsStore } from "renderer/stores";
import { useDashboardSidebarWorkspacePorts } from "../../../../providers/DashboardSidebarPortsProvider";
import { useDashboardSidebarPortKill } from "../../../DashboardSidebarPortsList/hooks/useDashboardSidebarPortKill";
import { DashboardSidebarWorkspacePortsRow } from "../DashboardSidebarWorkspacePortsRow";
import { DashboardSidebarWorkspaceDetailsAction } from "./components/DashboardSidebarWorkspaceDetailsAction";
import { DashboardSidebarWorkspaceDetailsToggle } from "./components/DashboardSidebarWorkspaceDetailsToggle";

interface WorkspaceDetailSection {
	/** Stable id, also used as the React key. */
	key: string;
	/** Short text shown in the toggle, e.g. "2 ports". */
	summary: string;
	/** Optional header action shown on hover, e.g. "close all ports". */
	headerAction?: ReactNode;
	/** Expanded content for this section. */
	content: ReactNode;
}

interface DashboardSidebarWorkspaceDetailsProps {
	workspaceId: string;
	isInSection?: boolean;
}

/**
 * Collapsible area rendered beneath a workspace row. It hosts the per-workspace
 * "detail" rows (ports today, running agents / other status rows in future).
 *
 * To add a new detail row: call its data hook unconditionally in the section
 * registry below, then push a {@link WorkspaceDetailSection} when it has
 * something to show. Everything else — the toggle, summary, header actions,
 * persisted collapse state — is handled here.
 */
export function DashboardSidebarWorkspaceDetails({
	workspaceId,
	isInSection = false,
}: DashboardSidebarWorkspaceDetailsProps) {
	const isCollapsed = useWorkspaceDetailsStore(
		(state) => !!state.collapsedWorkspaceIds[workspaceId],
	);
	const toggleExpanded = useWorkspaceDetailsStore(
		(state) => state.toggleExpanded,
	);
	const { isPending: isKillingPorts, killPorts } =
		useDashboardSidebarPortKill();

	// --- Section registry -----------------------------------------------------
	const sections: WorkspaceDetailSection[] = [];

	const portGroup = useDashboardSidebarWorkspacePorts(workspaceId);
	const portCount = portGroup?.ports.length ?? 0;
	if (portGroup && portCount > 0) {
		sections.push({
			key: "ports",
			summary: `${portCount} ${portCount === 1 ? "port" : "ports"}`,
			headerAction: (
				<DashboardSidebarWorkspaceDetailsAction
					label="Close all ports"
					icon={<LuX className="size-3" strokeWidth={STROKE_WIDTH} />}
					busy={isKillingPorts}
					onClick={() => void killPorts(portGroup.ports)}
				/>
			),
			content: (
				<DashboardSidebarWorkspacePortsRow
					workspaceId={workspaceId}
					isInSection={isInSection}
				/>
			),
		});
	}

	// Add more detail rows here (e.g. running agents).
	// --------------------------------------------------------------------------

	if (sections.length === 0) {
		return null;
	}

	const isExpanded = !isCollapsed;
	const headerActions = sections.filter((section) => section.headerAction);

	return (
		<div className="pb-1">
			<div className="group/details flex items-center">
				<DashboardSidebarWorkspaceDetailsToggle
					isExpanded={isExpanded}
					summary={sections.map((section) => section.summary).join(" · ")}
					isInSection={isInSection}
					onToggle={() => toggleExpanded(workspaceId)}
				/>
				{headerActions.length > 0 && (
					<div className="ml-auto flex items-center gap-0.5 pr-2 opacity-0 transition-opacity group-hover/details:opacity-100">
						{headerActions.map((section) => (
							<Fragment key={section.key}>{section.headerAction}</Fragment>
						))}
					</div>
				)}
			</div>
			{isExpanded && (
				<div className="mt-1 space-y-1">
					{sections.map((section) => (
						<div key={section.key}>{section.content}</div>
					))}
				</div>
			)}
		</div>
	);
}
