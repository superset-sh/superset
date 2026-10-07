import { Trans } from "@lingui/react/macro";
import { readBookkeeping } from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useRef } from "react";
import { parseAttachmentTags } from "../../../../utils/attachmentTags";
import { userMessageText } from "../../../../utils/userMessageText";
import { AttachmentImage } from "./components/AttachmentImage";
import { useFitsOneLine } from "./hooks/useFitsOneLine";

function BookkeepingRow({ label }: { label: string }) {
	return (
		<div className="flex min-w-0 items-center py-1 font-sans text-foreground/50 text-sm">
			<span className="min-w-0 truncate first-letter:uppercase">{label}</span>
		</div>
	);
}

export type PendingPrompt = {
	failed: boolean;
	onRetry: () => void;
	onDiscard: () => void;
};

export function UserMessageRow({
	harness,
	item,
	pending,
}: {
	item: UserMessage;
	/** Which harness spelled this turn; its reader decides what is bookkeeping. */
	harness: string | undefined;
	pending?: PendingPrompt | undefined;
}) {
	const raw = userMessageText(item);
	const note = readBookkeeping(harness, raw);
	const { text, attachments } = parseAttachmentTags(raw);
	const textRef = useRef<HTMLDivElement>(null);
	const oneLine = useFitsOneLine(textRef);
	if (note && !pending) return <BookkeepingRow label={note.label} />;

	const images = attachments.filter((attachment) =>
		attachment.type.startsWith("image/"),
	);
	const files = [
		...attachments
			.filter((attachment) => !attachment.type.startsWith("image/"))
			.map((attachment) => ({
				key: attachment.path,
				name: attachment.path.split("/").pop() ?? attachment.path,
			})),
		...item.content.flatMap((content) =>
			content.type === "attachment"
				? [{ key: content.attachmentId, name: content.name }]
				: [],
		),
	];
	return (
		<Message className="pt-1.5 pb-5 pl-10" from="user">
			{images.length > 0 && (
				<div
					className={cn(
						"ml-auto flex max-w-[min(100%,36rem)] flex-wrap justify-end gap-2 transition-opacity",
						pending && !pending.failed && "opacity-60",
					)}
				>
					{images.map((image) => (
						<AttachmentImage
							key={image.path}
							path={image.path}
							type={image.type}
						/>
					))}
				</div>
			)}
			{(text || files.length > 0) && (
				<MessageContent
					className={cn(
						"max-w-[min(100%,36rem)] font-sans transition-opacity group-[.is-user]:bg-foreground/10 group-[.is-user]:px-3 group-[.is-user]:py-2",
						oneLine && files.length === 0
							? "group-[.is-user]:rounded-full"
							: "group-[.is-user]:rounded-xl",
						pending && !pending.failed && "opacity-60",
					)}
				>
					<div
						className="whitespace-pre-wrap break-words text-sm"
						ref={textRef}
					>
						{text}
					</div>
					{files.length > 0 && (
						<div className="mt-1 flex flex-wrap gap-1">
							{files.map((file) => (
								<Badge key={file.key} variant="secondary">
									{file.name}
								</Badge>
							))}
						</div>
					)}
				</MessageContent>
			)}
			{pending?.failed && (
				<div className="flex items-center gap-2 self-end">
					<Badge variant="destructive">
						<Trans>Failed to send</Trans>
					</Badge>
					<Button onClick={pending.onRetry} size="sm" variant="ghost">
						<Trans>Retry</Trans>
					</Button>
					<Button onClick={pending.onDiscard} size="sm" variant="ghost">
						<Trans>Discard</Trans>
					</Button>
				</div>
			)}
		</Message>
	);
}
