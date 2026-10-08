import { formatNumber } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import {
	PR_GREEN_TEXT_CLASS_NAME,
	PR_RED_TEXT_CLASS_NAME,
} from "../pull-request-colors";

interface PullRequestDiffStatProps {
	additions: number;
	deletions: number;
	className?: string;
}

/** The "+N −M" change size, in the diff's own green and red. */
export function PullRequestDiffStat({
	additions,
	deletions,
	className,
}: PullRequestDiffStatProps) {
	return (
		<span
			className={cn("inline-flex items-baseline gap-1 tabular-nums", className)}
		>
			<span className={PR_GREEN_TEXT_CLASS_NAME}>
				+{formatNumber(additions)}
			</span>
			<span className={PR_RED_TEXT_CLASS_NAME}>−{formatNumber(deletions)}</span>
		</span>
	);
}
