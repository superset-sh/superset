import { useNavigate } from "@tanstack/react-router";
import { FileSearchIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getArgs, getResult } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface GetTaskToolCallProps {
	part: ToolPart;
}

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => (typeof item === "string" ? item.trim() : String(item)))
		.filter((item) => item.length > 0);
}

function formatDate(value: unknown): string | null {
	if (typeof value !== "string" || value.trim().length === 0) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString();
}

export function GetTaskToolCall({ part }: GetTaskToolCallProps) {
	const navigate = useNavigate();
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
	const openTaskId =
		(typeof task?.id === "string" ? task.id : null) ??
		(typeof task?.slug === "string" ? task.slug : null) ??
		taskId;
	const labels = toStringArray(task?.labels);
	const description =
		typeof task?.description === "string" ? task.description : null;
	const dueDate = formatDate(task?.dueDate);

	return (
		<SupersetToolCall
			part={part}
			toolName="Get task"
			icon={FileSearchIcon}
			details={
				<div className="space-y-2">
					{taskId ? (
						<div className="text-muted-foreground">Task ID: {taskId}</div>
					) : null}
					{task ? (
						<button
							type="button"
							className="w-full space-y-1 rounded border bg-background/70 px-2 py-1 text-left transition-colors hover:bg-muted/20"
							onClick={() =>
								openTaskId
									? navigate({
											to: "/tasks/$taskId",
											params: { taskId: openTaskId },
										})
									: undefined
							}
						>
							<div className="font-medium text-foreground">
								{typeof task.title === "string" ? task.title : "Task details"}
							</div>
							<div className="text-muted-foreground">
								{typeof task.slug === "string" ? `#${task.slug}` : null}
								{typeof task.id === "string" ? ` • ${task.id}` : null}
							</div>
							<div className="text-muted-foreground">
								{typeof task.statusName === "string"
									? `Status: ${task.statusName}`
									: "Status: unknown"}
								{typeof task.priority === "string"
									? ` • Priority: ${task.priority}`
									: ""}
								{typeof task.assigneeName === "string"
									? ` • Assignee: ${task.assigneeName}`
									: ""}
								{dueDate ? ` • Due: ${dueDate}` : ""}
								{typeof task.estimate === "number"
									? ` • Estimate: ${task.estimate}`
									: ""}
							</div>
							{labels.length > 0 ? (
								<div className="flex flex-wrap gap-1">
									{labels.map((label) => (
										<span
											key={label}
											className="rounded border bg-muted/30 px-1.5 py-0.5 text-muted-foreground"
										>
											{label}
										</span>
									))}
								</div>
							) : null}
							{description ? (
								<div className="line-clamp-3 text-muted-foreground">
									{description}
								</div>
							) : null}
						</button>
					) : (
						<div className="text-muted-foreground">No task object in result.</div>
					)}
				</div>
			}
		/>
	);
}
