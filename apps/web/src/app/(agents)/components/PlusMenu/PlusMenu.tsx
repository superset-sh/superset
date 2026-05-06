"use client";

import {
	PromptInputButton,
	usePromptInputAttachments,
} from "@superset/ui/ai-elements/prompt-input";
import { PaperclipIcon, PlusIcon } from "lucide-react";
import { ResponsiveDropdown } from "../ResponsiveDropdown";

type PlusMenuProps = {
	disabled?: boolean;
};

export function PlusMenu({ disabled = false }: PlusMenuProps) {
	const attachments = usePromptInputAttachments();

	if (disabled) {
		return (
			<PromptInputButton
				className="size-[23px] rounded-full border border-transparent bg-foreground/10 p-[5px] shadow-none hover:bg-foreground/20"
				disabled
			>
				<PlusIcon className="size-3.5" />
			</PromptInputButton>
		);
	}

	return (
		<ResponsiveDropdown
			side="top"
			align="end"
			contentClassName="w-52"
			title="Add to prompt"
			onCloseAutoFocus={(e) => e.preventDefault()}
			items={[
				{
					label: "Add attachment",
					icon: <PaperclipIcon className="size-4" />,
					onSelect: () => attachments.openFileDialog(),
				},
			]}
			trigger={
				<PromptInputButton className="size-[23px] rounded-full border border-transparent bg-foreground/10 p-[5px] shadow-none hover:bg-foreground/20">
					<PlusIcon className="size-3.5" />
				</PromptInputButton>
			}
		/>
	);
}
