import type { ReactNode } from "react";
import { ModeHeader } from "./ModeHeader";
import type { SidebarMode } from "./types";

interface ModeContentProps {
	mode: SidebarMode;
	isActive: boolean;
	children: ReactNode;
}

export function ModeContent({ mode, children }: ModeContentProps) {
	return (
		<div
			className="overflow-y-auto h-full"
			style={{
				scrollSnapAlign: "start",
				scrollSnapStop: "always",
			}}
		>
			<ModeHeader mode={mode} />
			<div className="px-1">{children}</div>
		</div>
	);
}
