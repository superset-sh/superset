"use client";

import { useState } from "react";
import { PRICING_TIERS } from "../../constants";
import { BillingToggle } from "./components/BillingToggle";
import { PricingCard } from "./components/PricingCard";

export function PricingTiers() {
	const [isYearly, setIsYearly] = useState(true);

	return (
		<div className="flex flex-col gap-10">
			<div className="flex justify-center">
				<BillingToggle isYearly={isYearly} onChange={setIsYearly} />
			</div>
			<div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
				{PRICING_TIERS.map((tier) => (
					<PricingCard key={tier.id} tier={tier} isYearly={isYearly} />
				))}
			</div>
		</div>
	);
}
