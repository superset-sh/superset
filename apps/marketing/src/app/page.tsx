"use client";

import { CTASection } from "./components/CTASection";
import { FAQSection } from "./components/FAQSection";
import { FeaturesSection } from "./components/FeaturesSection";
import { HeroSection } from "./components/HeroSection";
import { TrustedBySection } from "./components/TrustedBySection";
import { VideoSection } from "./components/VideoSection";

export default function Home() {
	return (
		<main className="flex flex-col bg-background">
			<HeroSection />
			<VideoSection />
			<TrustedBySection />
			<FeaturesSection />
			<FAQSection />
			<CTASection />
		</main>
	);
}
