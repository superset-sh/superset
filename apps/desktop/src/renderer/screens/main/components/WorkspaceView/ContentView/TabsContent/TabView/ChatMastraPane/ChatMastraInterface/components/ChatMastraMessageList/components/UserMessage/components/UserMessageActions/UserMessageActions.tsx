import {
	MessageAction,
	MessageActions,
} from "@superset/ui/ai-elements/message";
import {
	CheckIcon,
	CopyIcon,
	PencilLineIcon,
	RotateCcwIcon,
} from "lucide-react";

interface UserMessageActionsProps {
	actionDisabled: boolean;
	copied: boolean;
	fullText: string;
	onCopy: () => void;
	onEdit: () => void;
	onResend: () => void;
}

export function UserMessageActions({
	actionDisabled,
	copied,
	fullText,
	onCopy,
	onEdit,
	onResend,
}: UserMessageActionsProps) {
	return (
		<div className="opacity-0 transition-opacity group-hover/msg:opacity-100 group-focus-within/msg:opacity-100">
			<MessageActions className="rounded-lg bg-background/95 p-1 shadow-sm backdrop-blur-xs">
				<MessageAction
					className="size-7 text-muted-foreground hover:text-foreground"
					label="Resend message"
					onClick={onResend}
					tooltip="Resend"
					disabled={actionDisabled}
				>
					<RotateCcwIcon className="size-3.5" />
				</MessageAction>
				<MessageAction
					className="size-7 text-muted-foreground hover:text-foreground"
					label="Edit message"
					onClick={onEdit}
					tooltip="Edit"
					disabled={actionDisabled}
				>
					<PencilLineIcon className="size-3.5" />
				</MessageAction>
				{fullText ? (
					<MessageAction
						className="size-7 text-muted-foreground hover:text-foreground"
						label={copied ? "Copied" : "Copy message"}
						onClick={onCopy}
						tooltip={copied ? "Copied" : "Copy"}
					>
						{copied ? (
							<CheckIcon className="size-3.5" />
						) : (
							<CopyIcon className="size-3.5" />
						)}
					</MessageAction>
				) : null}
			</MessageActions>
		</div>
	);
}
