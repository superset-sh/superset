import { Trans } from "@lingui/react/macro";
import type { UserMessage } from "@superset/chat/protocol";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { Badge } from "@superset/ui/badge";

export function UserMessageRow({ item }: { item: UserMessage }) {
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
		</Message>
	);
}
