import {
	PromptInputButton,
	usePromptInputAttachments,
} from "@superset/ui/ai-elements/prompt-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiMiniPaperClip } from "react-icons/hi2";
import { PILL_BUTTON_CLASS } from "../../styles";

/**
 * Attachment-only trigger. Previously this component wrapped a dropdown
 * with "Add attachment" + "Link issue" items — the link-issue flow has
 * been removed from chat, so this collapses to a single button that
 * opens the native file dialog directly.
 */
export function PlusMenu() {
	const attachments = usePromptInputAttachments();

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<PromptInputButton
					aria-label="Add attachment"
					className={`${PILL_BUTTON_CLASS} w-[23px]`}
					onClick={() => attachments.openFileDialog()}
				>
					<HiMiniPaperClip className="size-3.5" />
				</PromptInputButton>
			</TooltipTrigger>
			<TooltipContent side="top">Add attachment</TooltipContent>
		</Tooltip>
	);
}
