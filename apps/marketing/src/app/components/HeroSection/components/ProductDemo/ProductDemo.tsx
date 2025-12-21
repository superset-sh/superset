"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";
import { SelectorPill } from "./components/SelectorPill";
import { DEMO_GIFS, SELECTOR_OPTIONS } from "./constants";

export function ProductDemo() {
	const [activeOption, setActiveOption] = useState<string>(SELECTOR_OPTIONS[0]);
	const [loadedGifs, setLoadedGifs] = useState<Set<string>>(
		new Set([SELECTOR_OPTIONS[0]]),
	);

	useEffect(() => {
		if (!loadedGifs.has(activeOption)) {
			setLoadedGifs((prev) => new Set([...prev, activeOption]));
		}
	}, [activeOption, loadedGifs]);

	return (
		<div className="relative w-full flex flex-col gap-3">
			<div
				className="relative w-full rounded-lg overflow-hidden"
				style={{ aspectRatio: "1812/1080" }}
			>
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
