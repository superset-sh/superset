import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { Separator } from "@superset/ui/separator";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import type { Plan, PlanTier } from "../../../../constants";
import { FeatureList } from "../FeatureList";

interface PlanCardProps {
	plan: Plan;
	currentPlan: PlanTier;
}

export function PlanCard({ plan, currentPlan }: PlanCardProps) {
	const isCurrent = plan.id === currentPlan;

	const handleCTA = () => {
		if (plan.cta.action === "current") {
			return;
		}

		if (plan.cta.action === "contact") {
			window.open("mailto:founders@superset.sh", "_blank");
		} else if (plan.cta.action === "upgrade") {
			toast.info("Stripe integration coming soon");
		}
	};

	return (
		<Card
			className={cn(
				"flex flex-col h-full",
				isCurrent && "border-primary ring-2 ring-primary/20",
			)}
		>
			<CardHeader>
				<div className="flex items-start justify-between">
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<CardTitle>{plan.name}</CardTitle>
							{isCurrent && <Badge variant="outline">Current</Badge>}
						</div>
						<CardDescription>{plan.description}</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="flex-1 space-y-6">
				<div>
					{plan.price === null ? (
						<div className="text-2xl font-bold">
							{plan.id === "free" ? "Free" : "Contact sales"}
						</div>
					) : (
						<div>
							<div className="flex items-baseline gap-1">
								<span className="text-3xl font-bold">
									${plan.price.monthly / 100}
								</span>
								<span className="text-muted-foreground">per user/month</span>
							</div>
							{plan.price.yearly && (
								<div className="text-xs text-muted-foreground mt-1">
									or ${plan.price.yearly / 100}/year (~$
									{Math.round(plan.price.yearly / 12 / 100)}
									/mo)
								</div>
							)}
						</div>
					)}
				</div>
				<Separator />
				<FeatureList features={plan.features} />
			</CardContent>
			<CardFooter>
				<Button
					variant={isCurrent ? "outline" : "default"}
					className="w-full"
					disabled={plan.cta.disabled || isCurrent}
					onClick={handleCTA}
				>
					{plan.cta.text}
				</Button>
			</CardFooter>
		</Card>
	);
}
