"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useEffect, useState } from "react";
import { type ActiveDemo, AppMockup } from "../AppMockup";
import { SelectorPill } from "./components/SelectorPill";
import { DEMO_OPTIONS } from "./constants";

// Scroll range (px) over which the demo docks and the selector opens
const DOCK_START = 20;
const DOCK_END = 280;
// w-54 radio list + 24px gutter to the mockup
const SELECTOR_WIDTH = 240;
// Undocked hero state: larger than the container and pushed down
const HERO_SCALE = 1.08;
const HERO_Y = 56;

export function ProductDemo() {
	const [activeOption, setActiveOption] =
		useState<ActiveDemo>("Use Any Agents");
	const [isDesktop, setIsDesktop] = useState(false);

	useEffect(() => {
		const mq = window.matchMedia("(min-width: 1024px)");
		const update = () => setIsDesktop(mq.matches);
		update();
		mq.addEventListener("change", update);
		return () => mq.removeEventListener("change", update);
	}, []);

	// Scroll-scrubbed progress, tied 1:1 to scroll so it never drifts
	const { scrollY } = useScroll();
	const progress = useTransform(scrollY, [DOCK_START, DOCK_END], [0, 1]);

	const selectorWidth = useTransform(progress, [0, 1], [0, SELECTOR_WIDTH]);
	const selectorOpacity = useTransform(progress, [0.4, 1], [0, 1]);
	const mockupScale = useTransform(progress, [0, 1], [HERO_SCALE, 1]);
	const mockupY = useTransform(progress, [0, 1], [HERO_Y, 0]);

	const options = DEMO_OPTIONS.map((option) => (
		<SelectorPill
			key={option.label}
			label={option.label}
			active={activeOption === option.label}
			onSelect={() => setActiveOption(option.label as ActiveDemo)}
		/>
	));

	return (
		<div className="relative w-full max-w-full flex flex-col gap-4 lg:flex-row lg:gap-0">
			{/* Mobile/tablet: static horizontal strip */}
			<div className="flex items-center gap-2 px-4 overflow-x-auto scrollbar-hide sm:px-0 lg:hidden">
				{options}
			</div>

			{/* Desktop: vertical radio column, opened by scroll */}
			<motion.div
				className="hidden lg:flex flex-col justify-center shrink-0 overflow-hidden"
				style={{ width: selectorWidth, opacity: selectorOpacity }}
			>
				<div className="w-60 pr-6 flex flex-col gap-1">{options}</div>
			</motion.div>

			{/* Mockup: oversized, lower hero state that docks as you scroll */}
			<div className="relative flex-1 min-w-0">
				<motion.div
					className="relative"
					style={
						isDesktop
							? {
									scale: mockupScale,
									y: mockupY,
									transformOrigin: "100% 100%",
								}
							: undefined
					}
				>
					{/* Large diffuse back-shadow */}
					<div className="absolute inset-x-[15%] top-[30%] bottom-0 rounded-3xl bg-white/[0.04] blur-[80px] pointer-events-none" />
					<div className="relative overflow-x-auto scrollbar-hide">
						<AppMockup activeDemo={activeOption} />
					</div>
				</motion.div>
			</div>
		</div>
	);
}
