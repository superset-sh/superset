export function normalizeProjectFilters(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [
		...new Set(
			value
				.filter(
					(projectId): projectId is string => typeof projectId === "string",
				)
				.map((projectId) => projectId.trim())
				.filter((projectId) => projectId.length > 0),
		),
	];
}

export function areProjectFiltersEqual(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((projectId, i) => projectId === b[i]);
}

export function parseProjectFilterParam(value: string | undefined): string[] {
	if (!value) return [];
	return normalizeProjectFilters(value.split(","));
}

export function resolveProjectFilterParams(
	projects: string | undefined,
	legacyProject: string | null | undefined,
	emptyValue: undefined,
): string[] | undefined;
export function resolveProjectFilterParams(
	projects: string | undefined,
	legacyProject: string | null | undefined,
	emptyValue: string[],
): string[];
export function resolveProjectFilterParams(
	projects: string | undefined,
	legacyProject: string | null | undefined,
	emptyValue: string[] | undefined,
): string[] | undefined {
	if (projects !== undefined) return parseProjectFilterParam(projects);
	if (legacyProject) return normalizeProjectFilters([legacyProject]);
	return emptyValue;
}

/**
 * The pull-requests routes give the `project` search param two meanings:
 * the legacy single-repo list filter (pre-multi-select links), and the open
 * PR's repo written by the detail pane. Only the first may narrow the list.
 * Treating the second as a filter silently locked the list to the clicked
 * PR's repo (GH #7577) and, because that changes every query key, refetched
 * every page of search results and check rollups per click (GH #7578).
 */
export function resolvePullRequestListFilters(args: {
	projects: string | undefined;
	project: string | null | undefined;
	prIsOpen: boolean;
}): string[] | undefined {
	return resolveProjectFilterParams(
		args.projects,
		args.prIsOpen ? null : args.project,
		undefined,
	);
}

export function serializeProjectFilters(
	projectFilters: string[],
): string | undefined {
	return projectFilters.length > 0 ? projectFilters.join(",") : undefined;
}
