"use client";

import { useState } from "react";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { WaitlistModal } from "@/components/layout/WaitlistModal";
import { HeroSection } from "./components/HeroSection";
import { ClientLogosSection } from "./components/ClientLogosSection";
import { FeaturesSection } from "./components/FeaturesSection";

export default function Home() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<>
			<Header />
			<main className="flex min-h-screen flex-col bg-black">
				<HeroSection />
				<ClientLogosSection />
				<FeaturesSection onOpenWaitlist={() => setIsWaitlistOpen(true)} />
				<Footer />
			</main>
			<WaitlistModal
				isOpen={isWaitlistOpen}
				onClose={() => setIsWaitlistOpen(false)}
			/>
		</>
	);
}
