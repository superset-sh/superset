import { LuFolders } from "react-icons/lu";
import { V2WorkspaceProjectIcon } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/V2WorkspaceProjectIcon";
import { PROJECT_FILTER_ALL } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";

interface ProjectFilterTriggerLabelProps {
	projectFilter: string;
	selectedProject:
		| { projectName: string; githubOwner: string | null }
		| undefined;
}

export function ProjectFilterTriggerLabel({
	projectFilter,
	selectedProject,
}: ProjectFilterTriggerLabelProps) {
	if (projectFilter === PROJECT_FILTER_ALL) {
		return (
			<span className="flex items-center gap-2">
				<LuFolders className="size-3.5" />
				<span>All projects</span>
			</span>
		);
	}
	if (!selectedProject) {
		return (
			<span className="flex items-center gap-2">
				<LuFolders className="size-3.5" />
				<span className="text-muted-foreground">Unknown project</span>
			</span>
		);
	}
	return (
		<span className="flex min-w-0 items-center gap-2">
			<V2WorkspaceProjectIcon
				projectName={selectedProject.projectName}
				githubOwner={selectedProject.githubOwner}
				size="sm"
			/>
			<span className="min-w-0 truncate">{selectedProject.projectName}</span>
		</span>
	);
}
