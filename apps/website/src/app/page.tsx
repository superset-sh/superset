"use client";

import { CTASection } from "./components/CTASection";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { HeroSection } from "./components/HeroSection";
import { SecuritySection } from "./components/SecuritySection";
import { TrustedBySection } from "./components/TrustedBySection";
import { VideoSection } from "./components/VideoSection";

export default function Home() {
	return (
		<>
			<Header />
			<main className="flex flex-col bg-neutral-900">
				<HeroSection />
				<TrustedBySection />
				<VideoSection />
				<SecuritySection />
				<CTASection />
			</main>
			<Footer />
		</>
	);
}
