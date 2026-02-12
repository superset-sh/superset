"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { type ActiveDemo, AppMockup } from "../AppMockup";
import { SelectorPill } from "./components/SelectorPill";
import { DEMO_OPTIONS } from "./constants";

export function ProductDemo() {
	const [activeOption, setActiveOption] =
		useState<ActiveDemo>("Use Any Agents");

	return (
		<motion.div
			className="relative w-full max-w-full"
			initial={{ opacity: 0, y: 24 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
		>
			{/* Selector pills - centered above mockup */}
			<div className="flex items-center justify-center gap-2 mb-4 sm:mb-6 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
				{DEMO_OPTIONS.map((option) => (
					<SelectorPill
						key={option.label}
						label={option.label}
						active={activeOption === option.label}
						onSelect={() => setActiveOption(option.label as ActiveDemo)}
					/>
				))}
			</div>

			{/* Mockup with fade overlays */}
			<div className="relative">
				{/* App mockup - horizontally scrollable on mobile */}
				<div className="overflow-x-auto scrollbar-hide">
					<AppMockup activeDemo={activeOption} />
				</div>

				{/* Bottom gradient fade */}
				<div className="absolute bottom-0 left-0 right-0 h-24 sm:h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />

				{/* Left edge gradient fade */}
				<div className="absolute top-0 bottom-0 left-0 w-12 sm:w-20 bg-gradient-to-r from-background to-transparent pointer-events-none" />

				{/* Right edge gradient fade */}
				<div className="absolute top-0 bottom-0 right-0 w-12 sm:w-20 bg-gradient-to-l from-background to-transparent pointer-events-none" />
			</div>
		</motion.div>
	);
}
