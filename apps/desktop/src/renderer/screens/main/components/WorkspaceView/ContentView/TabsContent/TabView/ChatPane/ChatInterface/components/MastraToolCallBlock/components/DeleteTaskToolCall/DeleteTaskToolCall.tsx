import { FileXIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getArgs, getResult } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface DeleteTaskToolCallProps {
	part: ToolPart;
}

export function DeleteTaskToolCall({ part }: DeleteTaskToolCallProps) {
	const args = getArgs(part);
	const result = getResult(part);
	const resultData =
		typeof result.result === "object" && result.result !== null
			? (result.result as Record<string, unknown>)
			: result;
	const deleted = Array.isArray(resultData.deleted)
		? resultData.deleted.map((item) => String(item))
		: [];
	const requestedIds = Array.isArray(args.taskIds)
		? args.taskIds.map((item) => String(item))
		: [];

	return (
		<SupersetToolCall
			part={part}
			toolName="Delete task"
			icon={FileXIcon}
			details={
				<div className="space-y-2">
					{requestedIds.length > 0 ? (
						<div className="text-muted-foreground">
							Requested: {requestedIds.length} task
							{requestedIds.length === 1 ? "" : "s"}
						</div>
					) : null}
					{deleted.length > 0 ? (
						<div className="space-y-1">
							<div className="font-medium text-foreground">
								Deleted ({deleted.length})
							</div>
							<div className="space-y-1">
								{deleted.map((taskId) => (
									<div
										key={taskId}
										className="rounded border bg-background/70 px-2 py-1 text-muted-foreground"
									>
										{taskId}
									</div>
								))}
							</div>
						</div>
					) : (
						<div className="text-muted-foreground">No deleted tasks in result.</div>
					)}
				</div>
			}
		/>
	);
}
