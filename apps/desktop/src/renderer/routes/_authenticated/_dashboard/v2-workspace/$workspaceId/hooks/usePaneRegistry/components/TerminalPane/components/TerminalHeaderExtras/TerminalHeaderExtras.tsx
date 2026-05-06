import type { RendererContext } from "@superset/panes";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { TerminalLogsButton } from "../TerminalLogsButton";

interface TerminalHeaderExtrasProps {
	context: RendererContext<PaneViewerData>;
}

export function TerminalHeaderExtras({ context }: TerminalHeaderExtrasProps) {
	if (context.pane.kind !== "terminal") return null;

	const data = context.pane.data as TerminalPaneData;

	return (
		<div className="flex items-center gap-0.5">
			<TerminalLogsButton
				terminalId={data.terminalId}
				terminalInstanceId={context.pane.id}
			/>
		</div>
	);
}
