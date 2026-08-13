const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;
const MULTI_MONTH_SPAN_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

interface DateAxisConfig {
	ticks?: (string | number)[];
	tickFormatter: (value: string | number) => string;
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

	const times = dateValues.map((value) => new Date(value).getTime());
	const spanDays = (Math.max(...times) - Math.min(...times)) / DAY_MS;

	if (spanDays > MULTI_MONTH_SPAN_DAYS) {
		const firstOfMonth = new Map<string, string>();
		for (const value of dateValues) {
			const month = value.slice(0, 7);
			if (!firstOfMonth.has(month)) firstOfMonth.set(month, value);
		}
		return {
			ticks: [...firstOfMonth.values()],
			tickFormatter: (value) =>
				new Date(String(value)).toLocaleDateString("en-US", {
					month: "long",
				}),
		};
	}

	return {
		tickFormatter: (value) =>
			new Date(String(value)).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			}),
	};
}
