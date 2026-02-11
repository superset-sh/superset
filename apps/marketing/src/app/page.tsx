import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { FAQPageJsonLd } from "@/components/JsonLd";
import { FAQ_ITEMS } from "./components/FAQSection";
import { HeroSection } from "./components/HeroSection";

// Lazy load below-fold sections to reduce initial JS bundle (~304 KiB unused JS)
const VideoSection = dynamic(() =>
	import("./components/VideoSection").then((mod) => mod.VideoSection),
);
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
		<main className="flex flex-col bg-background">
			<FAQPageJsonLd items={FAQ_ITEMS} />
			<HeroSection />
			<TrustedBySection />
			<VideoSection />
			<FeaturesSection />
			<WallOfLoveSection />
			<FAQSection />
			<CTASection />
		</main>
	);
}
