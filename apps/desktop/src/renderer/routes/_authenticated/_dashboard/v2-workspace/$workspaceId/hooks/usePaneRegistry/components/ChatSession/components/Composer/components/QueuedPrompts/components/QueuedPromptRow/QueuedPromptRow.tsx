import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { countLines, firstLine, userMessageText } from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import {
	QueueItem,
	QueueItemAction,
	QueueItemActions,
	QueueItemContent,
} from "@superset/ui/ai-elements/queue";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	CornerDownRight,
	Ellipsis,
	FileTextIcon,
	ListEnd,
	Trash2,
} from "lucide-react";
import { parseAttachmentTags } from "../../../../../../utils/attachmentTags";

export function QueuedPromptRow({
	prompt,
	actionable,
	editing,
	onEdit,
	onEditEnd,
	onRemove,
	onSteer,
}: {
	prompt: UserMessage;
	actionable: boolean;
	editing: boolean;
	onEdit: () => void;
	/** `null` when the edit was abandoned or left the text unchanged. */
	onEditEnd: (text: string | null) => void;
	onRemove: (id: string) => void;
	onSteer: (id: string) => void;
}) {
	const { t } = useLingui();
	const { text, attachments, pastedTexts } = parseAttachmentTags(
		userMessageText(prompt),
	);
	const attachmentNames = [
		...attachments.map(
			(attachment) => attachment.path.split("/").pop() ?? attachment.path,
		),
		...prompt.content.flatMap((content) =>
			content.type === "attachment" ? [content.name] : [],
		),
	];
	const label =
		text ||
		(pastedTexts[0] ? firstLine(pastedTexts[0]) : attachmentNames.join(", "));
	const finishEdit = (next: string | null) => {
		if (!editing) return;
		const trimmed = next?.trim() ?? "";
		onEditEnd(
			next !== null && trimmed !== "" && trimmed !== text ? next : null,
		);
	};

	return (
		<QueueItem
			aria-label={label}
			className="flex-row items-center gap-2 pr-2 pl-3 outline-none focus-visible:bg-muted focus-visible:ring-1 focus-visible:ring-ring"
			data-queue-row
			tabIndex={actionable ? -1 : undefined}
		>
			<ListEnd className="size-4 shrink-0 text-muted-foreground" />
			{editing ? (
				<textarea
					aria-label={t({ message: "Edit queued message" })}
					// biome-ignore lint/a11y/noAutofocus: the user just asked to edit this row
					autoFocus
					className="field-sizing-content min-w-0 flex-1 resize-none bg-transparent py-0.5 text-foreground outline-none"
					defaultValue={text}
					onBlur={(event) => finishEdit(event.currentTarget.value)}
					onKeyDown={(event) => {
						event.stopPropagation();
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							finishEdit(event.currentTarget.value);
						} else if (event.key === "Escape") {
							event.preventDefault();
							finishEdit(null);
						}
					}}
					rows={1}
				/>
			) : (
				<QueueItemContent className="min-w-0 truncate text-foreground">
					{label}
				</QueueItemContent>
			)}
			{pastedTexts.map((pasted, index) => {
				const lines = countLines(pasted);
				return (
					<span
						className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs"
						// biome-ignore lint/suspicious/noArrayIndexKey: pastes have no identity beyond their order
						key={index}
					>
						<FileTextIcon className="size-3.5" />
						{t({
							message: plural(lines, { one: "# line", other: "# lines" }),
						})}
					</span>
				);
			})}
			{actionable && !editing && (
				<QueueItemActions className="shrink-0 items-center">
					<Tooltip>
						<TooltipTrigger asChild>
							<QueueItemAction
								className="gap-1 px-1.5 py-0.5 font-normal text-xs opacity-100"
								onClick={() => onSteer(prompt.id)}
							>
								<CornerDownRight className="size-3.5" />
								<Trans>Steer</Trans>
							</QueueItemAction>
						</TooltipTrigger>
						<TooltipContent>
							<Trans>Stop the agent and send this now</Trans>
						</TooltipContent>
					</Tooltip>
					<QueueItemAction
						aria-label={t({ message: "Remove queued message" })}
						className="size-6 opacity-100"
						onClick={() => onRemove(prompt.id)}
					>
						<Trash2 className="size-3.5" />
					</QueueItemAction>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<QueueItemAction
								aria-label={t({ message: "More actions" })}
								className="size-6 opacity-100"
							>
								<Ellipsis className="size-3.5" />
							</QueueItemAction>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onSelect={onEdit}>
								<Trans>Edit</Trans>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</QueueItemActions>
			)}
		</QueueItem>
	);
}
