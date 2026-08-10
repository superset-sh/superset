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

export function serializeProjectFilters(
	projectFilters: string[],
): string | undefined {
	return projectFilters.length > 0 ? projectFilters.join(",") : undefined;
}
