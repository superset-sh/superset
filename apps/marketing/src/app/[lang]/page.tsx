import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import {
	FAQPageJsonLd,
	HomeWebPageJsonLd,
	ServiceJsonLd,
} from "@/components/JsonLd";
import { FAQ_ITEMS, faqSourceText } from "./components/FAQSection";
import { HeroSection } from "./components/HeroSection";
import { WebMcpTools } from "./components/WebMcpTools";

// Lazy load below-fold sections to reduce initial JS bundle (~304 KiB unused JS)
const TrustedBySection = dynamic(() =>
	import("./components/TrustedBySection").then((mod) => mod.TrustedBySection),
);
const HowItWorksSection = dynamic(() =>
	import("./components/HowItWorksSection").then((mod) => mod.HowItWorksSection),
);
const FeaturesSection = dynamic(() =>
	import("./components/FeaturesSection").then((mod) => mod.FeaturesSection),
);
const WallOfLoveSection = dynamic(() =>
	import("./components/WallOfLoveSection").then((mod) => mod.WallOfLoveSection),
);
const SecuritySection = dynamic(() =>
	import("./components/SecuritySection").then((mod) => mod.SecuritySection),
);
const FAQSection = dynamic(() =>
	import("./components/FAQSection").then((mod) => mod.FAQSection),
);
const CTASection = dynamic(() =>
	import("./components/CTASection").then((mod) => mod.CTASection),
);

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	return {
		alternates: localizedAlternates(lang, "/"),
	};
}

export default async function Home() {
	await initServerI18n();

	return (
		<main className="flex flex-col bg-background">
			<FAQPageJsonLd
				items={FAQ_ITEMS.map((item) => ({
					question: faqSourceText(item.question),
					answer: faqSourceText(item.answer),
				}))}
			/>
			<HomeWebPageJsonLd />
			<ServiceJsonLd />
			<WebMcpTools />
			<HeroSection />
			<TrustedBySection />
			<HowItWorksSection />
			<FeaturesSection />
			<WallOfLoveSection />
			<SecuritySection />
			<FAQSection />
			<CTASection />
		</main>
	);
}
