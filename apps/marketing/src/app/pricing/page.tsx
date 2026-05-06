import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { ComparisonTable } from "./components/ComparisonTable";
import { PricingFAQ } from "./components/PricingFAQ";
import { PricingHero } from "./components/PricingHero";
import { PricingTiers } from "./components/PricingTiers";

export const metadata: Metadata = {
	title: "Pricing",
	description: `Simple pricing for every team. Free for individuals, $15/user/month for teams, custom for enterprise. Run 10+ parallel coding agents with ${COMPANY.NAME}.`,
	alternates: {
		canonical: `${COMPANY.MARKETING_URL}/pricing`,
	},
};

export default function PricingPage() {
	return (
		<main className="relative min-h-screen">
			<PricingHero />

			<section className="relative border-b border-border">
				<div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
					<PricingTiers />
				</div>
			</section>

			<section className="relative border-b border-border">
				<div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
					<ComparisonTable />
				</div>
			</section>

			<section className="relative">
				<div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
					<PricingFAQ />
				</div>
			</section>
		</main>
	);
}
