"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";

export function HeroSection() {
	return (
		<section className="relative min-h-[calc(100vh-64px)] flex items-center">
			<div className="w-full max-w-[1600px] mx-auto px-8 lg:px-[30px] py-16">
				<div className="grid grid-cols-1 lg:grid-cols-[42%_58%] gap-8 lg:gap-12 items-center">
					{/* Left column - Text content */}
					<motion.div
						className="space-y-8"
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5 }}
					>
						{/* Heading */}
						<div className="space-y-6">
							<h1 className="text-[36px] sm:text-[40px] lg:text-[45px] font-normal tracking-[-0.03em] leading-[1em] text-white">
								The intelligent
								<br />
								coding environment
							</h1>
							<p className="text-lg lg:text-xl tracking-[-0.03em] text-white/50 max-w-[400px]">
								From prompt to production, Superset is where developers build
								enduring software.
							</p>
						</div>

						<div className="flex flex-wrap items-center gap-4">
							<DownloadButton />
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
		</section>
	);
}

function DownloadButton() {
	return (
		<a
			href="https://github.com/superset-sh/superset/releases"
			className="group inline-flex items-center bg-[#f9f9f5] hover:bg-[#f0efeb] rounded-[5px] pl-4 pr-1 py-1 transition-colors"
		>
			<div className="flex items-center gap-1">
				<span className="text-base font-medium leading-4 text-[#2a2b25]">
					Download
				</span>
				<span className="text-base font-medium leading-4 text-[#2a2b25]">
					{" "}
					for Mac
				</span>
			</div>
			<div className="ml-2 rounded-sm p-1.5 transition-colors">
				<svg
					width="16"
					height="16"
					viewBox="0 0 16 16"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<title>Download</title>
					<path
						d="M15.125 9.844L15.125 14.51C15.125 14.833 14.864 15.094 14.542 15.094L1.708 15.094C1.386 15.094 1.125 14.833 1.125 14.51L1.125 9.844C1.125 9.522 1.386 9.26 1.708 9.26C2.03 9.26 2.292 9.522 2.292 9.844L2.292 13.927L13.958 13.927L13.958 9.844C13.958 9.522 14.22 9.26 14.542 9.26C14.864 9.26 15.125 9.522 15.125 9.844ZM7.712 10.256C7.822 10.366 7.97 10.428 8.125 10.428C8.28 10.428 8.428 10.366 8.538 10.256L11.454 7.34C11.682 7.112 11.682 6.742 11.454 6.514C11.226 6.286 10.857 6.286 10.629 6.514L8.708 8.436L8.708 1.677C8.708 1.355 8.447 1.094 8.125 1.094C7.803 1.094 7.542 1.355 7.542 1.677L7.542 8.436L5.621 6.514C5.393 6.286 5.024 6.286 4.796 6.514C4.568 6.742 4.568 7.112 4.796 7.34Z"
						fill="#2a2b25"
					/>
				</svg>
			</div>
		</a>
	);
}

const SELECTOR_OPTIONS = [
	"Build features",
	"Fix bugs",
	"Debug prod",
	"Customize Themes",
] as const;

const BACKGROUND_GRADIENTS: Record<string, string> = {
	"Build features": "from-amber-900/80 via-orange-950/70 to-amber-950/80",
	"Fix bugs": "from-rose-900/80 via-pink-950/70 to-rose-950/80",
	"Debug prod": "from-violet-900/80 via-purple-950/70 to-violet-950/80",
	"Customize Themes": "from-emerald-900/80 via-teal-950/70 to-emerald-950/80",
};

// Using customize.gif as placeholder for all screens until other GIFs are ready
const DEMO_GIFS: Record<string, string> = {
	"Build features": "/hero/customize-themes.gif",
	"Fix bugs": "/hero/customize-themes.gif",
	"Debug prod": "/hero/customize-themes.gif",
	"Customize Themes": "/hero/customize-themes.gif",
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
					className={`absolute inset-0 bg-gradient-to-br ${BACKGROUND_GRADIENTS[option]}`}
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

			{/* Selector pills at bottom */}
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
				inline-flex items-center justify-center py-2 rounded-[5px] text-sm whitespace-nowrap cursor-pointer
				${
					active
						? "bg-white/90 border border-white text-black/80"
						: "bg-white/[0.03] border border-white/20 text-white/80 hover:bg-white/10 hover:border-white/30"
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
