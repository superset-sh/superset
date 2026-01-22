import { Button } from "@superset/ui/button";
import { Link } from "@tanstack/react-router";
import { HiArrowRight } from "react-icons/hi2";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { MOCK_BILLING_INFO } from "../../constants";
import { CurrentPlanCard } from "./components/CurrentPlanCard";
import { InvoicesSection } from "./components/InvoicesSection";
import { UpgradeCard } from "./components/UpgradeCard";

interface BillingOverviewProps {
	visibleItems?: SettingItemId[] | null;
}

export function BillingOverview({ visibleItems }: BillingOverviewProps) {
	const billingInfo = MOCK_BILLING_INFO;
	const showOverview = isItemVisible(
		SETTING_ITEM_ID.BILLING_OVERVIEW,
		visibleItems,
	);
	const showInvoices = isItemVisible(
		SETTING_ITEM_ID.BILLING_INVOICES,
		visibleItems,
	);

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-6">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-lg font-semibold">Billing</h2>
						<p className="text-xs text-muted-foreground mt-0.5">
							For questions about billing,{" "}
							<a
								href="mailto:founders@superset.sh"
								className="text-primary hover:underline"
							>
								contact us
							</a>
						</p>
					</div>
					<Button variant="ghost" size="sm" asChild>
						<Link to="/settings/billing/plans">
							All plans
							<HiArrowRight className="h-3 w-3" />
						</Link>
					</Button>
				</div>
			</div>

			<div className="space-y-3">
				{showOverview && (
					<>
						<CurrentPlanCard billingInfo={billingInfo} />
						{billingInfo.currentPlan === "free" && <UpgradeCard />}
					</>
				)}

				{showInvoices && (
					<div className="mt-6">
						<InvoicesSection />
					</div>
				)}
			</div>
		</div>
	);
}
