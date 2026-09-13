import { cn } from "@superset/ui/utils";
import { AgentTree } from "renderer/routes/_authenticated/_dashboard/components/AgentTree";
import type { DashboardSidebarWorkspaceIndentation } from "../../../../../../../../types";
import type { DashboardSidebarWorkspaceAgentTree } from "../../../../hooks/useDashboardSidebarWorkspaceAgentTree";
import { useOpenAgentTreeNode } from "../../../../hooks/useOpenAgentTreeNode";
import { useSidebarAgentTreeShown } from "../../../../hooks/useSidebarAgentTreeShown";

interface DashboardSidebarAgentTreeRowsProps {
	workspaceId: string;
	agentTree: DashboardSidebarWorkspaceAgentTree;
	isInSection: boolean;
	indentation?: DashboardSidebarWorkspaceIndentation;
}

export function DashboardSidebarAgentTreeRows({
	workspaceId,
	agentTree,
	isInSection,
	indentation,
}: DashboardSidebarAgentTreeRowsProps) {
	const [shown] = useSidebarAgentTreeShown(workspaceId);
	const openNode = useOpenAgentTreeNode(workspaceId, agentTree.agents);

	if (!shown) return null;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: pointer starts must not become a workspace drag; rows are real buttons
		<div
			className={cn(
				"pr-2 pb-1",
				indentation === "top-level"
					? "pl-[22px]"
					: indentation === "grouped" || isInSection
						? "pl-[46px]"
						: "pl-[38px]",
			)}
			onMouseDown={(event) => event.stopPropagation()}
			onTouchStart={(event) => event.stopPropagation()}
		>
			<AgentTree tree={agentTree.tree} variant="sidebar" onOpen={openNode} />
		</div>
	);
}
