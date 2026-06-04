export function toRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return null;
}

export function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => (typeof item === "string" ? item.trim() : String(item)))
		.filter((item) => item.length > 0);
}

export function formatTaskDate(value: unknown): string | null {
	if (typeof value !== "string" || value.trim().length === 0) return null;

	// Date-only values should be rendered in UTC to avoid day shifts by locale tz.
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		const [year, month, day] = value.split("-").map(Number);
		const date = new Date(Date.UTC(year, month - 1, day));
		return date.toLocaleDateString(undefined, { timeZone: "UTC" });
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString();
}
