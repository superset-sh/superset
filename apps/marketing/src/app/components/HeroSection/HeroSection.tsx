"use client";

import { COMPANY } from "@superset/shared/constants";
import { useFeatureFlagVariantKey } from "posthog-js/react";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { HERO_POSITIONING_FLAG } from "@/lib/analytics/hero-flag-bootstrap";
import { isMacPlatform, usePlatform } from "../../hooks/useOS";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";
import { BoidsBackground } from "./components/BoidsBackground";
import { ProductDemo } from "./components/ProductDemo";
import { TypewriterText } from "./components/TypewriterText";

const PIXEL_FONT_STYLE = {
	fontFamily: "var(--font-geist-pixel-grid)",
} satisfies React.CSSProperties;

interface HeroCopy {
	headline: string;
	segments: { text: string; style?: React.CSSProperties }[];
	subheadline: string;
}

const TEST_SUBHEADLINE =
	"Isolated workspaces for Claude Code, Codex, and any CLI agent. Review every change from one dashboard. Free to start.";

const HERO_COPY = {
	control: {
		headline: "The Code Editor for AI Agents.",
		segments: [
			{ text: "The Code Editor for " },
			{ text: "AI Agents.", style: PIXEL_FONT_STYLE },
		],
		subheadline:
			"Orchestrate 100+ coding agents in parallel. Works for any agents. Built for the AI era.",
	},
	"capability-mac": {
		headline: "Run parallel coding agents on your Mac.",
		segments: [
			{ text: "Run " },
			{ text: "parallel coding agents", style: PIXEL_FONT_STYLE },
			{ text: " on your Mac." },
		],
		subheadline: TEST_SUBHEADLINE,
	},
} satisfies Record<string, HeroCopy>;

export function HeroSection() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
	const { platform } = usePlatform();
	const heroVariant = useFeatureFlagVariantKey(HERO_POSITIONING_FLAG);
	const copy =
		isMacPlatform(platform) &&
		typeof heroVariant === "string" &&
		heroVariant in HERO_COPY
			? HERO_COPY[heroVariant as keyof typeof HERO_COPY]
			: HERO_COPY.control;

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
									{copy.segments.map((segment) => (
										<span key={segment.text} style={segment.style}>
											{segment.text}
										</span>
									))}
								</span>
								<span className="absolute inset-0">
									<TypewriterText
										key={copy.headline}
										segments={copy.segments}
										speed={40}
										delay={600}
									/>
								</span>
							</h1>
							<p
								id="hero-subheadline"
								className="text-base sm:text-xl font-light text-muted-foreground max-w-4xl mx-auto"
							>
								{copy.subheadline}
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
