import { Button } from "@superset/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { ItemGroup } from "@superset/ui/item";
import { ScrollArea } from "@superset/ui/scroll-area";
import { useMatchRoute } from "@tanstack/react-router";
import { LuLayers, LuPlus } from "react-icons/lu";
import { V2WorkspaceRow } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/V2WorkspacesList/components/V2WorkspaceRow";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";

interface V2ProjectDetailWorkspacesProps {
	projectId: string;
	workspaces: AccessibleV2Workspace[];
}

export function V2ProjectDetailWorkspaces({
	projectId,
	workspaces,
}: V2ProjectDetailWorkspacesProps) {
	const matchRoute = useMatchRoute();
	const currentWorkspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
	});
	const currentWorkspaceId =
		currentWorkspaceMatch !== false ? currentWorkspaceMatch.workspaceId : null;
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();

	if (workspaces.length === 0) {
		return (
			<Empty className="flex-1 border-0">
				<EmptyHeader>
					<EmptyMedia
						variant="icon"
						className="size-14 [&_svg:not([class*='size-'])]:size-7"
					>
						<LuLayers />
					</EmptyMedia>
					<EmptyTitle>No workspaces yet</EmptyTitle>
					<EmptyDescription>
						Create a workspace to start coding in this project.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button
						size="sm"
						className="gap-1.5"
						onClick={() => openNewWorkspaceModal(projectId)}
					>
						<LuPlus className="size-4" />
						New workspace
					</Button>
				</EmptyContent>
			</Empty>
		);
	}

	return (
		<ScrollArea className="min-h-0 flex-1">
			<div className="flex flex-col gap-3 px-4 py-4">
				<div className="flex items-baseline gap-2">
					<h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Workspaces
					</h2>
					<span className="text-xs text-muted-foreground/70">
						{workspaces.length}
					</span>
				</div>
				<ItemGroup className="gap-2">
					{workspaces.map((workspace) => (
						<V2WorkspaceRow
							key={workspace.id}
							workspace={workspace}
							showProjectName={false}
							isCurrentRoute={workspace.id === currentWorkspaceId}
						/>
					))}
				</ItemGroup>
			</div>
		</ScrollArea>
	);
}
