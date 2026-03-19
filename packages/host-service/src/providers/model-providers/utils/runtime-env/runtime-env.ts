export function applyRuntimeEnv(
	nextEnv: Record<string, string>,
	cleanupKeys: string[],
	currentRuntimeEnv: Record<string, string>,
): Record<string, string> {
	const nextKeys = new Set(Object.keys(nextEnv));
	const keysToCleanup = new Set([
		...cleanupKeys,
		...Object.keys(currentRuntimeEnv),
	]);

	for (const key of keysToCleanup) {
		if (!nextKeys.has(key)) {
			delete process.env[key];
		}
	}

	for (const [key, value] of Object.entries(nextEnv)) {
		process.env[key] = value;
	}

	return { ...nextEnv };
}
