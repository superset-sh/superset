import type { SessionSnapshot } from "@superset/chat/core";
import { displayText } from "@superset/chat/core";
import type { AgentMessage } from "@superset/chat/protocol";
import { MarkdownView } from "../../../MarkdownView";

export function AgentMessageRow({
	item,
	snapshot,
}: {
	item: AgentMessage;
	snapshot: SessionSnapshot;
}) {
	return <MarkdownView text={displayText(snapshot, item.id)} />;
}
