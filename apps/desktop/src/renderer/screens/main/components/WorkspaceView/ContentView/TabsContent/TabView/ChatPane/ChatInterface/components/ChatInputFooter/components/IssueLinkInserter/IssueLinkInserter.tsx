import type React from "react";
import { IssueLinkCommand } from "../../../IssueLinkCommand";

interface IssueLinkInserterProps {
	issueLinkOpen: boolean;
	setIssueLinkOpen: React.Dispatch<React.SetStateAction<boolean>>;
	onSelectTask: (slug: string, title: string) => void;
}

export function IssueLinkInserter({
	issueLinkOpen,
	setIssueLinkOpen,
	onSelectTask,
}: IssueLinkInserterProps) {
	return (
		<IssueLinkCommand
			open={issueLinkOpen}
			onOpenChange={setIssueLinkOpen}
			onSelect={onSelectTask}
		/>
	);
}
