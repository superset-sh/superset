import { Trans } from "@lingui/react/macro";
import type { Item, UserMessage } from "@superset/chat/protocol";
import {
	Message,
	MessageActions,
	MessageContent,
} from "@superset/ui/ai-elements/message";
import { Badge } from "@superset/ui/badge";
import { MessagePinAction } from "../MessagePinAction";

export function UserMessageRow({
	isPinned,
	item,
	onTogglePin,
}: {
	item: UserMessage;
	isPinned: boolean;
	onTogglePin: (item: Item) => void;
}) {
	const text = item.content
		.filter((content) => content.type === "text")
		.map((content) => content.text)
		.join("\n");
	const attachments = item.content.filter(
		(content) => content.type === "attachment",
	);
	return (
		<Message from="user">
			<MessageContent>
				<div className="whitespace-pre-wrap break-words text-sm">{text}</div>
				{attachments.length > 0 && (
					<div className="mt-1 flex flex-wrap gap-1">
						{attachments.map((attachment) => (
							<Badge key={attachment.attachmentId} variant="secondary">
								{attachment.name}
							</Badge>
						))}
					</div>
				)}
				{item.queued && (
					<Badge className="mt-1 w-fit" variant="outline">
						<Trans>Queued</Trans>
					</Badge>
				)}
			</MessageContent>
			<MessageActions
				className={`mr-1 h-7 self-end transition-opacity ${
					isPinned
						? "opacity-100"
						: "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
				}`}
			>
				<MessagePinAction
					isPinned={isPinned}
					onToggle={() => onTogglePin(item)}
				/>
			</MessageActions>
		</Message>
	);
}
