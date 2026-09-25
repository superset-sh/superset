import { getI18nInstance } from "@superset/i18n/server";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import {
	FAQPageJsonLd,
	HomeWebPageJsonLd,
	ServiceJsonLd,
} from "@/components/JsonLd";
import { FAQ_ITEMS } from "./components/FAQSection";
import { HeroSection } from "./components/HeroSection";
import { WebMcpTools } from "./components/WebMcpTools";

// Lazy load below-fold sections to reduce initial JS bundle (~304 KiB unused JS)
const TrustedBySection = dynamic(() =>
	import("./components/TrustedBySection").then((mod) => mod.TrustedBySection),
);
const MobileSection = dynamic(() =>
	import("./components/MobileSection").then((mod) => mod.MobileSection),
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
	const locale = await initServerI18n();
	const i18n = getI18nInstance(locale);

	return (
		<main className="flex flex-col bg-background">
			<FAQPageJsonLd
				items={FAQ_ITEMS.map((item) => ({
					question: i18n._(item.question),
					answer: i18n._(item.answer),
				}))}
			/>
			<HomeWebPageJsonLd />
			<ServiceJsonLd />
			<WebMcpTools />
			<HeroSection />
			<MobileSection />
			<TrustedBySection />
			<FeaturesSection />
			<WallOfLoveSection />
			<SecuritySection />
			<FAQSection />
			<CTASection />
		</main>
	);
}
