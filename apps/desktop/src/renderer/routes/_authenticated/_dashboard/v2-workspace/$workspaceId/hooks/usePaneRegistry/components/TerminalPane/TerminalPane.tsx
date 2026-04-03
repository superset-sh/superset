import type { RendererContext } from "@superset/panes";
import "@xterm/xterm/css/xterm.css";
import type { PaneViewerData, TerminalPaneData } from "../../../../types";
import { useTerminalSession } from "./useTerminalSession";

interface TerminalPaneProps {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
}

export function TerminalPane({ ctx, workspaceId }: TerminalPaneProps) {
	const { terminalId } = ctx.pane.data as TerminalPaneData;
	const { sessionState, connectionState, errorMessage, containerRef, retry } =
		useTerminalSession(terminalId, workspaceId);

	return (
		<div className="flex h-full w-full flex-col">
			<div
				ref={containerRef}
				className="min-h-0 flex-1 overflow-hidden bg-[#14100f]"
			/>
			{sessionState === "error" && (
				<div className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
					<span>
						Failed to create session{errorMessage ? `: ${errorMessage}` : ""}
					</span>
					<button
						type="button"
						className="underline hover:text-foreground"
						onClick={retry}
					>
						Retry
					</button>
				</div>
			)}
			{sessionState === "ready" && connectionState === "closed" && (
				<div className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
					<span>Reconnecting…</span>
				</div>
			)}
		</div>
	);
}
