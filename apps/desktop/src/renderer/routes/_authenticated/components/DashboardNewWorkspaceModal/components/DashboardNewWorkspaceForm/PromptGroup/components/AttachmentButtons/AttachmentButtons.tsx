import {
	PromptInputButton,
	usePromptInputAttachments,
} from "@superset/ui/ai-elements/prompt-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { PaperclipIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PILL_BUTTON_CLASS } from "../../types";

/**
 * Row of 4 buttons above the submit row: paperclip (file attachments),
 * Linear issue, GitHub issue, and GitHub PR link. The 3 link buttons are
 * passed in as children — each one is a `*LinkCommand` that owns its own
 * Popover + Tooltip composition internally.
 */
interface AttachmentButtonsProps {
	linearIssueTrigger: ReactNode;
	githubIssueTrigger: ReactNode;
	prTrigger: ReactNode;
}

export function AttachmentButtons({
	linearIssueTrigger,
	githubIssueTrigger,
	prTrigger,
}: AttachmentButtonsProps) {
	const attachments = usePromptInputAttachments();
	return (
		<div className="flex items-center gap-1">
			<Tooltip>
				<TooltipTrigger asChild>
					<PromptInputButton
						aria-label="Add attachment"
						className={`${PILL_BUTTON_CLASS} w-[22px]`}
						onClick={() => attachments.openFileDialog()}
					>
						<PaperclipIcon className="size-3.5" />
					</PromptInputButton>
				</TooltipTrigger>
				<TooltipContent side="bottom">Add attachment</TooltipContent>
			</Tooltip>
			{linearIssueTrigger}
			{githubIssueTrigger}
			{prTrigger}
		</div>
	);
}
