import { cn } from "@superset/ui/utils";
import { LuCircleCheck, LuCircleDashed, LuCircleX } from "react-icons/lu";
import type { ChecksRollup } from "../../../../utils/computeChecksStatus";

interface PRStatusIndicatorsProps {
	checks: ChecksRollup;
}

/**
 * Compact CI status dot next to the PR number. Suppressed when no checks are
 * reported so the row stays quiet for trivial PRs.
 */
export function PRStatusIndicators({ checks }: PRStatusIndicatorsProps) {
	if (checks.overall === "none") return null;

	return (
		<span className="ml-0.5 flex items-center">
			<ChecksDot status={checks.overall} />
		</span>
	);
}

function ChecksDot({ status }: { status: ChecksRollup["overall"] }) {
	if (status === "success") {
		return (
			<LuCircleCheck
				aria-hidden="true"
				className={cn("size-3 shrink-0", "text-emerald-500")}
			/>
		);
	}
	if (status === "failure") {
		return (
			<LuCircleX
				aria-hidden="true"
				className={cn("size-3 shrink-0", "text-rose-500")}
			/>
		);
	}
	return (
		<LuCircleDashed
			aria-hidden="true"
			className={cn("size-3 shrink-0", "text-amber-500")}
		/>
	);
}
