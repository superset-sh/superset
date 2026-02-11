import {
	CodeBlock,
	CodeBlockCopyButton,
} from "@superset/ui/ai-elements/code-block";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escape sequences
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

function stripAnsi(text: string): string {
	return text.replace(ANSI_REGEX, "");
}

let showLogsFn:
	| ((logs: string, options?: { onDeleteAnyway?: () => void }) => void)
	| null = null;

export const showTeardownLogs = (
	logs: string,
	options?: { onDeleteAnyway?: () => void },
) => {
	if (!showLogsFn) {
		console.error(
			"[teardown-logs] TeardownLogsDialog not mounted. Make sure to render <TeardownLogsDialog /> in your app",
		);
		return;
	}
	showLogsFn(logs, options);
};

export function showTeardownFailedToast({
	toastId,
	output,
	onForceDelete,
}: {
	toastId: string | number;
	output: string;
	onForceDelete: () => void;
}) {
	toast.error("Teardown failed", {
		id: toastId,
		action: {
			label: "Delete Anyway",
			onClick: onForceDelete,
		},
		cancel: {
			label: "View Logs",
			onClick: () =>
				showTeardownLogs(output, { onDeleteAnyway: onForceDelete }),
		},
	});
}

export async function forceDeleteWithToast({
	name,
	deleteFn,
}: {
	name: string;
	deleteFn: () => Promise<{ success: boolean; error?: string }>;
}) {
	const toastId = toast.loading(`Deleting "${name}" (skipping teardown)...`);

	try {
		const result = await deleteFn();
		if (result.success) {
			toast.success(`Deleted "${name}"`, { id: toastId });
		} else {
			toast.error(result.error ?? "Failed to delete", { id: toastId });
		}
	} catch (error) {
		toast.error(error instanceof Error ? error.message : "Failed to delete", {
			id: toastId,
		});
	}
}

export function TeardownLogsDialog() {
	const [logs, setLogs] = useState<string | null>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [onDeleteAnyway, setOnDeleteAnyway] = useState<(() => void) | null>(
		null,
	);

	showLogsFn = (newLogs, options) => {
		setLogs(newLogs);
		setOnDeleteAnyway(() => options?.onDeleteAnyway ?? null);
		setIsOpen(true);
	};

	const strippedLogs = logs ? stripAnsi(logs) : "";

	const handleClose = () => {
		setIsOpen(false);
		setOnDeleteAnyway(null);
	};

	const handleDeleteAnyway = () => {
		handleClose();
		onDeleteAnyway?.();
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
				{onDeleteAnyway && (
					<DialogFooter className="px-4 pb-4 pt-0">
						<Button
							variant="destructive"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={handleDeleteAnyway}
						>
							Delete Anyway
						</Button>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}
