import { FileSearchIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getArgs, getResult } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface GetTaskToolCallProps {
	part: ToolPart;
}

export function GetTaskToolCall({ part }: GetTaskToolCallProps) {
	const args = getArgs(part);
	const result = getResult(part);
	const resultData =
		typeof result.result === "object" && result.result !== null
			? (result.result as Record<string, unknown>)
			: result;
	const task =
		typeof resultData.task === "object" && resultData.task !== null
			? (resultData.task as Record<string, unknown>)
			: undefined;
	const taskId =
		typeof args.taskId === "string"
			? args.taskId
			: typeof args.id === "string"
				? args.id
				: null;

	return (
		<GenericToolCall
			part={part}
			toolName="Get task"
			icon={FileSearchIcon}
			expandedContent={
				<div className="space-y-2">
					{taskId ? (
						<div className="text-muted-foreground">Task ID: {taskId}</div>
					) : null}
					{task ? (
						<div className="space-y-1 rounded border bg-background/70 px-2 py-1">
							<div className="font-medium text-foreground">
								{typeof task.title === "string" ? task.title : "Task details"}
							</div>
							<div className="text-muted-foreground">
								{typeof task.statusName === "string"
									? `Status: ${task.statusName}`
									: "Status: unknown"}
								{typeof task.priority === "string"
									? ` • Priority: ${task.priority}`
									: ""}
							</div>
							{Array.isArray(task.labels) && task.labels.length > 0 ? (
								<div className="flex flex-wrap gap-1">
									{task.labels.map((label, index) => (
										<span
											key={`${String(label)}-${index}`}
											className="rounded border bg-muted/30 px-1.5 py-0.5 text-muted-foreground"
										>
											{String(label)}
										</span>
									))}
								</div>
							) : null}
						</div>
					) : (
						<div className="text-muted-foreground">No task object in result.</div>
					)}
				</div>
			}
		/>
	);
}
