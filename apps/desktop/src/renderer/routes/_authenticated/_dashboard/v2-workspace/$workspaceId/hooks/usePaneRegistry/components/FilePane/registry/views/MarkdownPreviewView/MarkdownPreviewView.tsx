import { TipTapMarkdownRenderer } from "renderer/components/MarkdownRenderer/components/TipTapMarkdownRenderer";
import type { ViewProps } from "../../types";

export function MarkdownPreviewView({ document }: ViewProps) {
	if (document.content.kind !== "text") {
		return null;
	}

	return (
		<div className="h-full overflow-auto p-4">
			<TipTapMarkdownRenderer value={document.content.value} />
		</div>
	);
}
