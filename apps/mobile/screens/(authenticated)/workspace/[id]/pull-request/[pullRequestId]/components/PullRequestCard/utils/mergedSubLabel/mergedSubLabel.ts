import { format } from "date-fns";
import { compactTime } from "../../../../../../utils/compactTime";

/** The receipt line under "Merged by": "now · August 15, 2026 at 3:25 PM". */
export function mergedSubLabel(mergedAt: Date, nowMs?: number): string {
	const absolute = format(mergedAt, "MMMM d, yyyy 'at' h:mm a");
	return `${compactTime(mergedAt.getTime(), nowMs)} · ${absolute}`;
}
