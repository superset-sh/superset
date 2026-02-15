export function toOutlitProperties(
	properties?: Record<string, unknown>,
): Record<string, string | number | boolean | null> | undefined {
	if (!properties) return undefined;
	const result: Record<string, string | number | boolean | null> = {};
	for (const [key, value] of Object.entries(properties)) {
		if (
			value === null ||
			typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "boolean"
		) {
			result[key] = value;
		}
	}
	return result;
}
