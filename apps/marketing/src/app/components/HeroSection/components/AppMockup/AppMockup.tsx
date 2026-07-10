"use client";

import { ExternalIdePopup } from "./components/ExternalIdePopup";
import { LeftSidebar } from "./components/LeftSidebar";
import { MainPanel } from "./components/MainPanel";
import { RightSidebar } from "./components/RightSidebar";
import { TabBar } from "./components/TabBar";
import type { AppMockupProps } from "./types";

export type { ActiveDemo } from "./types";

export function AppMockup({ activeDemo = "Use Any Agents" }: AppMockupProps) {
	return (
		<div
			className="relative w-full min-w-[700px] overflow-hidden rounded-md border border-border bg-background shadow-[0_30px_80px_-24px_rgba(0,0,0,0.7)]"
			style={{ aspectRatio: "16/10" }}
		>
			<div className="pointer-events-none absolute inset-0 z-20 rounded-md ring-1 ring-inset ring-white/[0.04]" />

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
	);
}
