"use client";

import { motion } from "framer-motion";
import { SelectorPill } from "./components/SelectorPill";
import { DEMO_VIDEOS, SELECTOR_OPTIONS } from "./constants";
import { useState } from "react";

export function ProductDemo() {
	const [activeOption, setActiveOption] = useState<string>(SELECTOR_OPTIONS[0]);

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
						<video
							src={DEMO_VIDEOS[option]}
							autoPlay
							loop
							muted
							playsInline
							className="w-full h-full object-contain rounded-lg border border-border"
						/>
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
