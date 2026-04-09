import type { WorkspaceHostTarget } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker";
import { PromptGroup } from "../PromptGroup";

interface DashboardNewWorkspacePromptTabContentProps {
	projectId: string | null;
	localProjectId: string | null;
	hostTarget: WorkspaceHostTarget;
}

export function DashboardNewWorkspacePromptTabContent({
	projectId,
	localProjectId,
	hostTarget,
}: DashboardNewWorkspacePromptTabContentProps) {
	return (
		<div className="flex-1 overflow-y-auto">
			<PromptGroup
				projectId={projectId}
				localProjectId={localProjectId}
				hostTarget={hostTarget}
			/>
		</div>
	);
}
