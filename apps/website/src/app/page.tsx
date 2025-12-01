"use client";

import { useState } from "react";
import { Header } from "./components/Header";
import { HeroSection } from "./components/HeroSection";
import { WaitlistModal } from "./components/WaitlistModal";

export default function Home() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<>
			<Header />
			<main className="flex flex-col bg-neutral-900" style={{ minHeight: "8000px" }}>
				<HeroSection onJoinWaitlist={() => setIsWaitlistOpen(true)} />
			</main>
			<WaitlistModal
				isOpen={isWaitlistOpen}
				onClose={() => setIsWaitlistOpen(false)}
			/>
		</>
	);
}
