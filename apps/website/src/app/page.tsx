"use client";

import { Header } from "./components/Header";
import { HeroSection } from "./components/HeroSection";

export default function Home() {
	return (
		<>
			<Header />
			<main
				className="flex flex-col bg-neutral-900"
				style={{ minHeight: "8000px" }}
			>
				<HeroSection />
			</main>
		</>
	);
}
