"use client";

import { useState } from "react";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { WaitlistModal } from "./components/WaitlistModal";
import { HeroSection } from "./components/HeroSection";
import { ClientLogosSection } from "./components/ClientLogosSection";
import { FeaturesSection } from "./components/FeaturesSection";
import { TestimonialsSection } from "./components/TestimonialsSection";

export default function Home() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<>
			<Header />
			<main className="flex min-h-screen flex-col bg-black">
				<HeroSection />
				<ClientLogosSection />
				<FeaturesSection onOpenWaitlist={() => setIsWaitlistOpen(true)} />
				<TestimonialsSection />
				<Footer />
			</main>
			<WaitlistModal
				isOpen={isWaitlistOpen}
				onClose={() => setIsWaitlistOpen(false)}
			/>
		</>
	);
}
