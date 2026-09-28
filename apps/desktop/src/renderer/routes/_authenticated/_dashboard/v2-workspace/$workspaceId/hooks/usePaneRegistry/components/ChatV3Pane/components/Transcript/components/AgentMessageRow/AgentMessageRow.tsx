import type { SessionSnapshot } from "@superset/chat/core";
import { displayText } from "@superset/chat/core";
import type { AgentMessage, Item } from "@superset/chat/protocol";
import { MarkdownView } from "../../../MarkdownView";
import { MessagePinAction } from "../MessagePinAction";

export function AgentMessageRow({
	isPinned,
	item,
	onTogglePin,
	snapshot,
}: {
	item: AgentMessage;
	snapshot: SessionSnapshot;
	isPinned: boolean;
	onTogglePin: (item: Item) => void;
}) {
	return (
		<div className="group/message">
			<MarkdownView text={displayText(snapshot, item.id)} />
			<div
				className={`mt-1 flex h-7 items-center transition-opacity ${
					isPinned
						? "opacity-100"
						: "opacity-0 group-hover/message:opacity-100 group-focus-within/message:opacity-100"
				}`}
			>
				<MessagePinAction
					isPinned={isPinned}
					onToggle={() => onTogglePin(item)}
				/>
			</div>
		</div>
	);
}
