import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { useMultiLinePasteDialogStore } from "renderer/stores/multi-line-paste-dialog";

const PREVIEW_LINES = 3;
const MAX_PREVIEW_LINE_LENGTH = 60;

export function MultiLinePasteDialog() {
	const isOpen = useMultiLinePasteDialogStore((s) => s.isOpen);
	const text = useMultiLinePasteDialogStore((s) => s.text);
	const decide = useMultiLinePasteDialogStore((s) => s.decide);

	if (!isOpen) return null;

	const lines = text.split(/\r?\n/);
	const previewLines = lines
		.slice(0, PREVIEW_LINES)
		.map((line) =>
			line.length > MAX_PREVIEW_LINE_LENGTH
				? `${line.slice(0, MAX_PREVIEW_LINE_LENGTH)}…`
				: line,
		);
	const hasMore = lines.length > PREVIEW_LINES;

	return (
		<AlertDialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) decide({ kind: "cancel" });
			}}
		>
			<AlertDialogContent className="max-w-[420px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						Paste {lines.length} lines into the terminal?
					</AlertDialogTitle>
					<AlertDialogDescription>
						The shell does not have bracketed paste mode enabled, so each line
						will be executed as a separate command.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="px-4 pb-2">
					<pre className="rounded bg-muted p-2 text-xs font-mono whitespace-pre-wrap break-all">
						{previewLines.join("\n")}
						{hasMore ? "\n…" : ""}
					</pre>
				</div>
				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => decide({ kind: "cancel" })}
					>
						Cancel
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => decide({ kind: "pasteAsOneLine" })}
					>
						Paste as one line
					</Button>
					<Button
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => decide({ kind: "paste" })}
					>
						Paste
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
