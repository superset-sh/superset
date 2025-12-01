"use client";

import { ClientLogosSection } from "./components/ClientLogosSection";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { HeroSection } from "./components/HeroSection";

export default function Home() {
	return (
		<>
			<Header />
			<main className="flex flex-col bg-neutral-900">
				<HeroSection />
				<ClientLogosSection />
				<Footer />
			</main>
		</>
	);
}
