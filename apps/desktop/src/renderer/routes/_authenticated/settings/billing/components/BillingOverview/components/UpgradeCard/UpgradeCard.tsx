import { Button } from "@superset/ui/button";
import { HiSparkles } from "react-icons/hi2";
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
				<div className="flex items-center gap-1.5">
					<HiSparkles className="size-3.5 shrink-0 text-violet-500" />
					<span className="text-sm font-medium bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">
						Upgrade to {plan.name}
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
				className="shrink-0 bg-gradient-to-r from-violet-600 to-blue-600 text-white hover:from-violet-700 hover:to-blue-700 border-0"
			>
				{isUpgrading ? "Redirecting..." : "Upgrade"}
			</Button>
		</div>
	);
}
