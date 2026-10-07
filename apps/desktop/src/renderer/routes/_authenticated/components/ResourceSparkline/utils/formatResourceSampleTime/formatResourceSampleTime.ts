import { formatDate } from "@superset/i18n/format";

export function formatResourceSampleTime(
	_label: unknown,
	payload: ReadonlyArray<{ payload?: { at?: unknown } }>,
): string | null {
	const at = payload[0]?.payload?.at;
	if (typeof at !== "number" || !Number.isFinite(at)) return null;
	const date = new Date(at);
	if (Number.isNaN(date.getTime())) return null;
	return formatDate(date, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}
