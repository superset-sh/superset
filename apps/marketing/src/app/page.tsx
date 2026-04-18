import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { FAQPageJsonLd } from "@/components/JsonLd";
import { FAQ_ITEMS } from "./components/FAQSection";
import { HeroSection } from "./components/HeroSection";

// Lazy load below-fold sections to reduce initial JS bundle (~304 KiB unused JS)
const TrustedBySection = dynamic(() =>
	import("./components/TrustedBySection").then((mod) => mod.TrustedBySection),
);
const FeaturesSection = dynamic(() =>
	import("./components/FeaturesSection").then((mod) => mod.FeaturesSection),
);
const WallOfLoveSection = dynamic(() =>
	import("./components/WallOfLoveSection").then((mod) => mod.WallOfLoveSection),
);
const FAQSection = dynamic(() =>
	import("./components/FAQSection").then((mod) => mod.FAQSection),
);
const CTASection = dynamic(() =>
	import("./components/CTASection").then((mod) => mod.CTASection),
);

export const metadata: Metadata = {
	alternates: {
		canonical: COMPANY.MARKETING_URL,
	},
};

export default function Home() {
	return (
		<main className="relative flex flex-col bg-background">
			{/* Vertical guide lines matching section padding */}
			<div
				aria-hidden="true"
				className="absolute inset-y-0 left-4 sm:left-8 lg:left-[30px] w-px bg-white/[0.08] pointer-events-none"
			/>
			<div
				aria-hidden="true"
				className="absolute inset-y-0 right-4 sm:right-8 lg:right-[30px] w-px bg-white/[0.08] pointer-events-none"
			/>
			<FAQPageJsonLd items={FAQ_ITEMS} />
			<HeroSection />
			<TrustedBySection />
			<FeaturesSection />
			<WallOfLoveSection />
			<FAQSection />
			<CTASection />
		</main>
	);
}
