import {
	PromptInputButton,
	usePromptInputAttachments,
} from "@superset/ui/ai-elements/prompt-input";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { HiMiniPaperClip } from "react-icons/hi2";
import { LuLink, LuPlus } from "react-icons/lu";
import { PILL_BUTTON_CLASS } from "../../styles";

interface PlusMenuProps {
	onLinkIssue: () => void;
}

export function PlusMenu({ onLinkIssue }: PlusMenuProps) {
	const attachments = usePromptInputAttachments();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<PromptInputButton className={`${PILL_BUTTON_CLASS} w-[23px]`}>
					<LuPlus className="size-3.5" />
				</PromptInputButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" align="end" className="w-52">
				<DropdownMenuItem onSelect={() => attachments.openFileDialog()}>
					<HiMiniPaperClip className="size-4" />
					Add attachment
					<DropdownMenuShortcut>⌘U</DropdownMenuShortcut>
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={onLinkIssue}>
					<LuLink className="size-4" />
					Link issue
					<DropdownMenuShortcut>⌘I</DropdownMenuShortcut>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
