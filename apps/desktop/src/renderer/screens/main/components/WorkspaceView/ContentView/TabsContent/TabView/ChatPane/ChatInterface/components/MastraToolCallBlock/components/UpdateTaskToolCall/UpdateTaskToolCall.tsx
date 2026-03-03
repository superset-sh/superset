import { useNavigate } from "@tanstack/react-router";
import { FilePenIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getArgs, getResult } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";
import { TaskItemDisplay } from "../TaskItemDisplay";

interface UpdateTaskToolCallProps {
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

export function UpdateTaskToolCall({ part }: UpdateTaskToolCallProps) {
	const navigate = useNavigate();
	const args = getArgs(part);
	const result = getResult(part);
	const resultData =
		typeof result.result === "object" && result.result !== null
			? (result.result as Record<string, unknown>)
			: result;
	const updated = Array.isArray(resultData.updated)
		? resultData.updated.filter(
				(item): item is Record<string, unknown> =>
					typeof item === "object" && item !== null,
			)
		: [];
	const updates = Array.isArray(args.updates)
		? args.updates.map((update) => toRecord(update)).filter(Boolean)
		: [];

	return (
		<SupersetToolCall
			part={part}
			toolName="Update task"
			icon={FilePenIcon}
			details={
				<div className="space-y-2">
					{updated.length > 0 ? (
						<div className="space-y-1">
							<div className="font-medium text-foreground">
								Updated ({updated.length})
							</div>
							<div className="space-y-1">
								{updated.map((task, index) => {
									const update = updates[index] ?? null;
									const title =
										typeof task.title === "string"
											? task.title
											: "Updated task";
									const slug = typeof task.slug === "string" ? task.slug : null;
									const taskId =
										typeof task.id === "string"
											? task.id
											: typeof update?.taskId === "string"
												? update.taskId
												: null;
									const openTaskId = taskId ?? slug;
									const changedFields = (
										update
											? Object.entries(update).filter(
													([key, value]) =>
														![
															"taskId",
															"title",
															"description",
															"priority",
															"assigneeId",
															"assigneeName",
															"dueDate",
															"estimate",
															"labels",
															"statusId",
															"statusName",
														].includes(key) &&
														value !== undefined &&
														value !== null,
												)
											: []
									).map(([key, value]) => ({
										label: key,
										value: Array.isArray(value)
											? value.map((item) => String(item)).join(", ")
											: String(value).slice(0, 80),
									}));
									const status =
										typeof update?.statusName === "string"
											? update.statusName
											: typeof update?.statusId === "string"
												? update.statusId
												: null;
									const labels = toStringArray(update?.labels);
									const priority =
										typeof update?.priority === "string"
											? update.priority
											: null;
									const assignee =
										typeof update?.assigneeName === "string"
											? update.assigneeName
											: typeof update?.assigneeId === "string"
												? update.assigneeId
												: null;
									const dueDate = formatDate(update?.dueDate);
									const estimate =
										typeof update?.estimate === "number" ||
										typeof update?.estimate === "string"
											? String(update.estimate)
											: null;
									const description =
										typeof update?.description === "string"
											? update.description
											: null;

									return (
										<TaskItemDisplay
											key={`${title}-${slug ?? index}`}
											assignee={assignee}
											description={description}
											dueDate={dueDate}
											estimate={estimate}
											extraDetails={changedFields}
											labels={labels}
											priority={priority}
											slug={slug}
											status={status}
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
							No updated tasks in result.
						</div>
					)}
				</div>
			}
		/>
	);
}
