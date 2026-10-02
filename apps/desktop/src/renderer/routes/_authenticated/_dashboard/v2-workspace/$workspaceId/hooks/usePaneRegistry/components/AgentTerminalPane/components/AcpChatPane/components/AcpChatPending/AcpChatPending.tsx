import { Spinner } from "@superset/ui/spinner";
import type { ReactNode } from "react";

/** The pane is doing something that takes a moment; an empty pane reads broken. */
export function AcpChatPending({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-3">
			<Spinner className="size-5" />
			<span className="text-muted-foreground text-xs">{children}</span>
		</div>
	);
}
