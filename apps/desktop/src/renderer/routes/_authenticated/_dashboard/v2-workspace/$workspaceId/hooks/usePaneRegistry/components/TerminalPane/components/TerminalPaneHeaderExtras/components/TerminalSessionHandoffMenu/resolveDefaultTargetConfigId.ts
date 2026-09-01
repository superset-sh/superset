export function resolveDefaultTargetConfigId(
	configIds: readonly string[],
	preferredConfigId: string | null,
	sourceConfigId?: string,
): string {
	if (preferredConfigId && configIds.includes(preferredConfigId)) {
		return preferredConfigId;
	}
	return (
		configIds.find((configId) => configId !== sourceConfigId) ??
		configIds[0] ??
		""
	);
}
