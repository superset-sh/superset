import { formatDateTime } from "@superset/i18n/format";
import { compactTime } from "../../../../../../utils/compactTime";

/** The receipt line under "Merged by": "now · August 15, 2026 at 3:25 PM". */
export function mergedSubLabel(mergedAt: Date, nowMs?: number): string {
	const absolute = formatDateTime(mergedAt, {
		dateStyle: "long",
		timeStyle: "short",
	});
	return `${compactTime(mergedAt.getTime(), nowMs)} · ${absolute}`;
}
