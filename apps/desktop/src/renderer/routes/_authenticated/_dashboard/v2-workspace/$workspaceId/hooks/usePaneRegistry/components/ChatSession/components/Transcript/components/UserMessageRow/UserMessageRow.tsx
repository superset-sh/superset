import { Trans } from "@lingui/react/macro";
import { readBookkeeping, userMessageText } from "@superset/chat/core";
import type { AvailableCommand, UserMessage } from "@superset/chat/protocol";
import { Chip } from "@superset/chat-ui/Chip";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useRef } from "react";
import { parseAttachmentTags } from "../../../../utils/attachmentTags";
import { commandChip, LEADING_COMMAND } from "../../../../utils/commandChip";
import {
	type MessageSegment,
	splitByElements,
} from "../../../../utils/messageElements";
import { AttachmentImage } from "./components/AttachmentImage";
import { useFitsOneLine } from "./hooks/useFitsOneLine";

function BookkeepingRow({ label }: { label: string }) {
	return (
		<div className="flex min-w-0 items-center py-1 font-sans text-foreground/50 text-sm">
			<span className="min-w-0 truncate first-letter:uppercase">{label}</span>
		</div>
	);
}

function segmentChip(
	segment: MessageSegment,
	commands: ReadonlyMap<string, AvailableCommand> | undefined,
) {
	const { element, text } = segment;
	if (!element) return null;
	if (element.elementKind === "slash_command" && text.startsWith("/")) {
		const name = text.slice(1);
		return commandChip(name, commands?.get(name)?.description);
	}
	return {
		label: element.label ?? text.split("/").pop() ?? text,
		serialized: text,
	};
}

export type PendingPrompt = {
	failed: boolean;
	onRetry: () => void;
	onDiscard: () => void;
};

export function UserMessageRow({
	commands,
	harness,
	item,
	pending,
}: {
	item: UserMessage;
	commands?: ReadonlyMap<string, AvailableCommand> | undefined;
	/** Which harness spelled this turn; its reader decides what is bookkeeping. */
	harness: string | undefined;
	pending?: PendingPrompt | undefined;
}) {
	const raw = userMessageText(item);
	const note = readBookkeeping(harness, raw);
	const { text, attachments } = parseAttachmentTags(raw);
	const elements = item.content.find((part) => part.type === "text")?.elements;
	const leading = LEADING_COMMAND.exec(text)?.[1];
	const segments: MessageSegment[] = elements?.length
		? splitByElements(text, elements)
		: leading && commands?.has(leading)
			? splitByElements(text, [
					{
						byteRange: { start: 0, end: leading.length + 1 },
						elementKind: "slash_command",
					},
				])
			: [{ text }];
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
						{segments.map((segment, index) => {
							const chip = segmentChip(segment, commands);
							return chip ? (
								<Chip
									chip={chip}
									// biome-ignore lint/suspicious/noArrayIndexKey: segments have no identity beyond their order
									key={index}
								/>
							) : (
								segment.text
							);
						})}
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
