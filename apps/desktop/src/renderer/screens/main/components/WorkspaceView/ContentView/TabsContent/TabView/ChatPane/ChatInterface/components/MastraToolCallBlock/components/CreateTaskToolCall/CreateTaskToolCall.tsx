import { useNavigate } from "@tanstack/react-router";
import { FilePlusIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getArgs, getResult } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";
import { TaskItemDisplay } from "../TaskItemDisplay";

interface CreateTaskToolCallProps {
	part: ToolPart;
}

function toRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return null;
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

export function CreateTaskToolCall({ part }: CreateTaskToolCallProps) {
	const navigate = useNavigate();
	const args = getArgs(part);
	const result = getResult(part);
	const resultData =
		typeof result.result === "object" && result.result !== null
			? (result.result as Record<string, unknown>)
			: result;
	const created = Array.isArray(resultData.created)
		? resultData.created.filter(
				(item): item is Record<string, unknown> =>
					typeof item === "object" && item !== null,
			)
		: [];
	const requestedTasks = Array.isArray(args.tasks)
		? args.tasks.map((task) => toRecord(task)).filter(Boolean)
		: [];

	return (
		<SupersetToolCall
			part={part}
			toolName="Create task"
			icon={FilePlusIcon}
			details={
				<div className="space-y-2">
					{created.length > 0 ? (
						<div className="space-y-1">
							<div className="font-medium text-foreground">
								Created ({created.length})
							</div>
							<div className="space-y-1">
								{created.map((task, index) => {
									const requested = requestedTasks[index] ?? null;
									const title =
										typeof task.title === "string"
											? task.title
											: typeof requested?.title === "string"
												? requested.title
												: "Untitled task";
									const slug = typeof task.slug === "string" ? task.slug : null;
									const taskId = typeof task.id === "string" ? task.id : null;
									const openTaskId = taskId ?? slug;
									const priority =
										typeof requested?.priority === "string"
											? requested.priority
											: null;
									const assignee =
										typeof requested?.assigneeId === "string"
											? requested.assigneeId
											: null;
									const dueDate = formatDate(requested?.dueDate);
									const labels = toStringArray(requested?.labels);
									const description =
										typeof requested?.description === "string"
											? requested.description
											: null;

									return (
										<TaskItemDisplay
											key={`${title}-${slug ?? index}`}
											assignee={assignee}
											description={description}
											dueDate={dueDate}
											labels={labels}
											priority={priority}
											slug={slug}
											taskId={taskId}
											title={title}
											onClick={() =>
												openTaskId
													? navigate({
															to: "/tasks/$taskId",
															params: { taskId: openTaskId },
														})
													: undefined
											}
										/>
									);
								})}
							</div>
						</div>
					) : (
						<div className="text-muted-foreground">
							No created tasks in result.
						</div>
					)}
				</div>
			}
		/>
	);
}
