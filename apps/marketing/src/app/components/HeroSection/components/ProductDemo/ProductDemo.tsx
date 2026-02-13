"use client";

import { type MotionValue, motion, useTransform } from "framer-motion";
import { useState } from "react";
import { type ActiveDemo, AppMockup } from "../AppMockup";
import { SelectorPill } from "./components/SelectorPill";
import { DEMO_OPTIONS } from "./constants";

interface ProductDemoProps {
	scrollYProgress: MotionValue<number>;
}

export function ProductDemo({ scrollYProgress }: ProductDemoProps) {
	const [activeOption, setActiveOption] =
		useState<ActiveDemo>("Use Any Agents");

	// Starts full size, shrinks as user scrolls down
	const scale = useTransform(scrollYProgress, [0, 1], [1, 0.82]);
	// Pills shift down to follow the shrinking mockup (without scaling)
	const pillsY = useTransform(scrollYProgress, [0, 1], [0, 80]);
	// Fade overlays start visible, disappear as user scrolls
	const overlayOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

	return (
		<div className="relative w-full max-w-full">
			{/* Selector pills - move down but don't scale */}
			<motion.div
				className="flex items-center justify-center gap-2 mb-4 sm:mb-6 overflow-x-auto pb-1 scrollbar-hide"
				style={{ y: pillsY }}
			>
				{DEMO_OPTIONS.map((option) => (
					<SelectorPill
						key={option.label}
						label={option.label}
						active={activeOption === option.label}
						onSelect={() => setActiveOption(option.label as ActiveDemo)}
					/>
				))}
			</motion.div>

			{/* Mockup with scroll-driven scale */}
			<motion.div className="relative" style={{ scale }}>
				<div className="relative">
					{/* Large diffuse back-shadow */}
					<div className="absolute inset-[10%] top-[20%] rounded-3xl bg-white/[0.07] blur-[60px] pointer-events-none" />
					<div className="relative overflow-x-auto scrollbar-hide">
						<AppMockup activeDemo={activeOption} />
					</div>
				</div>

				{/* Gradient fade overlays - dissolve away as you scroll down */}
				<motion.div
					className="pointer-events-none"
					style={{ opacity: overlayOpacity }}
				>
					{/* Bottom gradient fade */}
					<div className="absolute bottom-0 left-0 right-0 h-24 sm:h-32 bg-gradient-to-t from-background to-transparent" />
					{/* Left edge gradient fade */}
					<div className="absolute top-0 bottom-0 left-0 w-12 sm:w-20 bg-gradient-to-r from-background to-transparent" />
					{/* Right edge gradient fade */}
					<div className="absolute top-0 bottom-0 right-0 w-12 sm:w-20 bg-gradient-to-l from-background to-transparent" />
				</motion.div>
			</motion.div>
		</div>
	);
}
