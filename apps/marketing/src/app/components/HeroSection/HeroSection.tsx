"use client";

import { COMPANY } from "@superset/shared/constants";
import { motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";
import { TypewriterText } from "./components/TypewriterText";

export function HeroSection() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<div>
			<div className="flex mt-14 min-h-[calc(100vh-64px)] items-center overflow-hidden">
				{/* Grid background */}
				<motion.div
					className="absolute inset-0 pointer-events-none z-0"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.8, ease: "easeOut" }}
					aria-hidden="true"
				>
					<svg
						className="absolute inset-0 w-full h-full"
						xmlns="http://www.w3.org/2000/svg"
					>
						<title>grid</title>
						<defs>
							<pattern
								id="hero-grid"
								width="60"
								height="60"
								patternUnits="userSpaceOnUse"
							>
								<path
									d="M 60 0 L 0 0 0 60"
									fill="none"
									stroke="rgba(255,255,255,0.06)"
									strokeWidth="1"
								/>
							</pattern>
							<radialGradient id="grid-fade" cx="50%" cy="50%" r="50%">
								<stop offset="0%" stopColor="white" stopOpacity="1" />
								<stop offset="75%" stopColor="white" stopOpacity="0.95" />
								<stop offset="85%" stopColor="white" stopOpacity="0.7" />
								<stop offset="92%" stopColor="white" stopOpacity="0.3" />
								<stop offset="96%" stopColor="white" stopOpacity="0.1" />
								<stop offset="100%" stopColor="white" stopOpacity="0" />
							</radialGradient>
							<mask id="grid-mask">
								<rect width="100%" height="100%" fill="url(#grid-fade)" />
							</mask>
						</defs>
						<rect
							width="100%"
							height="100%"
							fill="url(#hero-grid)"
							mask="url(#grid-mask)"
						/>
					</svg>
				</motion.div>

				<div className="relative w-full max-w-[1600px] mx-auto px-8 lg:px-[30px] py-16">
					<div className="grid grid-cols-1 lg:grid-cols-[42%_58%] gap-12 lg:gap-16 items-center">
						{/* Left column - Text content */}
						<motion.div
							className="space-y-8"
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.5 }}
						>
							{/* Heading */}
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
									Run agents like Claude Code, Codex, etc. in parallel on your
									machine.
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

						{/* Right column - Product Demo */}
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

const SELECTOR_OPTIONS = [
	"Use Any Agents",
	"Create Parallel Branches",
	"See Changes",
] as const;

const DEMO_GIFS: Record<string, string> = {
	"Use Any Agents": "/hero/use-agents.gif",
	"Create Parallel Branches": "/hero/open-worktrees.gif",
	"See Changes": "/hero/see-changes.gif",
};

function ProductDemo() {
	const [activeOption, setActiveOption] = useState<string>(SELECTOR_OPTIONS[0]);
	const [loadedGifs, setLoadedGifs] = useState<Set<string>>(
		new Set([SELECTOR_OPTIONS[0]]),
	);

	// Lazy load GIFs when they become active
	useEffect(() => {
		if (!loadedGifs.has(activeOption)) {
			setLoadedGifs((prev) => new Set([...prev, activeOption]));
		}
	}, [activeOption, loadedGifs]);

	return (
		<div className="relative w-full flex flex-col gap-3">
			{/* Image container with border */}
			<div
				className="relative w-full rounded-lg overflow-hidden"
				style={{ aspectRatio: "1812/1080" }}
			>
				{/* GIF layers - lazy loaded, full width with preserved aspect ratio */}
				{SELECTOR_OPTIONS.map((option) => (
					<motion.div
						key={option}
						className="absolute inset-0"
						initial={false}
						animate={{ opacity: activeOption === option ? 1 : 0 }}
						transition={{ duration: 0.5, ease: "easeInOut" }}
					>
						{loadedGifs.has(option) && DEMO_GIFS[option] && (
							<Image
								src={DEMO_GIFS[option]}
								alt={option}
								fill
								className="object-contain rounded-lg border border-border"
								unoptimized
								priority={option === SELECTOR_OPTIONS[0]}
							/>
						)}
					</motion.div>
				))}
			</div>

			{/* Selector pills - outside the image */}
			<div className="flex items-center gap-2 overflow-x-auto">
				{SELECTOR_OPTIONS.map((option) => (
					<SelectorPill
						key={option}
						label={option}
						active={activeOption === option}
						onClick={() => setActiveOption(option)}
					/>
				))}
			</div>
		</div>
	);
}

interface SelectorPillProps {
	label: string;
	active?: boolean;
	onClick?: () => void;
}

function SelectorPill({ label, active = false, onClick }: SelectorPillProps) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			className={`
				inline-flex items-center justify-center py-2 text-sm whitespace-nowrap cursor-pointer
				${
					active
						? "bg-foreground/90 border border-foreground text-background/80"
						: "bg-foreground/5 border border-foreground/20 text-foreground/80 hover:bg-foreground/10 hover:border-foreground/30"
				}
			`}
			animate={{
				paddingLeft: active ? 22 : 16,
				paddingRight: active ? 22 : 16,
			}}
			transition={{ duration: 0.2, ease: "easeOut" }}
		>
			{label}
		</motion.button>
	);
}
