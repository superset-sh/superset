import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { FAQPageJsonLd } from "@/components/JsonLd";
import { ComparisonTable } from "./components/ComparisonTable";
import { PricingFAQ } from "./components/PricingFAQ";
import { PricingHero } from "./components/PricingHero";
import { PricingTiers } from "./components/PricingTiers";
import { TrustStrip } from "./components/TrustStrip";
import { PRICING_FAQ_ITEMS } from "./constants";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	return {
		title: i18n._(
			msg({
				message: "Pricing",
			}),
		),
		description: i18n._({
			...msg({
				message:
					"Simple pricing for every team. Free for individuals, $15/user/month for teams, custom for enterprise. Run 100+ parallel coding agents with {companyName}.",
			}),
			values: { companyName: COMPANY.NAME },
		}),
		alternates: localizedAlternates(lang, "/pricing"),
	};
}

export default async function PricingPage() {
	await initServerI18n();

	// JSON-LD is machine-facing, so it gets rendered strings rather than the
	// message descriptors the UI components resolve through Lingui.
	const faqJsonLdItems = PRICING_FAQ_ITEMS.map((item) => ({
		question: i18n._(item.question),
		answer: i18n._(item.answer),
	}));

	return (
		<main className="relative min-h-screen">
			<FAQPageJsonLd items={faqJsonLdItems} />
			<PricingHero />

			<section className="relative border-b border-border">
				<div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
					<PricingTiers />
				</div>
			</section>

			<section className="relative border-b border-border">
				<div className="max-w-6xl mx-auto px-6 py-10 md:py-12">
					<TrustStrip />
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
