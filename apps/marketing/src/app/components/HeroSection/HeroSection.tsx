"use client";

import { COMPANY } from "@superset/shared/constants";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";
import { ProductDemo } from "./components/ProductDemo";
import { TypewriterText } from "./components/TypewriterText";

export function HeroSection() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<div>
			<div className="flex mt-14 min-h-[calc(100svh-64px)] items-center -translate-y-12 overflow-hidden">
				<div className="relative w-full max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-[30px] py-8 sm:py-12 lg:py-16">
					<div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-8 lg:gap-16 items-center">
						<div className="space-y-6 sm:space-y-8">
							<div className="space-y-2 sm:space-y-6">
								<h1
									className="text-3xl sm:text-4xl lg:text-5xl font-normal tracking-normal leading-[1.3em] text-foreground relative"
									style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
								>
									<span className="invisible" aria-hidden="true">
										The Terminal for Coding Agents.
									</span>
									<span className="absolute inset-0">
										<TypewriterText
											segments={[
												{ text: "The Terminal for " },
												{
													text: "Coding Agents",
													style: {
														fontFamily: "var(--font-geist-pixel-grid)",
													},
												},
												{ text: "." },
											]}
											speed={40}
											delay={600}
										/>
									</span>
								</h1>
								<p className="text-base sm:text-xl font-light text-muted-foreground max-w-[400px]">
									Orchestrate a team of Claude Code, Codex, or any other coding
									agents
								</p>
							</div>

							<div className="flex flex-wrap items-center gap-2 sm:gap-4">
								<DownloadButton
									onJoinWaitlist={() => setIsWaitlistOpen(true)}
								/>
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

						<div className="relative w-full min-w-0">
							<ProductDemo />
						</div>
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
