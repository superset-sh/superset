"use client";

import { COMPANY } from "@superset/shared/constants";
import { useScroll } from "framer-motion";
import { useRef, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";
import { ProductDemo } from "./components/ProductDemo";
import { TypewriterText } from "./components/TypewriterText";

export function HeroSection() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
	const demoRef = useRef<HTMLDivElement>(null);

	const { scrollYProgress } = useScroll({
		target: demoRef,
		offset: ["start 0.45", "start 0"],
	});

	return (
		<div>
			<div className="flex flex-col items-center pt-24 sm:pt-32 lg:pt-40 overflow-hidden">
				<div className="relative w-full max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-[30px]">
					<div className="flex flex-col items-center text-center">
						<div className="space-y-4 sm:space-y-6">
							<h1
								className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-medium tracking-tight leading-[1.1] text-foreground relative"
								style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
							>
								<span className="invisible" aria-hidden="true">
									The Code Editor for AI Agents.
								</span>
								<span className="absolute inset-0">
									<TypewriterText
										segments={[
											{ text: "The Code Editor for " },
											{
												text: "AI Agents.",
												style: {
													fontFamily: "var(--font-geist-pixel-grid)",
												},
											},
										]}
										speed={40}
										delay={600}
									/>
								</span>
							</h1>
							<p className="text-base sm:text-xl font-light text-muted-foreground max-w-4xl mx-auto">
								Orchestrate swarms of Claude Code, Codex, etc. in parallel.
								Works for any agents. Built for the AI era.
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

					<div
						ref={demoRef}
						className="relative w-full mt-12 sm:mt-16 lg:mt-20"
					>
						<ProductDemo scrollYProgress={scrollYProgress} />
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
