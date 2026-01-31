"use client";

import { COMPANY } from "@superset/shared/constants";
import { motion } from "framer-motion";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { ShaderAnimation } from "../../../components/ui/shader-animation";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";
import { ProductDemo } from "./components/ProductDemo";
import { TypewriterText } from "./components/TypewriterText";

export function HeroSection() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<div>
			<div className="flex mt-14 min-h-[calc(100svh-64px)] items-center overflow-hidden">
				<ShaderAnimation opacity={0.01} speed={0.005} intensity={0.00015} />

				<div className="relative w-full max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-[30px] py-8 sm:py-12 lg:py-16">
					<div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-8 lg:gap-16 items-center">
						<motion.div
							className="space-y-6 sm:space-y-8"
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.5 }}
						>
							<div className="space-y-2 sm:space-y-6">
								<h1
									className="text-2xl sm:text-3xl lg:text-4xl font-normal tracking-normal leading-[1.3em] text-foreground relative"
									style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
								>
									<span className="invisible" aria-hidden="true">
										The Terminal for Coding Agents.
									</span>
									<span className="absolute inset-0">
										<TypewriterText
											text="The Terminal for Coding Agents."
											speed={40}
											delay={600}
										/>
									</span>
								</h1>
								<p className="text-sm sm:text-lg font-light text-muted-foreground max-w-[400px]">
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
						</motion.div>

						<motion.div
							className="relative w-full min-w-0"
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
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
