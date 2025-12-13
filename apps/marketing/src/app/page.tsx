"use client";

import { CTASection } from "./components/CTASection";
import { HeroSection } from "./components/HeroSection";
import { SecuritySection } from "./components/SecuritySection";
import { TrustedBySection } from "./components/TrustedBySection";
import { VideoSection } from "./components/VideoSection";

export default function Home() {
	return (
		<main className="flex flex-col bg-background">
			<HeroSection />
			<TrustedBySection />
			<VideoSection />
			<SecuritySection />
			<CTASection />
		</main>
	);
}
