/** Local calendar date as `YYYY-MM-DD`, `days` from today. */
export function isoDateFromToday(days = 0): string {
	const date = new Date();
	date.setDate(date.getDate() + days);
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

export function parseIsoDate(value: string): Date {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}
