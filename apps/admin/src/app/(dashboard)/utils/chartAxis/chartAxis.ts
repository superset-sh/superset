const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;
const MULTI_MONTH_SPAN_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

interface DateAxisConfig {
	ticks?: (string | number)[];
	tickFormatter: (value: string | number) => string;
}

// Analytics dates are calendar strings with no timezone meaning ("2026-02-01"
// is February everywhere), but `new Date("2026-02-01")` parses as UTC
// midnight and formats in local time — which renders it as January in the
// Americas. Every formatter here pins to UTC so labels match the data.
export function formatDay(value: string): string {
	return new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString(
		"en-US",
		{ month: "short", day: "numeric", timeZone: "UTC" },
	);
}

export function formatMonth(value: string): string {
	const month = value.length === 7 ? `${value}-01` : value.slice(0, 10);
	return new Date(`${month}T00:00:00Z`).toLocaleDateString("en-US", {
		month: "long",
		timeZone: "UTC",
	});
}

// Shared x-axis rule for date-valued charts: multi-month ranges label one
// tick per month ("January"); shorter ranges label "Aug 8". Non-date axes
// (percentiles etc.) pass through unchanged.
export function makeDateAxis(values: (string | number)[]): DateAxisConfig {
	const dateValues = values.filter(
		(value): value is string =>
			typeof value === "string" && ISO_DATE_PREFIX.test(value),
	);
	if (dateValues.length < 2 || dateValues.length !== values.length) {
		return { tickFormatter: (value) => String(value) };
	}

	const times = dateValues.map((value) =>
		new Date(`${value.slice(0, 10)}T00:00:00Z`).getTime(),
	);
	const spanDays = (Math.max(...times) - Math.min(...times)) / DAY_MS;

	if (spanDays > MULTI_MONTH_SPAN_DAYS) {
		const firstOfMonth = new Map<string, string>();
		for (const value of dateValues) {
			const month = value.slice(0, 7);
			if (!firstOfMonth.has(month)) firstOfMonth.set(month, value);
		}
		return {
			ticks: [...firstOfMonth.values()],
			tickFormatter: (value) => formatMonth(String(value)),
		};
	}

	return {
		tickFormatter: (value) => formatDay(String(value)),
	};
}
