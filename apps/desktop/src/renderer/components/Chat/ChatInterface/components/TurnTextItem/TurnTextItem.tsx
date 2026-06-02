import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import { BrainIcon, MessageSquareIcon } from "lucide-react";
import { StreamingMessageText } from "renderer/components/Chat/ChatInterface/components/MessagePartsRenderer/components/StreamingMessageText";

interface TurnTextItemProps {
	kind: "output" | "thinking";
	text: string;
	isStreaming?: boolean;
}

function toPreview(text: string, max = 90): string {
	const collapsed = text.replace(/\s+/g, " ").trim();
	return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

/**
 * Renders an intermediate assistant text output or a thinking block as an
 * agent-inspector-style collapsible item row (icon + label + preview + token
 * badge), reusing the shared `ToolCallRow` so it matches tool rows exactly.
 */
export function TurnTextItem({ kind, text, isStreaming }: TurnTextItemProps) {
	const isThinking = kind === "thinking";
	return (
		<ToolCallRow
			icon={isThinking ? BrainIcon : MessageSquareIcon}
			title={isThinking ? "Thinking" : "Output"}
			description={toPreview(text)}
		>
			{isThinking ? (
				<div className="whitespace-pre-wrap py-1 pl-3 text-muted-foreground text-xs">
					{text}
				</div>
			) : (
				<div className="py-1 pl-3">
					<StreamingMessageText
						text={text}
						isAnimating={Boolean(isStreaming)}
						mermaid={{ config: { theme: "default" } }}
					/>
				</div>
			)}
		</ToolCallRow>
	);
}
