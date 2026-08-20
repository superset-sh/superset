import { LuCircleDashed } from "react-icons/lu";
import type { RiskLevel } from "../../../../../../types/review";
import {
	DIFF_STAT_NEGATIVE_CLASSNAME,
	DIFF_STAT_POSITIVE_CLASSNAME,
} from "../../../../../../utils/reviewTagStyles";
import { RiskLevelBadge } from "../RiskLevelBadge";

interface RiskChapterRowProps {
	order: number;
	title: string;
	additions: number;
	deletions: number;
	riskLevel: RiskLevel;
}

export function RiskChapterRow({
	order,
	title,
	additions,
	deletions,
	riskLevel,
}: RiskChapterRowProps) {
	return (
		<li className="flex list-none items-center gap-3 rounded-lg bg-[#ececec] p-2 dark:bg-muted">
			<LuCircleDashed className="size-4 shrink-0 text-muted-foreground" />
			<span className="min-w-0 flex-1 truncate text-[13px] font-medium">
				<span className="tabular-nums text-muted-foreground">{order}. </span>
				{title}
			</span>
			<span className="flex shrink-0 items-center gap-2 text-xs">
				<span className="flex items-center gap-1 font-medium tabular-nums">
					<span className={DIFF_STAT_POSITIVE_CLASSNAME}>+{additions}</span>
					<span className={DIFF_STAT_NEGATIVE_CLASSNAME}>-{deletions}</span>
				</span>
				<RiskLevelBadge riskLevel={riskLevel} />
			</span>
		</li>
	);
}
