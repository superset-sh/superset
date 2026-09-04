"use client";

import { useEffect, useRef, useState } from "react";
import { AppMockup } from "@/app/[lang]/components/HeroSection/components/AppMockup";

// AppMockup floors its own width at 700px so its internal 1280px design never
// scales below legibility on the hero. A card band is far narrower, so render it
// at that floor and scale the whole box down to fit.
const MOCKUP_WIDTH = 700;

export function DesktopMock() {
	const bandRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(0);

	useEffect(() => {
		const band = bandRef.current;
		if (!band) return;
		const observer = new ResizeObserver(() => {
			setScale(band.clientWidth / MOCKUP_WIDTH);
		});
		observer.observe(band);
		return () => observer.disconnect();
	}, []);

	return (
		<div
			ref={bandRef}
			aria-hidden="true"
			className="pointer-events-none h-full w-full select-none overflow-hidden [&_.rounded-xl]:rounded-none"
		>
			<div
				className="origin-top-left"
				style={{
					width: MOCKUP_WIDTH,
					// Held hidden until measured so it can't flash at full width
					transform: `scale(${scale})`,
					visibility: scale === 0 ? "hidden" : "visible",
				}}
			>
				<AppMockup activeDemo="Orchestrate Parallel Agents" />
			</div>
		</div>
	);
}
