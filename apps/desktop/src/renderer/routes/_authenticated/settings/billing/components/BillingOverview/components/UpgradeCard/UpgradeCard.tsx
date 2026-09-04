import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
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
					<span className="text-sm font-medium">
						<Trans>Upgrade to {i18n._(plan.name)}</Trans>
					</span>
					<span className="inline-flex items-center rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">
						{i18n._(plan.name)}
					</span>
				</div>
				<div className="text-xs text-muted-foreground mt-0.5">
					<Trans>
						${monthly} per user/mo. Cloud workspaces, mobile, priority support.
					</Trans>
				</div>
			</div>
			<Button
				onClick={onUpgrade}
				size="sm"
				disabled={isUpgrading}
				className="shrink-0"
			>
				{isUpgrading ? <Trans>Redirecting...</Trans> : <Trans>Upgrade</Trans>}
			</Button>
		</div>
	);
}
