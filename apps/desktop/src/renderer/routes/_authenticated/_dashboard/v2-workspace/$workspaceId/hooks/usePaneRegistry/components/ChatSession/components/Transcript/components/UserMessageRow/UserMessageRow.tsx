import { Trans } from "@lingui/react/macro";
import { readBookkeeping } from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { userMessageText } from "../../../../utils/userMessageText";
import { useFitsOneLine } from "./hooks/useFitsOneLine";

/**
 * A harness bookkeeping turn: one muted line with the raw block behind a
 * disclosure, the way the CLI shows it. Rendering it as a user bubble puts
 * task ids and file paths in the middle of the conversation.
 */
function BookkeepingRow({ label, text }: { label: string; text: string }) {
	const [open, setOpen] = useState(false);
	return (
		<Collapsible onOpenChange={setOpen} open={open}>
			<CollapsibleTrigger className="flex w-full items-center gap-1.5 py-0.5 text-left text-muted-foreground/70 text-xs hover:text-foreground">
				<ChevronRight
					className={cn(
						"size-3 shrink-0 transition-transform",
						open && "rotate-90",
					)}
				/>
				<span className="min-w-0 truncate">{label}</span>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<pre className="mt-1 ml-[18px] overflow-x-auto whitespace-pre-wrap border-border/60 border-l pl-3 font-mono text-[11px] text-muted-foreground/70">
					{text}
				</pre>
			</CollapsibleContent>
		</Collapsible>
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
	const text = userMessageText(item);
	const note = readBookkeeping(harness, text);
	const textRef = useRef<HTMLDivElement>(null);
	const oneLine = useFitsOneLine(textRef);
	if (note && !pending)
		return <BookkeepingRow label={note.label} text={text} />;

	const attachments = item.content.filter(
		(content) => content.type === "attachment",
	);
	return (
		<Message className="pt-1.5 pb-5 pl-10" from="user">
			<MessageContent
				className={cn(
					"max-w-[min(100%,36rem)] font-sans transition-opacity group-[.is-user]:bg-foreground/10 group-[.is-user]:px-3 group-[.is-user]:py-2",
					oneLine
						? "group-[.is-user]:rounded-full"
						: "group-[.is-user]:rounded-xl",
					pending && !pending.failed && "opacity-60",
				)}
			>
				<div className="whitespace-pre-wrap break-words text-sm" ref={textRef}>
					{text}
				</div>
				{attachments.length > 0 && (
					<div className="mt-1 flex flex-wrap gap-1">
						{attachments.map((attachment) => (
							<Badge key={attachment.attachmentId} variant="secondary">
								{attachment.name}
							</Badge>
						))}
					</div>
				)}
			</MessageContent>
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
