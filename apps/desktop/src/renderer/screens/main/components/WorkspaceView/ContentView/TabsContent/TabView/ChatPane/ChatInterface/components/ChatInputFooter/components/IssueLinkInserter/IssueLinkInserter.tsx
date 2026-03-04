import { usePromptInputController } from "@superset/ui/ai-elements/prompt-input";
import type React from "react";
import { useCallback } from "react";
import { IssueLinkCommand } from "../../../IssueLinkCommand";

interface IssueLinkInserterProps {
	issueLinkOpen: boolean;
	setIssueLinkOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function IssueLinkInserter({
	issueLinkOpen,
	setIssueLinkOpen,
}: IssueLinkInserterProps) {
	const { textInput } = usePromptInputController();

	const handleSelectTask = useCallback(
		(slug: string) => {
			const current = textInput.value;
			const needsSpace = current.length > 0 && !current.endsWith(" ");
			textInput.setInput(`${current}${needsSpace ? " " : ""}@task:${slug} `);
		},
		[textInput],
	);

	return (
		<IssueLinkCommand
			open={issueLinkOpen}
			onOpenChange={setIssueLinkOpen}
			onSelect={handleSelectTask}
		/>
	);
}
