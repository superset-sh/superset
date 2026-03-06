import { useNavigate } from "@tanstack/react-router";
import { FilePlusIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getArgs, getResult } from "../../../../utils/tool-helpers";
import {
	formatTaskDate,
	toRecord,
	toStringArray,
} from "../../utils/taskToolCallHelpers";
import { SupersetToolCall } from "../SupersetToolCall";
import { TaskItemDisplay } from "../TaskItemDisplay";

interface CreateTaskToolCallProps {
	part: ToolPart;
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
		? args.tasks
				.map((task) => toRecord(task))
				.filter((task): task is Record<string, unknown> => task !== null)
		: Object.keys(args).length > 0
			? [toRecord(args)].filter(
					(task): task is Record<string, unknown> => task !== null,
				)
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
								{created.map((task) => {
									const taskId = typeof task.id === "string" ? task.id : null;
									const slug = typeof task.slug === "string" ? task.slug : null;
									const requested =
										requestedTasks.find((candidate) => {
											if (!candidate) return false;
											if (
												taskId &&
												typeof candidate.taskId === "string" &&
												candidate.taskId === taskId
											) {
												return true;
											}
											if (
												slug &&
												typeof candidate.slug === "string" &&
												candidate.slug === slug
											) {
												return true;
											}
											return false;
										}) ??
										(requestedTasks.length === 1 ? requestedTasks[0] : null);
									const title =
										typeof task.title === "string"
											? task.title
											: typeof requested?.title === "string"
												? requested.title
												: "Untitled task";
									const openTaskId = taskId ?? slug;
									const priority =
										typeof requested?.priority === "string"
											? requested.priority
											: null;
									const assignee =
										typeof requested?.assigneeId === "string"
											? requested.assigneeId
											: null;
									const dueDate = formatTaskDate(requested?.dueDate);
									const labels = toStringArray(requested?.labels);
									const description =
										typeof requested?.description === "string"
											? requested.description
											: null;

									return (
										<TaskItemDisplay
											key={taskId ?? slug ?? title}
											assignee={assignee}
											description={description}
											dueDate={dueDate}
											labels={labels}
											priority={priority}
											slug={slug}
											taskId={taskId}
											title={title}
											onClick={
												openTaskId
													? () =>
															navigate({
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
