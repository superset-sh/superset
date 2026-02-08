import {
	CodeBlock,
	CodeBlockCopyButton,
} from "@superset/ui/ai-elements/code-block";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useState } from "react";

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escape sequences
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

function stripAnsi(text: string): string {
	return text.replace(ANSI_REGEX, "");
}

let showLogsFn: ((logs: string) => void) | null = null;

export const showTeardownLogs = (logs: string) => {
	if (!showLogsFn) {
		console.error(
			"[teardown-logs] TeardownLogsDialog not mounted. Make sure to render <TeardownLogsDialog /> in your app",
		);
		return;
	}
	showLogsFn(logs);
};

export function TeardownLogsDialog() {
	const [logs, setLogs] = useState<string | null>(null);
	const [isOpen, setIsOpen] = useState(false);

	showLogsFn = (newLogs) => {
		setLogs(newLogs);
		setIsOpen(true);
	};

	const strippedLogs = logs ? stripAnsi(logs) : "";

	const handleClose = () => {
		setIsOpen(false);
	};

	return (
		<Dialog
			modal={true}
			open={isOpen}
			onOpenChange={(open) => !open && handleClose()}
		>
			<DialogContent className="flex !max-w-[60vw] flex-col gap-0 p-0">
				<DialogHeader className="px-4 pt-4 pb-2">
					<DialogTitle className="font-medium">Teardown Logs</DialogTitle>
				</DialogHeader>
				<div className="px-4 pb-4">
					<CodeBlock
						code={strippedLogs}
						language="log"
						className="max-h-[60vh] overflow-y-auto text-xs"
					>
						<CodeBlockCopyButton />
					</CodeBlock>
				</div>
			</DialogContent>
		</Dialog>
	);
}
