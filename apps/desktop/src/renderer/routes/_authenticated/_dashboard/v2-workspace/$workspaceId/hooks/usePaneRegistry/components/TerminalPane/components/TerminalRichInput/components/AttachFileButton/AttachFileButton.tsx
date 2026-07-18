import {
	PromptInputButton,
	usePromptInputAttachments,
} from "@superset/ui/ai-elements/prompt-input";
import { PaperclipIcon } from "lucide-react";

/**
 * Paperclip mirroring the chat composer's attach affordance: opens the file
 * dialog wired up by PromptInput's hidden input. Paste and drag-drop feed
 * the same attachments context.
 */
export function AttachFileButton() {
	const attachments = usePromptInputAttachments();
	return (
		<PromptInputButton
			aria-label="Attach files"
			className="size-[23px] rounded-full border border-transparent bg-foreground/10 p-[5px] shadow-none hover:bg-foreground/20"
			onClick={() => attachments.openFileDialog()}
		>
			<PaperclipIcon className="size-3.5 text-muted-foreground" />
		</PromptInputButton>
	);
}
