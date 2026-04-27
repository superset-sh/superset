import { getActiveIdAfterRemoval } from "@superset/panes";

type WorkspaceLike = {
	id: string;
	tabOrder: number;
};

type SectionLike = {
	id: string;
	workspaces: WorkspaceLike[];
};

type TopLevelItemLike = {
	id: string;
	kind: "workspace" | "section";
	tabOrder: number;
};

type WorkspaceGroupLike = {
	workspaces: WorkspaceLike[];
	sections: SectionLike[];
	topLevelItems: TopLevelItemLike[];
};

function compareTopLevelItems(
	left: TopLevelItemLike,
	right: TopLevelItemLike,
): number {
	return (
		left.tabOrder - right.tabOrder ||
		(left.kind === right.kind ? 0 : left.kind === "section" ? -1 : 1)
	);
}

function hasVisibleWorkspaces(group: WorkspaceGroupLike): boolean {
	return (
		group.workspaces.length > 0 ||
		group.sections.some((section) => section.workspaces.length > 0)
	);
}

function getWorkspaceIdsFromGroups(
	groups: readonly WorkspaceGroupLike[] | undefined,
): string[] {
	return (groups ?? []).flatMap((group) =>
		[...group.topLevelItems].sort(compareTopLevelItems).flatMap((item) => {
			if (item.kind === "workspace") {
				return group.workspaces.some((workspace) => workspace.id === item.id)
					? [item.id]
					: [];
			}

			const section = group.sections.find((section) => section.id === item.id);
			return section
				? [...section.workspaces]
						.sort((left, right) => left.tabOrder - right.tabOrder)
						.map((workspace) => workspace.id)
				: [];
		}),
	);
}

export function getWorkspaceFocusTargetAfterRemoval(
	groups: readonly WorkspaceGroupLike[] | undefined,
	removedWorkspaceId: string,
): string | null {
	return getActiveIdAfterRemoval(
		getWorkspaceIdsFromGroups(groups),
		removedWorkspaceId,
		removedWorkspaceId,
	);
}

export function removeWorkspaceFromGroups<TGroup extends WorkspaceGroupLike>(
	groups: readonly TGroup[],
	workspaceId: string,
): TGroup[] {
	return groups
		.map((group) => {
			const isTopLevelWorkspace = group.workspaces.some(
				(workspace) => workspace.id === workspaceId,
			);
			const workspaces = group.workspaces.filter(
				(workspace) => workspace.id !== workspaceId,
			);
			// Keep empty sections: getAllGrouped returns user-created sections even
			// when they have no workspaces, so the optimistic cache should match.
			const sections = group.sections.map((section) => ({
				...section,
				workspaces: section.workspaces.filter(
					(workspace) => workspace.id !== workspaceId,
				),
			}));

			return {
				...group,
				workspaces,
				sections,
				topLevelItems: isTopLevelWorkspace
					? group.topLevelItems.filter((item) => item.id !== workspaceId)
					: group.topLevelItems,
			} as TGroup;
		})
		.filter(hasVisibleWorkspaces);
}
