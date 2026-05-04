import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { format } from "date-fns";
import { HiSparkles } from "react-icons/hi2";
import { PLANS, type PlanTier } from "../../../../constants";

interface CurrentPlanCardProps {
	currentPlan: PlanTier;
	onCancel?: () => void;
	isCanceling?: boolean;
	onRestore?: () => void;
	isRestoring?: boolean;
	cancelAt?: Date | null;
	periodEnd?: Date | null;
}

export function CurrentPlanCard({
	currentPlan,
	onCancel,
	isCanceling,
	onRestore,
	isRestoring,
	cancelAt,
	periodEnd,
}: CurrentPlanCardProps) {
	const plan = PLANS[currentPlan];
	const isPaidPlan = currentPlan !== "free";
	const isEnterprise = currentPlan === "enterprise";
	const isCancelingAtPeriodEnd = isPaidPlan && !isEnterprise && !!cancelAt;

	const hint =
		isCancelingAtPeriodEnd && cancelAt
			? `Cancels ${format(new Date(cancelAt), "MMMM d, yyyy")} — downgrades to Free at the end of the billing period.`
			: isEnterprise
				? "Managed by your organization admin."
				: isPaidPlan && periodEnd
					? `Renews ${format(new Date(periodEnd), "MMMM d, yyyy")}.`
					: `${plan.description}.`;

	return (
		<div className="flex items-center justify-between gap-8 py-3">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					{isPaidPlan && (
						<HiSparkles
							className={cn(
								"size-3.5 shrink-0",
								currentPlan === "pro" && "text-violet-500",
								currentPlan === "enterprise" && "text-amber-500",
							)}
						/>
					)}
					<span
						className={cn(
							"text-sm font-medium",
							currentPlan === "pro" &&
								"bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent",
							currentPlan === "enterprise" &&
								"bg-gradient-to-r from-amber-600 to-rose-600 bg-clip-text text-transparent",
						)}
					>
						{plan.name} plan
					</span>
				</div>
				<div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
			</div>
			{isPaidPlan && !isEnterprise && (
				<div className="shrink-0">
					{isCancelingAtPeriodEnd ? (
						<Button
							variant="ghost"
							size="sm"
							onClick={onRestore}
							disabled={isRestoring}
							className="text-primary"
						>
							{isRestoring ? "Restoring..." : "Restore plan"}
						</Button>
					) : (
						<Button
							variant="ghost"
							size="sm"
							onClick={onCancel}
							disabled={isCanceling}
							className="text-muted-foreground hover:text-destructive"
						>
							{isCanceling ? "Canceling..." : "Cancel plan"}
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
