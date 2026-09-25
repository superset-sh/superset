import { formatDistanceStrict } from "date-fns";
import type { PullRequestCheck } from "../../../../utils/pullRequest";

export function checkDuration(check: PullRequestCheck): string | null {
	if (!check.startedAt || !check.completedAt) return null;
	return formatDistanceStrict(check.completedAt, check.startedAt)
		.replace(/ minutes?/, "m")
		.replace(/ seconds?/, "s")
		.replace(/ hours?/, "h");
}
