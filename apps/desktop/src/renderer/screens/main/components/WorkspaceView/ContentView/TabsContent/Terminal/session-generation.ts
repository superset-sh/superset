export function matchesSessionGeneration(
	activeSessionGeneration: string | null,
	eventSessionGeneration?: string,
): boolean {
	if (!eventSessionGeneration) return true;
	if (!activeSessionGeneration) return false;
	return eventSessionGeneration === activeSessionGeneration;
}
