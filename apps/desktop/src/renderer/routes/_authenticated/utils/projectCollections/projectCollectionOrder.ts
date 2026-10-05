import type { ProjectCollectionPlacement } from "shared/project-collections";
import {
	type CollectionProject,
	deriveProjectCollections,
	type ProjectCollectionRootItem,
} from "./projectCollections";

export function resolveProjectCollectionPlacements({
	projectIds,
	sidebarProjects,
	placements,
}: {
	projectIds: string[];
	sidebarProjects: ReadonlyArray<{ projectId: string; tabOrder: number }>;
	placements: readonly ProjectCollectionPlacement[];
}): ProjectCollectionPlacement[] {
	placements = placements.filter((row) => !row.key.startsWith("rail:"));
	const stored = new Set(
		placements.filter((row) => row.kind === "project").map((row) => row.key),
	);
	const legacyOrder = new Map(
		sidebarProjects.map((row) => [row.projectId, row.tabOrder]),
	);
	const missing = projectIds
		.filter((id) => !stored.has(id))
		.sort(
			(a, b) =>
				(legacyOrder.get(a) ?? 0) - (legacyOrder.get(b) ?? 0) ||
				a.localeCompare(b),
		);
	const hasProjectOrder = placements.length > 0;
	const first = Math.min(0, ...placements.map((row) => row.tabOrder));
	return [
		...placements,
		...missing.map((key, index) => ({
			key,
			kind: "project" as const,
			tabOrder: hasProjectOrder
				? first - missing.length + index
				: (legacyOrder.get(key) ?? 0),
			isCollapsed: false,
		})),
	];
}

export function getProjectCollectionOrder<Project extends { id: string }>(
	items: readonly ProjectCollectionRootItem<Project>[],
): string[] {
	return items.flatMap((item) =>
		item.type === "project"
			? [item.project.id]
			: item.collection.projects.map((project) => project.id),
	);
}

export function derivePlacedProjectCollections<
	Project extends CollectionProject,
>(
	input: Omit<
		Parameters<typeof deriveProjectCollections<Project>>[0],
		"placements" | "projectPlacements"
	> & {
		placements: readonly ProjectCollectionPlacement[];
		sidebarProjects: ReadonlyArray<{
			projectId: string;
			tabOrder: number;
			isHidden: boolean;
		}>;
	},
) {
	const resolved = resolveProjectCollectionPlacements({
		projectIds: input.projects.map((project) => project.id),
		sidebarProjects: input.sidebarProjects,
		placements: input.placements,
	});
	const hidden = new Map(
		input.sidebarProjects.map((row) => [row.projectId, row.isHidden]),
	);
	return deriveProjectCollections({
		...input,
		placements: input.placements
			.filter((row) => row.kind === "collection")
			.map((row) => ({
				sectionId: row.key,
				projectId: "projects",
				tag: row.key.slice("projects:".length),
				name: row.key,
				createdAt: new Date(0),
				color: null,
				tabOrder: row.tabOrder,
				isCollapsed: row.isCollapsed,
			})),
		projectPlacements: resolved
			.filter((row) => row.kind === "project" && !row.key.startsWith("rail:"))
			.map((row) => ({
				projectId: row.key,
				isHidden: hidden.get(row.key) ?? false,
				tabOrder: row.tabOrder,
			})),
	});
}
