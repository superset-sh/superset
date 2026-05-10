import { getActiveIdAfterRemoval } from "@superset/panes";

export type WorkspaceRemovalNavigationTarget =
	| { kind: "workspace"; workspaceId: string }
	| { kind: "home" };

interface ResolveWorkspaceRemovalNavigationTargetArgs {
	activeWorkspaceId: string | null | undefined;
	removedWorkspaceId: string;
	orderedWorkspaceIds: readonly string[];
	isWorkspaceValid?: (workspaceId: string) => boolean;
	isWorkspaceDeleting?: (workspaceId: string) => boolean;
}

export function resolveWorkspaceRemovalNavigationTarget({
	activeWorkspaceId,
	removedWorkspaceId,
	orderedWorkspaceIds,
	isWorkspaceValid = () => true,
	isWorkspaceDeleting = () => false,
}: ResolveWorkspaceRemovalNavigationTargetArgs): WorkspaceRemovalNavigationTarget | null {
	if (activeWorkspaceId !== removedWorkspaceId) return null;

	const navigableIds = orderedWorkspaceIds.filter(
		(workspaceId) =>
			workspaceId === removedWorkspaceId ||
			(isWorkspaceValid(workspaceId) && !isWorkspaceDeleting(workspaceId)),
	);
	const nextWorkspaceId = getActiveIdAfterRemoval(
		navigableIds,
		removedWorkspaceId,
		removedWorkspaceId,
	);

	return nextWorkspaceId
		? { kind: "workspace", workspaceId: nextWorkspaceId }
		: { kind: "home" };
}
