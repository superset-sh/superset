"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { GITHUB_REPO_URL } from "@/constants";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";

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
					<div className="grid grid-cols-1 lg:grid-cols-[42%_58%] gap-8 lg:gap-12 items-center">
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
									className="text-2xl sm:text-3xl lg:text-4xl font-normal tracking-normal leading-[1.3em] text-stone-100"
									style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
								>
									The terminal app for parallel cli agents.
								</h1>
								<p className="text-md sm:text-lg font-light text-neutral-400 max-w-[400px]">
									Run dozens of Claude Code, Codex, or any other cli agents you
									love.
								</p>
							</div>

							<div className="flex flex-wrap items-center sm:gap-4 gap-2">
								<DownloadButton
									onJoinWaitlist={() => setIsWaitlistOpen(true)}
								/>
								<button
									type="button"
									className="px-6 py-3 text-base font-normal bg-neutral-900 border border-neutral-800 text-neutral-100 hover:bg-neutral-950 transition-colors flex items-center gap-2"
									onClick={() => window.open(GITHUB_REPO_URL, "_blank")}
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
	"Use Agents",
	"Manage Terminals",
	"Open Worktrees",
	"Customize Themes",
] as const;

const BACKGROUND_GRADIENTS: Record<string, string> = {
	"Use Agents": "from-rose-900/80 via-pink-950/70 to-rose-950/80",
	"Manage Terminals": "from-amber-900/80 via-yellow-950/70 to-orange-950/80",
	"Open Worktrees": "from-blue-900/80 via-blue-950/70 to-blue-950/80",
	"Customize Themes": "from-emerald-900/80 via-teal-950/70 to-emerald-950/80",
};

const DEMO_GIFS: Record<string, string> = {
	"Use Agents": "/hero/use-agents.gif",
	"Manage Terminals": "/hero/manage-terminals.gif",
	"Open Worktrees": "/hero/open-worktrees.gif",
	"Customize Themes": "/hero/change-themes.gif",
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
		<div
			className="relative w-full rounded-lg overflow-hidden"
			style={{ aspectRatio: "710/500" }}
		>
			{/* Background layers - all rendered, opacity controlled by active state */}
			{SELECTOR_OPTIONS.map((option) => (
				<motion.div
					key={option}
					className={`absolute inset-0 bg-linear-to-br ${BACKGROUND_GRADIENTS[option]}`}
					initial={false}
					animate={{ opacity: activeOption === option ? 1 : 0 }}
					transition={{ duration: 0.5, ease: "easeInOut" }}
				/>
			))}

			{/* GIF layers - lazy loaded, centered with preserved aspect ratio */}
			{SELECTOR_OPTIONS.map((option) => (
				<motion.div
					key={option}
					className="absolute inset-6 bottom-16 flex items-center justify-center"
					initial={false}
					animate={{ opacity: activeOption === option ? 1 : 0 }}
					transition={{ duration: 0.5, ease: "easeInOut" }}
				>
					{loadedGifs.has(option) && DEMO_GIFS[option] && (
						<div
							className="relative w-full h-full max-w-[90%] max-h-[90%]"
							style={{ aspectRatio: "1812/1080" }}
						>
							<Image
								src={DEMO_GIFS[option]}
								alt={option}
								fill
								className="object-contain"
								unoptimized
								priority={option === SELECTOR_OPTIONS[0]}
							/>
						</div>
					)}
				</motion.div>
			))}

			<div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 overflow-x-auto pb-1">
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
						? "bg-white/90 border border-white text-black/80"
						: "bg-white/3 border border-white/20 text-white/80 hover:bg-white/10 hover:border-white/30"
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
