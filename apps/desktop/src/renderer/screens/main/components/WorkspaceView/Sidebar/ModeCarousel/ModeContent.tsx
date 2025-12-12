import type { ReactNode } from "react";
import type { SidebarMode } from "./types";

interface ModeContentProps {
	mode: SidebarMode;
	isActive: boolean;
	children: ReactNode;
}

export function ModeContent({ children }: ModeContentProps) {
	return (
		<div
			className="overflow-y-auto flex flex-col h-full"
			style={{
				scrollSnapAlign: "start",
				scrollSnapStop: "always",
			}}
		>
			<div className="px-1 flex-1 min-h-0">{children}</div>
		</div>
	);
}
