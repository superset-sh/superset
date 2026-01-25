import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Card, CardContent } from "@superset/ui/card";
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
	const isCancelingAtPeriodEnd = isPaidPlan && !!cancelAt;

	return (
		<Card className="gap-0 rounded-lg border-border/60 py-0 shadow-none">
			<CardContent className="px-5 py-4">
				<div className="flex items-center justify-between">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2 mb-1">
							<span className="text-sm font-medium">{plan.name} plan</span>
							{isCancelingAtPeriodEnd && cancelAt ? (
								<Badge
									variant="outline"
									className="text-amber-600 border-amber-600/30"
								>
									Cancels {format(new Date(cancelAt), "MMMM d, yyyy")}
								</Badge>
							) : (
								<Badge variant="secondary">Current</Badge>
							)}
						</div>
						<p className="text-xs text-muted-foreground">
							{isCancelingAtPeriodEnd
								? "Your plan will be downgraded to Free at the end of the billing period"
								: isPaidPlan && periodEnd
									? `Renews ${format(new Date(periodEnd), "MMMM d, yyyy")}`
									: plan.description}
						</p>
					</div>
					{isPaidPlan &&
						(isCancelingAtPeriodEnd ? (
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
						))}
				</div>
			</CardContent>
		</Card>
	);
}
