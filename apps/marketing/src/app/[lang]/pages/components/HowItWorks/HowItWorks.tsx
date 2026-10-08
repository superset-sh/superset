"use client";

import { useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { LOOP_STEPS } from "../../constants";
import { StepList } from "./components/StepList";
import { StepStage } from "./components/StepStage";
import { STEP_DURATION_MS } from "./constants";

export function HowItWorks() {
	const ref = useRef<HTMLDivElement>(null);
	const inView = useInView(ref, { amount: 0.4 });
	const reducedMotion = useReducedMotion();
	const [active, setActive] = useState(0);
	const [pinned, setPinned] = useState(false);
	const [hovering, setHovering] = useState(false);
	const autoplay = inView && !pinned && !hovering && !reducedMotion;

	useEffect(() => {
		if (!autoplay) return;
		const timer = setInterval(
			() => setActive((index) => (index + 1) % LOOP_STEPS.length),
			STEP_DURATION_MS,
		);
		return () => clearInterval(timer);
	}, [autoplay]);

	const select = (index: number) => {
		setActive(index);
		setPinned(true);
	};

	return (
		<div
			ref={ref}
			className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-0"
		>
			<StepList
				steps={LOOP_STEPS}
				active={active}
				autoplay={autoplay}
				onSelect={select}
				onPreview={setActive}
				onHoverChange={setHovering}
			/>
			<StepStage step={LOOP_STEPS[active]?.id ?? "create"} />
		</div>
	);
}
