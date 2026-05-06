import { Button } from "@superset/ui/button";
import { PLANS } from "../../../../constants";

interface UpgradeCardProps {
	onUpgrade: () => void;
	isUpgrading: boolean;
}

export function UpgradeCard({ onUpgrade, isUpgrading }: UpgradeCardProps) {
	const plan = PLANS.pro;
	const monthly = plan.price?.monthly ? plan.price.monthly / 100 : 0;

	return (
		<div className="flex items-center justify-between gap-8 py-3">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">Upgrade to {plan.name}</span>
					<span className="inline-flex items-center rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">
						{plan.name}
					</span>
				</div>
				<div className="text-xs text-muted-foreground mt-0.5">
					${monthly} per user/mo. Cloud workspaces, mobile, priority support.
				</div>
			</div>
			<Button
				onClick={onUpgrade}
				size="sm"
				disabled={isUpgrading}
				className="shrink-0"
			>
				{isUpgrading ? "Redirecting..." : "Upgrade"}
			</Button>
		</div>
	);
}
