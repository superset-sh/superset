import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";

type ApprovalDecision = "approve" | "decline" | "always_allow_category";

interface PendingApproval {
	toolCallId: string;
	toolName: string;
	args: unknown;
}

interface ApprovalDialogProps {
	approval: PendingApproval | null;
	isSubmitting: boolean;
	onRespond: (decision: ApprovalDecision) => Promise<void>;
}

function stringifyArgs(value: unknown): string {
	try {
		if (value === undefined) return "No arguments";
		if (typeof value === "string" && value.trim().length > 0) return value;
		if (typeof value === "string") return "No arguments";
		const serialized = JSON.stringify(value, null, 2);
		return serialized && serialized !== "{}" ? serialized : "No arguments";
	} catch {
		return "Unable to render tool arguments";
	}
}

export function ApprovalDialog({
	approval,
	isSubmitting,
	onRespond,
}: ApprovalDialogProps) {
	const open = Boolean(approval);
	const toolName =
		approval?.toolName?.trim().replaceAll("_", " ") || "tool execution";
	const renderedArgs = stringifyArgs(approval?.args);
	const canRespond = Boolean(approval?.toolCallId);

	return (
		<Dialog modal open={open}>
			<DialogContent
				showCloseButton={false}
				className="max-w-xl"
				onEscapeKeyDown={(event) => event.preventDefault()}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Tool approval required</DialogTitle>
					<DialogDescription>
						The agent requested permission to run {toolName}.
					</DialogDescription>
				</DialogHeader>

				<div className="rounded-md border bg-muted/20 p-3">
					<div className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
						Arguments
					</div>
					<pre className="max-h-64 overflow-auto text-xs whitespace-pre-wrap break-words">
						{renderedArgs}
					</pre>
				</div>

				<DialogFooter className="justify-between">
					<Button
						type="button"
						variant="outline"
						disabled={isSubmitting || !canRespond}
						onClick={() => {
							void onRespond("always_allow_category");
						}}
					>
						Always allow category
					</Button>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={isSubmitting || !canRespond}
							onClick={() => {
								void onRespond("decline");
							}}
						>
							Decline
						</Button>
						<Button
							type="button"
							disabled={isSubmitting || !canRespond}
							onClick={() => {
								void onRespond("approve");
							}}
						>
							Approve
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
