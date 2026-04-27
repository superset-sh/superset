import { cn } from "@superset/ui/utils";
import {
	LuCircleCheck,
	LuCircleDashed,
	LuCircleX,
	LuUserCheck,
	LuUserMinus,
	LuUserX,
} from "react-icons/lu";
import type { ChecksRollup } from "../../../../utils/computeChecksStatus";
import type { PullRequest } from "../../../../utils/getPRFlowState";

interface PRStatusIndicatorsProps {
	checks: ChecksRollup;
	reviewDecision: PullRequest["reviewDecision"];
}

/**
 * Compact pair of dots next to the PR number conveying CI + review status.
 * - Circle icons for CI (universally read as "build status").
 * - User icons for review (clearly distinct from CI).
 * Each dot is suppressed when its data is absent (no checks yet, no review
 * required) so the row stays quiet for trivial PRs.
 */
export function PRStatusIndicators({
	checks,
	reviewDecision,
}: PRStatusIndicatorsProps) {
	const hasChecks = checks.overall !== "none";
	const hasReview = reviewDecision !== null;
	if (!hasChecks && !hasReview) return null;

	return (
		<div className="ml-0.5 flex items-center gap-0.5">
			{hasChecks && <ChecksDot status={checks.overall} />}
			{hasReview && <ReviewDot decision={reviewDecision} />}
		</div>
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

function ReviewDot({
	decision,
}: {
	decision: NonNullable<PullRequest["reviewDecision"]>;
}) {
	if (decision === "approved") {
		return (
			<LuUserCheck
				aria-hidden="true"
				className={cn("size-3 shrink-0", "text-emerald-500")}
			/>
		);
	}
	if (decision === "changes_requested") {
		return (
			<LuUserX
				aria-hidden="true"
				className={cn("size-3 shrink-0", "text-rose-500")}
			/>
		);
	}
	return (
		<LuUserMinus
			aria-hidden="true"
			className={cn("size-3 shrink-0", "text-amber-500")}
		/>
	);
}
