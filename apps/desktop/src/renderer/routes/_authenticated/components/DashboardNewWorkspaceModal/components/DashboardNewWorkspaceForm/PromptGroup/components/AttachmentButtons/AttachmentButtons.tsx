import {
	PromptInputButton,
	usePromptInputAttachments,
} from "@superset/ui/ai-elements/prompt-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { PaperclipIcon } from "lucide-react";
import { forwardRef, type ReactNode } from "react";
import { GoIssueOpened } from "react-icons/go";
import { LuGitPullRequest } from "react-icons/lu";
import { SiLinear } from "react-icons/si";
import { PILL_BUTTON_CLASS } from "../../types";

/**
 * Trigger button used as the popover trigger for each link command.
 * Wrapped with `forwardRef` so Radix's `PopoverTrigger asChild` can attach
 * its ref + click handlers to the underlying button element.
 */
interface LinkTriggerProps {
	label: string;
	icon: ReactNode;
}

export const LinkTrigger = forwardRef<HTMLButtonElement, LinkTriggerProps>(
	function LinkTrigger({ label, icon, ...rest }, ref) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<PromptInputButton
						ref={ref}
						className={`${PILL_BUTTON_CLASS} w-[22px]`}
						{...rest}
					>
						{icon}
					</PromptInputButton>
				</TooltipTrigger>
				<TooltipContent side="bottom">{label}</TooltipContent>
			</Tooltip>
		);
	},
);

/**
 * Row of 4 buttons above the submit row: paperclip (file attachments),
 * Linear issue, GitHub issue, and GitHub PR link. The 3 link buttons are
 * passed in as children — each is wrapped in a PopoverTrigger by its
 * parent link command so Radix owns toggle/dismiss behavior natively.
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

export { SiLinear, GoIssueOpened, LuGitPullRequest };
