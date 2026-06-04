import type { RendererContext } from "@superset/panes";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { TerminalCopySessionIdButton } from "../TerminalCopySessionIdButton";
import { TerminalRemoteControlButton } from "../TerminalRemoteControlButton";

interface TerminalHeaderExtrasProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
}

export function TerminalHeaderExtras({
	context,
	workspaceId,
}: TerminalHeaderExtrasProps) {
	if (context.pane.kind !== "terminal") return null;

	const data = context.pane.data as TerminalPaneData;

	return (
		<div className="flex items-center gap-0.5">
			<TerminalCopySessionIdButton terminalId={data.terminalId} />
			<TerminalRemoteControlButton
				workspaceId={workspaceId}
				terminalId={data.terminalId}
			/>
		</div>
	);
}
