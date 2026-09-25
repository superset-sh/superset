import type { RendererContext } from "@superset/panes";
import { CommentBody } from "renderer/components/CommentBody";
import type { CommentPaneData, PaneViewerData } from "../../../../types";

interface CommentPaneProps {
	context: RendererContext<PaneViewerData>;
}
export function CommentPane({ context }: CommentPaneProps) {
	const data = context.pane.data as CommentPaneData;
	return (
		<div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-5">
			<CommentBody body={data.body} />
		</div>
	);
}
