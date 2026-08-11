"use client";

import { COMPANY } from "@superset/shared/constants";
import Link from "next/link";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";
import { BoidsBackground } from "./components/BoidsBackground";
import { ProductDemo } from "./components/ProductDemo";
import { TypewriterText } from "./components/TypewriterText";

const HERO_COPY = {
	segments: [
		{ text: "The Code Editor for " },
		{
			text: "AI Agents.",
			className:
				"corner-brackets inline-block px-[0.2em] py-[0.06em] whitespace-nowrap",
		},
	],
	subheadline:
		"Orchestrate 100+ parallel coding agents, automate recurring tasks, and run workspaces anywhere.",
};

export function HeroSection() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<div>
			<div className="relative flex flex-col items-center pt-24 sm:pt-32 lg:pt-40 pb-16 sm:pb-24 overflow-hidden">
				<BoidsBackground />
				{/* Hiring pill: pinned just below the sticky header, out of the hero flow */}
				<Link
					href="/join-us"
					className="group absolute top-5 sm:top-6 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-2 rounded-[2px] border border-border bg-background/80 px-3 py-1.5 text-xs font-mono text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/[0.2]"
				>
					<span className="text-brand shrink-0">●</span>
					<span>
						We&apos;re hiring engineers
						<span className="hidden sm:inline"> in San Francisco</span>
					</span>
					<span className="shrink-0 transition-transform group-hover:translate-x-0.5">
						→
					</span>
				</Link>
				<div className="relative w-full max-w-7xl mx-auto px-6 sm:px-8">
					<div className="flex flex-col items-center text-center">
						<div className="space-y-4 sm:space-y-6">
							<h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-medium tracking-tight leading-[1.1] [word-spacing:0.15em] text-foreground relative max-w-6xl mx-auto">
								{/* Sizer must mirror the visible segments' styling so wrapping matches */}
								<span className="invisible" aria-hidden="true">
									{HERO_COPY.segments.map((segment) => (
										<span key={segment.text} className={segment.className}>
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
