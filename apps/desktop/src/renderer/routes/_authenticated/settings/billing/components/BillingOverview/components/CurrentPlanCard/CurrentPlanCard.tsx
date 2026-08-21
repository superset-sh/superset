import { isPaymentFailingStatus } from "@superset/shared/billing";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { format } from "date-fns";
import { PLANS, type PlanTier } from "../../../../constants";

interface CurrentPlanCardProps {
	currentPlan: PlanTier;
	onCancel?: () => void;
	isCanceling?: boolean;
	onRestore?: () => void;
	isRestoring?: boolean;
	cancelAt?: Date | null;
	periodEnd?: Date | null;
	status?: string | null;
}

export function CurrentPlanCard({
	currentPlan,
	onCancel,
	isCanceling,
	onRestore,
	isRestoring,
	cancelAt,
	periodEnd,
	status,
}: CurrentPlanCardProps) {
	const plan = PLANS[currentPlan];
	const isPaidPlan = currentPlan !== "free";
	const isEnterprise = currentPlan === "enterprise";
	const isCancelingAtPeriodEnd = isPaidPlan && !isEnterprise && !!cancelAt;
	const isPaymentFailing = isPaidPlan && isPaymentFailingStatus(status);

	const hint = isPaymentFailing
		? "Payment failed — update your payment method to keep this plan."
		: isCancelingAtPeriodEnd && cancelAt
			? `Cancels ${format(new Date(cancelAt), "MMMM d, yyyy")} — downgrades to Free at the end of the billing period.`
			: isEnterprise
				? "Managed by your organization admin."
				: isPaidPlan && periodEnd
					? `Renews ${format(new Date(periodEnd), "MMMM d, yyyy")}.`
					: `${plan.description}.`;

	return (
		<div className="flex items-center justify-between gap-8 py-3">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">{plan.name} plan</span>
					{isPaidPlan && (
						<span className="inline-flex items-center rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">
							{plan.name}
						</span>
					)}
					{isPaymentFailing && (
						<span className="inline-flex items-center rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">
							Payment failed
						</span>
					)}
				</div>
				<div
					className={cn(
						"text-xs mt-0.5",
						isPaymentFailing ? "text-amber-500" : "text-muted-foreground",
					)}
				>
					{hint}
				</div>
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
