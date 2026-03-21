const LOCAL_TASK_CREATION_PROVIDERS = new Set(["linear"]);

export function getEligibleSyncProviders(
	taskExternalProvider: string | null,
	connectionProviders: string[],
): string[] {
	if (taskExternalProvider) {
		return connectionProviders.filter(
			(provider) => provider === taskExternalProvider,
		);
	}

	return connectionProviders.filter((provider) =>
		LOCAL_TASK_CREATION_PROVIDERS.has(provider),
	);
}
