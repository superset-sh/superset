const MONTH_SHORT = "short";
const _MONTH_LONG = "long";

export function formatContentDate(
	date: string,
	monthStyle: "short" | "long" = MONTH_SHORT,
): string {
	return new Date(date).toLocaleDateString("en-US", {
		year: "numeric",
		month: monthStyle,
		day: "numeric",
	});
}

export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

function toDateInput(dateValue: Date | string | number): string {
	return new Date(dateValue).toISOString().split("T")[0] as string;
}

export function normalizeContentDate(
	value: unknown,
	options: { fallbackToNow?: boolean } = {},
): string | undefined {
	const { fallbackToNow = true } = options;
	const fallback = fallbackToNow ? toDateInput(Date.now()) : undefined;

	if (value instanceof Date) {
		return toDateInput(value);
	}

	if (typeof value === "string" || typeof value === "number") {
		return value ? String(value) : fallback;
	}

	if (value) {
		return String(value);
	}

	return fallback;
}
