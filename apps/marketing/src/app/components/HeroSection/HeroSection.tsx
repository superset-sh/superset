"use client";

import { COMPANY } from "@superset/shared/constants";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";
import { BoidsBackground } from "./components/BoidsBackground";
import { ProductDemo } from "./components/ProductDemo";
import { TypewriterText } from "./components/TypewriterText";

const PIXEL_FONT_STYLE = {
	fontFamily: "var(--font-geist-pixel-grid)",
} satisfies React.CSSProperties;

const HERO_COPY = {
	segments: [
		{ text: "The Code Editor for " },
		{ text: "AI Agents.", style: PIXEL_FONT_STYLE },
	],
	subheadline:
		"Orchestrate 100+ coding agents in parallel. Works for any agents. Built for the AI era.",
};

export function HeroSection() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<div>
			<div className="relative flex flex-col items-center pt-24 sm:pt-32 lg:pt-40 pb-16 sm:pb-24 overflow-hidden">
				<BoidsBackground />
				<div className="relative w-full max-w-7xl mx-auto px-6 sm:px-8">
					<div className="flex flex-col items-center text-center">
						<div className="space-y-4 sm:space-y-6">
							<h1
								className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-medium tracking-tight leading-[1.1] text-foreground relative max-w-6xl mx-auto"
								style={{
									fontFamily: "var(--font-ibm-plex-mono), monospace",
								}}
							>
								{/* Sizer must mirror the visible segments' fonts so wrapping matches */}
								<span className="invisible" aria-hidden="true">
									{HERO_COPY.segments.map((segment) => (
										<span key={segment.text} style={segment.style}>
											{segment.text}
										</span>
									))}
								</span>
								<span className="absolute inset-0">
									<TypewriterText
										segments={HERO_COPY.segments}
										speed={40}
										delay={600}
									/>
								</span>
							</h1>
							<p
								id="hero-subheadline"
								className="text-base sm:text-xl font-light text-muted-foreground max-w-4xl mx-auto"
							>
								{HERO_COPY.subheadline}
							</p>
						</div>

						<div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mt-6 sm:mt-8">
							<DownloadButton onJoinWaitlist={() => setIsWaitlistOpen(true)} />
							<button
								type="button"
								className="px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-normal bg-background border border-border text-foreground hover:bg-muted transition-colors flex items-center gap-2"
								onClick={() => window.open(COMPANY.GITHUB_URL, "_blank")}
								aria-label="View on GitHub"
							>
								View on GitHub
								<FaGithub className="size-4" />
							</button>
						</div>
					</div>

					<div className="relative w-full mt-20 sm:mt-32 lg:mt-40">
						<ProductDemo />
					</div>
				</div>
			</div>
			<WaitlistModal
				isOpen={isWaitlistOpen}
				onClose={() => setIsWaitlistOpen(false)}
			/>
		</div>
	);
}
