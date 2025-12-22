"use client";

import { COMPANY } from "@superset/shared/constants";
import { motion } from "framer-motion";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";
import { GridBackground } from "./components/GridBackground";
import { ProductDemo } from "./components/ProductDemo";
import { TypewriterText } from "./components/TypewriterText";

export function HeroSection() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<div>
			<div className="flex mt-14 min-h-[calc(100vh-64px)] items-center overflow-hidden">
				<GridBackground />

				<div className="relative w-full max-w-[1600px] mx-auto px-8 lg:px-[30px] py-16">
					<div className="grid grid-cols-1 lg:grid-cols-[42%_58%] gap-12 lg:gap-16 items-center">
						<motion.div
							className="space-y-8"
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.5 }}
						>
							<div className="space-y-2 sm:space-y-6">
								<h1
									className="text-2xl sm:text-3xl lg:text-4xl font-normal tracking-normal leading-[1.3em] text-foreground"
									style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
								>
									<TypewriterText
										text="The Terminal for Coding Agents."
										speed={40}
										delay={600}
									/>
								</h1>
								<p className="text-md sm:text-lg font-light text-muted-foreground max-w-[400px]">
									Run dozens of Claude Code, Codex, or any other in parallel.
								</p>
							</div>

							<div className="flex flex-wrap items-center sm:gap-4 gap-2">
								<DownloadButton
									onJoinWaitlist={() => setIsWaitlistOpen(true)}
								/>
								<button
									type="button"
									className="px-6 py-3 text-base font-normal bg-background border border-border text-foreground hover:bg-muted transition-colors flex items-center gap-2"
									onClick={() => window.open(COMPANY.GITHUB_URL, "_blank")}
									aria-label="View on GitHub"
								>
									View on GitHub
									<FaGithub className="size-4" />
								</button>
							</div>
						</motion.div>

						<motion.div
							className="relative"
							initial={{ opacity: 0, x: 20 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ duration: 0.5, delay: 0.2 }}
						>
							<ProductDemo />
						</motion.div>
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
