import { useNavigate } from "@tanstack/react-router";
import { FileSearchIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getArgs, getResult } from "../../../../utils/tool-helpers";
import { formatTaskDate, toStringArray } from "../../utils/taskToolCallHelpers";
import { SupersetToolCall } from "../SupersetToolCall";
import { TaskItemDisplay } from "../TaskItemDisplay";

interface GetTaskToolCallProps {
	part: ToolPart;
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
	const dueDate = formatTaskDate(task?.dueDate);
	const status = typeof task?.statusName === "string" ? task.statusName : null;
	const statusType =
		typeof task?.statusType === "string" ? task.statusType : null;
	const statusColor =
		typeof task?.statusColor === "string" ? task.statusColor : null;
	const statusProgress =
		typeof task?.statusProgressPercent === "number"
			? task.statusProgressPercent
			: typeof task?.statusProgress === "number"
				? task.statusProgress
				: null;
	const priority = typeof task?.priority === "string" ? task.priority : null;
	const assignee =
		typeof task?.assigneeName === "string"
			? task.assigneeName
			: typeof task?.assigneeId === "string"
				? task.assigneeId
				: null;
	const estimate =
		typeof task?.estimate === "number" || typeof task?.estimate === "string"
			? String(task.estimate)
			: null;
	const externalUrl =
		typeof task?.externalUrl === "string" ? task.externalUrl : null;
	const branch = typeof task?.branch === "string" ? task.branch : null;
	const prUrl = typeof task?.prUrl === "string" ? task.prUrl : null;
	const creator =
		typeof task?.creatorName === "string" ? task.creatorName : null;
	const assigneeEmail =
		typeof task?.assigneeEmail === "string" ? task.assigneeEmail : null;
	const assigneeImage =
		typeof task?.assigneeImage === "string"
			? task.assigneeImage
			: typeof task?.assigneeAvatarUrl === "string"
				? task.assigneeAvatarUrl
				: null;
	const extraDetails = [
		creator ? { label: "Creator", value: creator } : null,
		assigneeEmail ? { label: "Assignee Email", value: assigneeEmail } : null,
		branch ? { label: "Branch", value: branch } : null,
		prUrl ? { label: "PR", value: prUrl } : null,
		externalUrl ? { label: "External", value: externalUrl } : null,
	].filter((detail): detail is { label: string; value: string } =>
		Boolean(detail),
	);

	return (
		<SupersetToolCall
			part={part}
			toolName="Get task"
			icon={FileSearchIcon}
			details={
				<div className="space-y-2">
					{task ? (
						<TaskItemDisplay
							assignee={assignee}
							description={description}
							dueDate={dueDate}
							estimate={estimate}
							extraDetails={extraDetails}
							labels={labels}
							priority={priority}
							slug={typeof task.slug === "string" ? task.slug : null}
							status={status}
							statusColor={statusColor}
							statusProgress={statusProgress}
							statusType={statusType}
							taskId={typeof task.id === "string" ? task.id : taskId}
							title={
								typeof task.title === "string" ? task.title : "Task details"
							}
							assigneeImage={assigneeImage}
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
					) : (
						<div className="text-muted-foreground">
							No task object in result.
						</div>
					)}
				</div>
			}
		/>
	);
}
