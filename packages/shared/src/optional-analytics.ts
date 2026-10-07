export function isAnalyticsEnabled(key: string | undefined): key is string {
	return (
		!!key?.trim() &&
		!["build", "unused", "phc_local_dev_disabled"].includes(key)
	);
}

export const disabledAnalytics = {
	capture: (..._args: unknown[]) => undefined,
	register: (..._args: unknown[]) => undefined,
	identify: (..._args: unknown[]) => undefined,
	screen: (..._args: unknown[]) => undefined,
	reset: (..._args: unknown[]) => undefined,
	isFeatureEnabled: async (..._args: unknown[]) => undefined,
	getFeatureFlag: async (..._args: unknown[]) => undefined,
	getFeatureFlagPayload: async (..._args: unknown[]) => undefined,
	flush: async () => undefined,
	shutdown: async () => undefined,
};
export function createOptionalAnalytics<T>(
	key: string | undefined,
	create: (key: string) => T,
): T | typeof disabledAnalytics {
	return isAnalyticsEnabled(key) ? create(key) : disabledAnalytics;
}
