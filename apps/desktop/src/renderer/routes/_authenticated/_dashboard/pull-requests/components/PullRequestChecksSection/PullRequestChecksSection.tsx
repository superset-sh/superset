import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuArrowUpRight, LuCircleMinus } from "react-icons/lu";
import { CHECK_STATUS_ICONS } from "renderer/routes/_authenticated/_dashboard/utils/checkStatusIcons";
import {
	type PullRequestCheck,
	summarizePullRequestChecks,
} from "../pull-request-checks";

interface PullRequestChecksSectionProps {
	checks: PullRequestCheck[];
}

export function PullRequestChecksSection({
	checks,
}: PullRequestChecksSectionProps) {
	const { t } = useLingui();
	// Capy's checks list states each row's outcome as a word next to the
	// external-link icon, not just an icon color — matches that.
	const checkStatusLabels: Record<PullRequestCheck["status"], string> = {
		success: t({
			message: "Passed",
		}),
		failure: t({
			message: "Failed",
		}),
		pending: t({
			message: "Running",
		}),
		skipped: t({
			message: "Skipped",
		}),
		cancelled: t({
			message: "Cancelled",
		}),
	};
	const summary = summarizePullRequestChecks(checks);

	return (
		<section aria-labelledby="pull-request-checks-heading">
			<div className="mb-3 flex items-center justify-between gap-3">
				<h2 id="pull-request-checks-heading" className="text-sm font-semibold">
					<Trans>Checks</Trans>
				</h2>
				<span className="text-xs text-muted-foreground">
					{summary.status === "none" ? (
						checks.length === 0 ? (
							<Trans>No checks reported</Trans>
						) : (
							<Trans>All checks skipped or cancelled</Trans>
						)
					) : summary.status === "success" ? (
						<Trans>All {summary.relevantChecks.length} passed</Trans>
					) : summary.status === "failure" ? (
						<Trans>{summary.failing} failing</Trans>
					) : (
						<Trans>{summary.pending} running</Trans>
					)}
				</span>
			</div>
			<div>
				{checks.length === 0 ? (
					<div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
						<LuCircleMinus className="size-3.5" />
						<Trans>No checks reported for the latest commit.</Trans>
					</div>
				) : (
					checks.map((check, index) => {
						const { Icon, className } = CHECK_STATUS_ICONS[check.status];
						const content = (
							<>
								<Icon
									className={cn(
										"size-3.5 shrink-0",
										className,
										check.status === "pending" &&
											"animate-spin motion-reduce:animate-none",
									)}
								/>
								<span className="min-w-0 flex-1 truncate text-xs">
									{check.name}
								</span>
								<span className="shrink-0 text-xs text-muted-foreground">
									{checkStatusLabels[check.status]}
								</span>
								{check.url && (
									<LuArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
								)}
							</>
						);
						const rowClassName =
							"flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 -mx-2 hover:bg-fill-hover";
						return check.url ? (
							<a
								key={`${check.name}-${index}`}
								href={check.url}
								target="_blank"
								rel="noopener noreferrer"
								className={rowClassName}
							>
								{content}
							</a>
						) : (
							<div key={`${check.name}-${index}`} className={rowClassName}>
								{content}
							</div>
						);
					})
				)}
			</div>
		</section>
	);
}
