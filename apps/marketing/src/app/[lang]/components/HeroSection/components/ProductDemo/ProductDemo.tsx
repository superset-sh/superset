"use client";

import { useLingui } from "@lingui/react/macro";
import { m, useScroll, useTransform } from "framer-motion";
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
// The 8% hero oversize needs enough viewport gutter to remain fully visible.
// Between the lg layout switch and this width, keep the mockup fitted instead.
const HERO_EXPANSION_MEDIA_QUERY = "(min-width: 1440px)";

export function ProductDemo() {
	const [activeOption, setActiveOption] = useState<ActiveDemo>(
		"Orchestrate Parallel Agents",
	);
	const [hasHeroExpansionRoom, setHasHeroExpansionRoom] = useState(false);
	const { t } = useLingui();

	useEffect(() => {
		const mq = window.matchMedia(HERO_EXPANSION_MEDIA_QUERY);
		const update = () => setHasHeroExpansionRoom(mq.matches);
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
			key={option.id}
			label={t(option.label)}
			active={activeOption === option.id}
			onSelect={() => setActiveOption(option.id)}
		/>
	));

	return (
		<div className="relative w-full max-w-full flex flex-col gap-4 lg:flex-row lg:gap-0">
			{/* Mobile/tablet: static horizontal strip */}
			<div className="flex items-center gap-2 px-4 overflow-x-auto scrollbar-hide sm:px-0 lg:hidden">
				{options}
			</div>

			{/* Desktop: vertical radio column, opened by scroll */}
			<m.div
				className="hidden lg:flex flex-col justify-center shrink-0 overflow-hidden"
				style={{ width: selectorWidth, opacity: selectorOpacity }}
			>
				<div className="w-60 pr-6 flex flex-col gap-1">{options}</div>
			</m.div>

			{/* Mockup: oversized, lower hero state that docks as you scroll */}
			<div className="relative flex-1 min-w-0">
				<m.div
					className="relative"
					style={{
						// Keep these style keys mounted so Framer Motion can attach the
						// scroll-linked values when the media query changes after hydration.
						scale: hasHeroExpansionRoom ? mockupScale : 1,
						y: hasHeroExpansionRoom ? mockupY : 0,
						transformOrigin: "100% 100%",
					}}
				>
					{/* Stage lighting: soft ember-tinted glow behind the top of the
					    window, falling off to the page black at the edges */}
					<div
						className="pointer-events-none absolute -inset-x-[25%] -top-[30%] bottom-0"
						style={{
							background:
								"radial-gradient(ellipse 42% 38% at 50% 22%, rgba(232,128,74,0.06), rgba(232,128,74,0.02) 55%, transparent 78%)",
						}}
					/>
					<div className="relative overflow-x-auto scrollbar-hide max-md:[mask-image:linear-gradient(to_right,black_88%,transparent)]">
						<AppMockup activeDemo={activeOption} />
					</div>
				</m.div>
			</div>
		</div>
	);
}
