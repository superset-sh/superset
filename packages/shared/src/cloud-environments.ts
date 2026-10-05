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
 * The environment a cloud workspace starts from, by id (names change and can
 * differ only by case); undefined on a miss, so each caller phrases that
 * failure itself. Nothing requested takes the only environment that carries
 * repositories, never a guess among several.
 */
export function selectCloudEnvironment<T extends SelectableEnvironment>(
	environments: T[],
	requested: string | undefined,
): T | undefined {
	if (requested === undefined) {
		const startable = startableCloudEnvironments(environments);
		return startable.length === 1 ? startable[0] : undefined;
	}
	const wanted = requested.trim();
	return environments.find((environment) => environment.id === wanted);
}

/** How a hint lists environments: the id to pass, then the name to recognize it by. */
export function describeEnvironments(
	environments: ReadonlyArray<SelectableEnvironment>,
): string {
	return environments
		.map((environment) => `${environment.id} (${environment.name})`)
		.join(", ");
}
