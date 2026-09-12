import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuCircleMinus } from "react-icons/lu";
import { CHECK_STATUS_ICONS } from "renderer/routes/_authenticated/_dashboard/utils/checkStatusIcons";
import {
	type PullRequestCheck,
	summarizePullRequestChecks,
} from "../pull-request-checks";

interface PullRequestChecksSummaryProps {
	checks: PullRequestCheck[];
}

const STATUS_CONFIG = {
	success: CHECK_STATUS_ICONS.success,
	failure: CHECK_STATUS_ICONS.failure,
	pending: CHECK_STATUS_ICONS.pending,
	none: { Icon: LuCircleMinus, className: "text-muted-foreground" },
} as const;

export function PullRequestChecksSummary({
	checks,
}: PullRequestChecksSummaryProps) {
	const { t } = useLingui();
	const summary = summarizePullRequestChecks(checks);
	const { Icon, className } = STATUS_CONFIG[summary.status];
	const label =
		summary.status === "none"
			? checks.length === 0
				? t({
						message: "No checks reported",
					})
				: t({
						message: "All checks skipped or cancelled",
					})
			: summary.status === "success"
				? t({
						message: `All ${summary.relevantChecks.length} checks passed`,
					})
				: summary.status === "failure"
					? t({
							message: `${summary.failing} of ${summary.relevantChecks.length} checks failed`,
						})
					: t({
							message: `${summary.pending} of ${summary.relevantChecks.length} checks running`,
						});

	return (
		<output
			className={cn("flex shrink-0 items-center gap-1.5 text-xs", className)}
			title={label}
			aria-label={label}
		>
			<Icon
				className={cn(
					"size-3.5",
					summary.status === "pending" &&
						"animate-spin motion-reduce:animate-none",
				)}
			/>
			<span className="hidden tabular-nums @lg:inline">
				{summary.status === "none" ? (
					checks.length === 0 ? (
						<Trans>No checks</Trans>
					) : (
						<Trans>Skipped</Trans>
					)
				) : (
					`${summary.passing}/${summary.relevantChecks.length}`
				)}
			</span>
		</output>
	);
}
