import {
	normalizeWorkspaceTag,
	normalizeWorkspaceTags,
	PROJECTS_TAG_SCOPE,
} from "./workspace-tags";

/** Order given to a collection no one has placed, after every placed one. */
export const DERIVED_PROJECT_COLLECTION_TAB_ORDER_BASE = 1_000_000;

/** A host's `projects`-scope tag folder presentation row. */
export interface ProjectCollectionSetting {
	tag: string;
	displayName: string | null;
	color: string | null;
	tabOrder: number | null;
}

export interface ProjectCollectionSummary {
	tag: string;
	name: string;
	color: string | null;
	tabOrder: number;
}

export function projectCollectionId(tag: string): string {
	return `${PROJECTS_TAG_SCOPE}:${tag}`;
}

export function compareProjectCollections(
	a: Pick<ProjectCollectionSummary, "tag" | "tabOrder">,
	b: Pick<ProjectCollectionSummary, "tag" | "tabOrder">,
): number {
	return a.tabOrder - b.tabOrder || a.tag.localeCompare(b.tag);
}

/**
 * A collection exists when a project carries its tag or a setting names it.
 * A project sits in at most one: the lowest order among its tags, then tag.
 */
export function resolveProjectCollections({
	projects,
	settings,
	tabOrderOverride,
}: {
	projects: readonly { id: string; tags?: readonly string[] }[];
	settings: readonly ProjectCollectionSetting[];
	tabOrderOverride?: (tag: string) => number | undefined;
}): {
	collections: ProjectCollectionSummary[];
	collectionByProjectId: Map<string, ProjectCollectionSummary>;
} {
	const settingsByTag = new Map(
		settings.flatMap((row) => {
			const tag = normalizeWorkspaceTag(row.tag);
			return tag ? [[tag, row] as const] : [];
		}),
	);
	const tags = normalizeWorkspaceTags([
		...settingsByTag.keys(),
		...projects.flatMap((project) => [...(project.tags ?? [])]),
	]);
	const collections = tags.map((tag, index) => {
		const setting = settingsByTag.get(tag);
		return {
			tag,
			name: setting?.displayName ?? tag,
			color: setting?.color ?? null,
			tabOrder:
				tabOrderOverride?.(tag) ??
				setting?.tabOrder ??
				DERIVED_PROJECT_COLLECTION_TAB_ORDER_BASE + index,
		};
	});
	collections.sort(compareProjectCollections);
	const collectionByTag = new Map(
		collections.map((collection) => [collection.tag, collection]),
	);
	const collectionByProjectId = new Map<string, ProjectCollectionSummary>();
	for (const project of projects) {
		const collection = normalizeWorkspaceTags(project.tags)
			.flatMap((tag) => collectionByTag.get(tag) ?? [])
			.sort(compareProjectCollections)[0];
		if (collection) collectionByProjectId.set(project.id, collection);
	}
	return { collections, collectionByProjectId };
}
