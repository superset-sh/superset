import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import type { WorkspaceHostTarget } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker";
import type { DashboardNewWorkspaceTab } from "../../../../DashboardNewWorkspaceDraftContext";
import { DevicePicker } from "../DevicePicker";
import { ProjectSelector } from "../ProjectSelector";

interface DashboardNewWorkspaceFormHeaderProps {
	activeTab: DashboardNewWorkspaceTab;
	hostTarget: WorkspaceHostTarget;
	selectedProjectId: string | null;
	onSelectTab: (tab: DashboardNewWorkspaceTab) => void;
	onSelectHostTarget: (hostTarget: WorkspaceHostTarget) => void;
	onSelectProject: (projectId: string | null) => void;
}

export function DashboardNewWorkspaceFormHeader({
	activeTab,
	hostTarget,
	selectedProjectId,
	onSelectTab,
	onSelectHostTarget,
	onSelectProject,
}: DashboardNewWorkspaceFormHeaderProps) {
	return (
		<div className="flex items-center justify-between border-b px-4 py-2.5">
			<Tabs
				value={activeTab}
				onValueChange={(value) =>
					onSelectTab(value as DashboardNewWorkspaceTab)
				}
			>
				<TabsList>
					<TabsTrigger value="prompt">Prompt</TabsTrigger>
					<TabsTrigger value="issues">Issues</TabsTrigger>
					<TabsTrigger value="pull-requests">Pull requests</TabsTrigger>
					<TabsTrigger value="branches">Branches</TabsTrigger>
				</TabsList>
			</Tabs>
			<div className="flex items-center gap-1">
				<DevicePicker
					hostTarget={hostTarget}
					onSelectHostTarget={onSelectHostTarget}
				/>
				<div className="mx-0.5 h-4 w-px bg-border" />
				<ProjectSelector
					selectedProjectId={selectedProjectId}
					onSelectProject={onSelectProject}
				/>
			</div>
		</div>
	);
}
