import { Badge } from "@superset/ui/badge";
import { Card, CardContent } from "@superset/ui/card";
import type { BillingInfo } from "../../../../constants";
import { PLANS } from "../../../../constants";

interface CurrentPlanCardProps {
	billingInfo: BillingInfo;
}

export function CurrentPlanCard({ billingInfo }: CurrentPlanCardProps) {
	const plan = PLANS[billingInfo.currentPlan];

	return (
		<Card className="gap-0 rounded-lg border-border/60 py-0 shadow-none">
			<CardContent className="px-5 py-4">
				<div className="flex items-center justify-between">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2 mb-1">
							<span className="text-sm font-medium">{plan.name} plan</span>
							<Badge variant="secondary">Current</Badge>
						</div>
						<p className="text-xs text-muted-foreground">{plan.description}</p>
					</div>
					<div className="ml-6 text-right flex-shrink-0">
						<div className="text-[11px] text-muted-foreground mb-0.5">
							Users
						</div>
						<div className="text-sm font-medium">{billingInfo.usage.users}</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
