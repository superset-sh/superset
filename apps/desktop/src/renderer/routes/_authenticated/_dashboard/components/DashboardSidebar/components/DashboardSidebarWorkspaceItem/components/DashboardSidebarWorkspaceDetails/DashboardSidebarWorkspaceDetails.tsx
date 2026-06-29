import type { ReactNode } from "react";
import { useWorkspaceDetailsStore } from "renderer/stores";
import { useDashboardSidebarWorkspacePorts } from "../../../../providers/DashboardSidebarPortsProvider";
import { DashboardSidebarWorkspacePortsRow } from "../DashboardSidebarWorkspacePortsRow";
import { DashboardSidebarWorkspaceDetailsToggle } from "./components/DashboardSidebarWorkspaceDetailsToggle";

interface WorkspaceDetailSection {
	/** Stable id, also used as the React key. */
	key: string;
	/** Short text shown in the toggle, e.g. "2 ports". */
	summary: string;
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
 * something to show. Everything else — the toggle, summary, persisted collapse
 * state — is handled here.
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

	// --- Section registry -----------------------------------------------------
	const sections: WorkspaceDetailSection[] = [];

	const portGroup = useDashboardSidebarWorkspacePorts(workspaceId);
	const portCount = portGroup?.ports.length ?? 0;
	if (portCount > 0) {
		sections.push({
			key: "ports",
			summary: `${portCount} ${portCount === 1 ? "port" : "ports"}`,
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

	return (
		<div className="pb-1">
			<DashboardSidebarWorkspaceDetailsToggle
				isExpanded={isExpanded}
				summary={sections.map((section) => section.summary).join(" · ")}
				isInSection={isInSection}
				onToggle={() => toggleExpanded(workspaceId)}
			/>
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
