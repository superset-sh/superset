"use client";

import dynamic from "next/dynamic";

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

export default function Home() {
	return (
		<main className="flex flex-col bg-background">
			<HeroSection />
			<VideoSection />
			<TrustedBySection />
			<FeaturesSection />
			<WallOfLoveSection />
			<FAQSection />
			<CTASection />
		</main>
	);
}
