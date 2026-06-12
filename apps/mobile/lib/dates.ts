export function parseDate(value: Date | string | number): Date {
	if (value instanceof Date) return value;
	if (typeof value === "number") return new Date(value);
	let normalized = value.includes("T") ? value : value.replace(" ", "T");
	normalized = normalized.replace(/([+-]\d{2})$/, "$1:00");
	const parsed = new Date(normalized);
	return Number.isNaN(parsed.getTime()) ? new Date(value) : parsed;
}
