import { useNavigate } from "@tanstack/react-router";
import { FilePenIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getArgs, getResult } from "../../../../utils/tool-helpers";
import {
	formatTaskDate,
	toRecord,
	toStringArray,
} from "../../utils/taskToolCallHelpers";
import { SupersetToolCall } from "../SupersetToolCall";
import { TaskItemDisplay } from "../TaskItemDisplay";

interface UpdateTaskToolCallProps {
	part: ToolPart;
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
		? args.updates
				.map((update) => toRecord(update))
				.filter((update): update is Record<string, unknown> => update !== null)
		: [];
	const updatesByTaskId = new Map<string, Record<string, unknown>>();
	const updatesBySlug = new Map<string, Record<string, unknown>>();
	for (const update of updates) {
		if (typeof update.taskId === "string") {
			updatesByTaskId.set(update.taskId, update);
		}
		if (typeof update.slug === "string") {
			updatesBySlug.set(update.slug, update);
		}
	}

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
								{updated.map((task) => {
									const title =
										typeof task.title === "string"
											? task.title
											: "Updated task";
									const slug = typeof task.slug === "string" ? task.slug : null;
									const taskId = typeof task.id === "string" ? task.id : null;
									const matchedUpdate =
										(taskId ? updatesByTaskId.get(taskId) : undefined) ??
										(slug ? updatesBySlug.get(slug) : undefined) ??
										(updates.length === 1 ? updates[0] : null);
									const resolvedTaskId =
										taskId ??
										(typeof matchedUpdate?.taskId === "string"
											? matchedUpdate.taskId
											: null);
									const openTaskId = resolvedTaskId ?? slug;
									const changedFields = (
										matchedUpdate
											? Object.entries(matchedUpdate).filter(
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
										typeof matchedUpdate?.statusName === "string"
											? matchedUpdate.statusName
											: typeof matchedUpdate?.statusId === "string"
												? matchedUpdate.statusId
												: null;
									const statusType =
										typeof matchedUpdate?.statusType === "string"
											? matchedUpdate.statusType
											: null;
									const statusColor =
										typeof matchedUpdate?.statusColor === "string"
											? matchedUpdate.statusColor
											: null;
									const statusProgress =
										typeof matchedUpdate?.statusProgress === "number"
											? matchedUpdate.statusProgress
											: null;
									const labels = toStringArray(matchedUpdate?.labels);
									const priority =
										typeof matchedUpdate?.priority === "string"
											? matchedUpdate.priority
											: null;
									const assignee =
										typeof matchedUpdate?.assigneeName === "string"
											? matchedUpdate.assigneeName
											: typeof matchedUpdate?.assigneeId === "string"
												? matchedUpdate.assigneeId
												: null;
									const dueDate = formatTaskDate(matchedUpdate?.dueDate);
									const estimate =
										typeof matchedUpdate?.estimate === "number" ||
										typeof matchedUpdate?.estimate === "string"
											? String(matchedUpdate.estimate)
											: null;
									const description =
										typeof matchedUpdate?.description === "string"
											? matchedUpdate.description
											: null;

									return (
										<TaskItemDisplay
											key={resolvedTaskId ?? slug ?? title}
											assignee={assignee}
											description={description}
											dueDate={dueDate}
											estimate={estimate}
											extraDetails={changedFields}
											labels={labels}
											priority={priority}
											slug={slug}
											status={status}
											statusColor={statusColor}
											statusProgress={statusProgress}
											statusType={statusType}
											taskId={resolvedTaskId}
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
							No updated tasks in result.
						</div>
					)}
				</div>
			}
		/>
	);
}
