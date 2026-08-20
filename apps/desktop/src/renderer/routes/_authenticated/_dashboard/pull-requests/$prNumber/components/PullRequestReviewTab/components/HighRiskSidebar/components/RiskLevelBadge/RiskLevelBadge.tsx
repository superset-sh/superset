import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import type { RiskLevel } from "../../../../../../types/review";
import {
	REVIEW_TAG_STYLES,
	RISK_LEVEL_TAG_COLOR,
} from "../../../../../../utils/reviewTagStyles";

const RISK_LABELS: Record<Exclude<RiskLevel, null>, string> = {
	high: "High risk",
	medium: "Medium risk",
	low: "Low risk",
};

interface RiskLevelBadgeProps {
	riskLevel: RiskLevel;
	className?: string;
}

export function RiskLevelBadge({ riskLevel, className }: RiskLevelBadgeProps) {
	if (riskLevel === null) return null;

	return (
		<Badge
			variant="outline"
			className={cn(
				"rounded-full font-medium",
				REVIEW_TAG_STYLES[RISK_LEVEL_TAG_COLOR[riskLevel]],
				className,
			)}
		>
			{RISK_LABELS[riskLevel]}
		</Badge>
	);
}
