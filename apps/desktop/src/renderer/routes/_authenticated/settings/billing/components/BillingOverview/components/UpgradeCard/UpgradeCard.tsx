import { Button } from "@superset/ui/button";
import { Card, CardContent } from "@superset/ui/card";
import { Link } from "@tanstack/react-router";
import { HiCheck } from "react-icons/hi2";
import { PLANS } from "../../../../constants";

interface UpgradeCardProps {
	onUpgrade: () => void;
	isUpgrading: boolean;
	hasTrialed: boolean;
}

export function UpgradeCard({
	onUpgrade,
	isUpgrading,
	hasTrialed,
}: UpgradeCardProps) {
	const plan = PLANS.pro;
	const ctaLabel = hasTrialed ? "Upgrade now" : "Start free trial";
	const headline = hasTrialed
		? `Upgrade to ${plan.name} plan`
		: `Try ${plan.name} free for 14 days`;

	return (
		<Card className="gap-0 rounded-lg border-border/60 py-0 shadow-none">
			<CardContent className="px-5 py-4">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<div className="text-sm font-medium">{headline}</div>
						<p className="text-xs text-muted-foreground">
							${plan.price?.monthly ? plan.price.monthly / 100 : 0} per user/mo
							{hasTrialed ? "" : " after trial"}
						</p>
					</div>
					<div className="flex items-center gap-3">
						<Button variant="ghost" size="sm" asChild>
							<Link to="/settings/billing/plans">View all plans</Link>
						</Button>
						<Button onClick={onUpgrade} size="sm" disabled={isUpgrading}>
							{isUpgrading ? "Redirecting..." : ctaLabel}
						</Button>
					</div>
				</div>

				<div className="my-3 h-px bg-border/60" />

				<div className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
					{plan.features.map((feature) => (
						<div key={feature.id} className="flex items-center gap-2">
							<HiCheck className="h-3.5 w-3.5 text-accent-foreground flex-shrink-0" />
							<span className="leading-tight">{feature.name}</span>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
