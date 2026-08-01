"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalIdePopup } from "./components/ExternalIdePopup";
import { LeftSidebar } from "./components/LeftSidebar";
import { MainPanel } from "./components/MainPanel";
import { RightSidebar } from "./components/RightSidebar";
import { TabBar } from "./components/TabBar";
import type { AppMockupProps } from "./types";

export type { ActiveDemo } from "./types";

// The mockup is laid out at a fixed app-window size and scaled to fit its
// container, so type and chrome stay proportional like a real screenshot
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 800;

export function AppMockup({ activeDemo = "Use Any Agents" }: AppMockupProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(0.72);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const observer = new ResizeObserver(() => {
			setScale(el.clientWidth / DESIGN_WIDTH);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return (
		<div
			ref={containerRef}
			className="relative w-full min-w-[700px] overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_1px_rgba(0,0,0,0.4),0_16px_40px_-12px_rgba(0,0,0,0.6),0_32px_90px_-24px_rgba(0,0,0,0.75)]"
			style={{ aspectRatio: "16/10" }}
		>
			<div className="pointer-events-none absolute inset-0 z-20 rounded-xl ring-1 ring-inset ring-white/[0.06]" />

			<div
				className="absolute left-0 top-0 origin-top-left"
				style={{
					width: DESIGN_WIDTH,
					height: DESIGN_HEIGHT,
					transform: `scale(${scale})`,
				}}
			>
				<div className="flex h-full">
					<LeftSidebar activeDemo={activeDemo} />
					<div className="flex min-w-0 flex-1 flex-col">
						<TabBar activeDemo={activeDemo} />
						<MainPanel activeDemo={activeDemo} />
					</div>
					<RightSidebar activeDemo={activeDemo} />
				</div>

				<ExternalIdePopup activeDemo={activeDemo} />
			</div>
		</div>
	);
}
