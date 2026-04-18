"use client";

import { ExternalIdePopup } from "./components/ExternalIdePopup";
import { LeftSidebar } from "./components/LeftSidebar";
import { MainPanel } from "./components/MainPanel";
import { RightSidebar } from "./components/RightSidebar";
import { WindowChrome } from "./components/WindowChrome";
import type { AppMockupProps } from "./types";

export type { ActiveDemo } from "./types";

export function AppMockup({ activeDemo = "Use Any Agents" }: AppMockupProps) {
	return (
		<div
			className="relative w-full min-w-[700px] overflow-hidden bg-black/60 shadow-[0_8px_60px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl"
			style={{ aspectRatio: "16/10" }}
		>
			<div
				className="pointer-events-none absolute inset-0 z-10"
				style={{
					background:
						"linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.02) 25%, rgba(255,255,255,0.02) 75%, rgba(255,255,255,0.15) 100%)",
					mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
					WebkitMask:
						"linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
					maskComposite: "exclude",
					WebkitMaskComposite: "xor",
					padding: "1.5px",
				}}
			/>

			<WindowChrome />

			<div className="flex h-[calc(100%-40px)]">
				<LeftSidebar activeDemo={activeDemo} />
				<MainPanel activeDemo={activeDemo} />
				<RightSidebar activeDemo={activeDemo} />
			</div>

			<ExternalIdePopup activeDemo={activeDemo} />
		</div>
	);
}
