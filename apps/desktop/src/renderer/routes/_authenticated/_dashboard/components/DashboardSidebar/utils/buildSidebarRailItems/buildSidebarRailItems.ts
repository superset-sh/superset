import type { ProjectCollectionRootItem } from "renderer/routes/_authenticated/utils/projectCollections/projectCollections";

interface RailCollection {
	id: string;
	name: string;
	color: string | null;
}

export type SidebarRailItem<Project extends { id: string }> = {
	key: string;
} & (
	| { type: "project"; project: Project }
	| { type: "collectionSeparator"; collection: RailCollection }
	| { type: "rootSeparator" }
);

export function buildSidebarRailItems<Project extends { id: string }>(
	projects: readonly Project[],
	rootItems: readonly ProjectCollectionRootItem<{ id: string }>[],
): SidebarRailItem<Project>[] {
	const collectionByProjectId = new Map<string, RailCollection>();
	for (const item of rootItems) {
		if (item.type !== "collection") continue;
		const { id, name, color } = item.collection;
		for (const member of item.collection.projects)
			collectionByProjectId.set(member.id, { id, name, color });
	}
	const items: SidebarRailItem<Project>[] = [];
	let previous: RailCollection | undefined;
	projects.forEach((project, index) => {
		const current = collectionByProjectId.get(project.id);
		if (current && current.id !== previous?.id)
			items.push({
				key: `collection:${current.id}:${index}`,
				type: "collectionSeparator",
				collection: current,
			});
		else if (!current && previous)
			items.push({
				key: `root:${previous.id}:${index}`,
				type: "rootSeparator",
			});
		items.push({ key: project.id, type: "project", project });
		previous = current;
	});
	return items;
}
