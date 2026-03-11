type SidebarWorkspaceLike = {
	id: string;
	tabOrder: number;
};

type SidebarSectionLike = {
	id: string;
	tabOrder: number;
	workspaces: SidebarWorkspaceLike[];
};

type TopLevelItemLike = {
	id: string;
	kind: "workspace" | "section";
	tabOrder: number;
};

type SidebarGroupLike = {
	project: { id: string };
	workspaces: SidebarWorkspaceLike[];
	sections: SidebarSectionLike[];
	topLevelItems: TopLevelItemLike[];
};

export function reorderProjectChildrenInCache<T extends SidebarGroupLike>(
	oldData: T[] | undefined,
	projectId: string,
	fromIndex: number,
	toIndex: number,
): T[] | undefined {
	if (!oldData) return oldData;

	return oldData.map((group) => {
		if (group.project.id !== projectId) return group;
		if (
			fromIndex < 0 ||
			fromIndex >= group.topLevelItems.length ||
			toIndex < 0 ||
			toIndex >= group.topLevelItems.length
		) {
			return group;
		}

		const topLevelItems = [...group.topLevelItems];
		const [moved] = topLevelItems.splice(fromIndex, 1);
		topLevelItems.splice(toIndex, 0, moved);

		const normalizedTopLevelItems = topLevelItems.map((item, index) => ({
			...item,
			tabOrder: index,
		}));

		const workspaceTabOrders = new Map(
			normalizedTopLevelItems
				.filter((item) => item.kind === "workspace")
				.map((item) => [item.id, item.tabOrder]),
		);
		const sectionTabOrders = new Map(
			normalizedTopLevelItems
				.filter((item) => item.kind === "section")
				.map((item) => [item.id, item.tabOrder]),
		);

		return {
			...group,
			topLevelItems: normalizedTopLevelItems,
			workspaces: group.workspaces
				.map((workspace) => ({
					...workspace,
					tabOrder: workspaceTabOrders.get(workspace.id) ?? workspace.tabOrder,
				}))
				.sort((a, b) => a.tabOrder - b.tabOrder),
			sections: group.sections
				.map((section) => ({
					...section,
					tabOrder: sectionTabOrders.get(section.id) ?? section.tabOrder,
				}))
				.sort((a, b) => a.tabOrder - b.tabOrder),
		};
	});
}
