import type { SessionSnapshot } from "@superset/chat/core";
import { displayText } from "@superset/chat/core";
import type { Reasoning as ReasoningItem } from "@superset/chat/protocol";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@superset/ui/ai-elements/reasoning";

export function ReasoningRow({
	item,
	snapshot,
}: {
	item: ReasoningItem;
	snapshot: SessionSnapshot;
}) {
	const text = displayText(snapshot, item.id);
	return (
		<Reasoning isStreaming={item.completedAtMs === undefined}>
			<ReasoningTrigger />
			<ReasoningContent>{text}</ReasoningContent>
		</Reasoning>
	);
}
