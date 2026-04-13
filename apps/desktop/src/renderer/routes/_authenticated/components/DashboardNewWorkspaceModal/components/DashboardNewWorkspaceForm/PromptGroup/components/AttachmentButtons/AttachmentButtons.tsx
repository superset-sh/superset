import {
	PromptInputButton,
	usePromptInputAttachments,
} from "@superset/ui/ai-elements/prompt-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { PaperclipIcon } from "lucide-react";
import { GoIssueOpened } from "react-icons/go";
import { LuGitPullRequest } from "react-icons/lu";
import { SiLinear } from "react-icons/si";
import { PILL_BUTTON_CLASS } from "../../types";

interface AttachmentButtonsProps {
	anchorRef: React.RefObject<HTMLDivElement | null>;
	onOpenIssueLink: () => void;
	onOpenGitHubIssue: () => void;
	onOpenPRLink: () => void;
}

export function AttachmentButtons({
	anchorRef,
	onOpenIssueLink,
	onOpenGitHubIssue,
	onOpenPRLink,
}: AttachmentButtonsProps) {
	const attachments = usePromptInputAttachments();
	return (
		<div ref={anchorRef} className="flex items-center gap-1">
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
			<Tooltip>
				<TooltipTrigger asChild>
					<PromptInputButton
						className={`${PILL_BUTTON_CLASS} w-[22px]`}
						onClick={onOpenIssueLink}
					>
						<SiLinear className="size-3.5" />
					</PromptInputButton>
				</TooltipTrigger>
				<TooltipContent side="bottom">Link issue</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<PromptInputButton
						className={`${PILL_BUTTON_CLASS} w-[22px]`}
						onClick={onOpenGitHubIssue}
					>
						<GoIssueOpened className="size-3.5" />
					</PromptInputButton>
				</TooltipTrigger>
				<TooltipContent side="bottom">Link GitHub issue</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<PromptInputButton
						className={`${PILL_BUTTON_CLASS} w-[22px]`}
						onClick={onOpenPRLink}
					>
						<LuGitPullRequest className="size-3.5" />
					</PromptInputButton>
				</TooltipTrigger>
				<TooltipContent side="bottom">Link pull request</TooltipContent>
			</Tooltip>
		</div>
	);
}
