import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { useSettings } from "renderer/stores/settings";

export function TerminalReadingColumn({ children }: { children: ReactNode }) {
	const readingWidth = useSettings((state) => state.terminalReadingWidth);

	return (
		<div
			className={cn(
				"relative mx-auto min-h-0 w-full flex-1 overflow-hidden",
				readingWidth && "max-w-3xl",
			)}
		>
			{children}
		</div>
	);
}
