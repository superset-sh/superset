"use client";

import { useIsMobile } from "@superset/ui/hooks/use-mobile";
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
	const isMobile = useIsMobile();

	// Starts full size, shrinks as user scrolls down (less aggressive on mobile)
	const scale = useTransform(
		scrollYProgress,
		[0, 1],
		[1, isMobile ? 0.95 : 0.82],
	);
	// Pills shift up to follow the shrinking mockup (reduced on mobile)
	const pillsY = useTransform(
		scrollYProgress,
		[0, 1],
		[0, isMobile ? -15 : -40],
	);
	// Fade overlays start visible, disappear as user scrolls
	const overlayOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

	return (
		<div className="relative w-full max-w-full">
			{/* Mockup with scroll-driven scale */}
			<motion.div
				className="relative"
				style={{ scale, willChange: "transform" }}
			>
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

			{/* Selector pills - below mockup, shift up as mockup scales */}
			<motion.div
				className="flex items-center justify-center gap-2 -mt-2 sm:-mt-4 overflow-x-auto pb-1 scrollbar-hide"
				style={{ y: pillsY, willChange: "transform" }}
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
		</div>
	);
}
