import { Command, CommandInput, CommandList } from "@superset/ui/command";
import type { WorkspaceHostTarget } from "renderer/lib/v2-workspace-host";
import type { DashboardNewWorkspaceTab } from "../../../../DashboardNewWorkspaceDraftContext";
import { BranchesGroup } from "../BranchesGroup";
import { IssuesGroup } from "../IssuesGroup";
import { PullRequestsGroup } from "../PullRequestsGroup";

const COMMAND_CLASS_NAME =
	"[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5 flex h-full w-full flex-1 flex-col overflow-hidden rounded-none";

interface DashboardNewWorkspaceListTabContentProps {
	activeTab: Exclude<DashboardNewWorkspaceTab, "prompt">;
	projectId: string | null;
	githubRepositoryId: string | null;
	hostTarget: WorkspaceHostTarget;
	localProjectId: string | null;
	query: string;
	onQueryChange: (value: string) => void;
}

export function DashboardNewWorkspaceListTabContent({
	activeTab,
	projectId,
	githubRepositoryId,
	hostTarget,
	localProjectId,
	query,
	onQueryChange,
}: DashboardNewWorkspaceListTabContentProps) {
	return (
		<Command shouldFilter={false} className={COMMAND_CLASS_NAME}>
			<CommandInput
				value={query}
				onValueChange={onQueryChange}
				placeholder={
					activeTab === "issues"
						? "Search by slug, title, or description"
						: activeTab === "branches"
							? "Search by name"
							: "Search by title, number, or author"
				}
			/>

			<CommandList className="!max-h-none flex-1 overflow-y-auto">
				{activeTab === "pull-requests" && (
					<PullRequestsGroup
						projectId={projectId}
						githubRepositoryId={githubRepositoryId}
						hostTarget={hostTarget}
					/>
				)}
				{activeTab === "branches" && (
					<BranchesGroup
						projectId={projectId}
						localProjectId={localProjectId}
						hostTarget={hostTarget}
					/>
				)}
				{activeTab === "issues" && (
					<IssuesGroup projectId={projectId} hostTarget={hostTarget} />
				)}
			</CommandList>
		</Command>
	);
}
