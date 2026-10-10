"use client";

import { useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { STEPS } from "../../constants";
import { StepList } from "./components/StepList";
import { StepStage } from "./components/StepStage";
import { STEP_DURATION_MS } from "./constants";

export function HowItWorks() {
	const ref = useRef<HTMLDivElement>(null);
	const inView = useInView(ref, { amount: 0.4 });
	const reducedMotion = useReducedMotion();
	const [active, setActive] = useState(0);
	const [pinned, setPinned] = useState(false);
	const [preview, setPreview] = useState<number | null>(null);
	const [focused, setFocused] = useState(false);
	const autoplay =
		inView && !pinned && preview === null && !focused && !reducedMotion;
	const shown = preview ?? active;

	useEffect(() => {
		if (!autoplay) return;
		const timer = setInterval(
			() => setActive((index) => (index + 1) % STEPS.length),
			STEP_DURATION_MS,
		);
		return () => clearInterval(timer);
	}, [autoplay]);

	const select = (index: number) => {
		setActive(index);
		setPreview(null);
		setPinned(true);
	};

	return (
		<div
			ref={ref}
			className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-0"
		>
			<StepList
				steps={STEPS}
				active={shown}
				autoplay={autoplay}
				onSelect={select}
				onPreview={setPreview}
				onFocusChange={setFocused}
			/>
			<StepStage step={STEPS[shown]?.id ?? "install"} />
		</div>
	);
}
