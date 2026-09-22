export interface SelectableEnvironment {
	id: string;
	name: string;
	repositories?: ReadonlyArray<unknown> | null;
}

/** Environments a workspace can start from: those that carry repositories. */
export function startableCloudEnvironments<T extends SelectableEnvironment>(
	environments: T[],
): T[] {
	return environments.filter(
		(environment) => (environment.repositories ?? []).length > 0,
	);
}

/**
 * The environment a cloud workspace starts from, by id or name; undefined on
 * a miss, so each caller phrases that failure itself. Nothing requested takes
 * the first environment that carries repositories.
 */
export function selectCloudEnvironment<T extends SelectableEnvironment>(
	environments: T[],
	requested: string | undefined,
): T | undefined {
	if (requested === undefined)
		return startableCloudEnvironments(environments)[0];

	const wanted = requested.trim().toLowerCase();
	return environments.find(
		(environment) =>
			environment.id.toLowerCase() === wanted ||
			environment.name.toLowerCase() === wanted,
	);
}
