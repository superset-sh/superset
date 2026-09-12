export interface SelectableEnvironment {
	id: string;
	name: string;
}

/**
 * The environment a cloud sandbox boots from, by id or name; undefined on a
 * miss, so each caller phrases that failure itself. Nothing requested takes
 * the first row — every organization sees at least the shared one.
 */
export function selectCloudEnvironment<T extends SelectableEnvironment>(
	environments: T[],
	requested: string | undefined,
): T | undefined {
	if (requested === undefined) return environments[0];

	const wanted = requested.trim().toLowerCase();
	return environments.find(
		(environment) =>
			environment.id.toLowerCase() === wanted ||
			environment.name.toLowerCase() === wanted,
	);
}
