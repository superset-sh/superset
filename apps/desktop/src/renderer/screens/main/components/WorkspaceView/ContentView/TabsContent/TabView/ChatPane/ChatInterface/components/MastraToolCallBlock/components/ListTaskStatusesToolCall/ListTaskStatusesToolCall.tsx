import { TaskItem, TaskItemFile } from "@superset/ui/ai-elements/task";
import { ListChecksIcon } from "lucide-react";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getResult } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface ListTaskStatusesToolCallProps {
	part: ToolPart;
}

function normalizeStatusType(value: unknown): StatusType | null {
	if (typeof value !== "string") return null;
	if (
		value === "backlog" ||
		value === "unstarted" ||
		value === "started" ||
		value === "completed" ||
		value === "canceled"
	) {
		return value;
	}
	return null;
}

export function ListTaskStatusesToolCall({
	part,
}: ListTaskStatusesToolCallProps) {
	const result = getResult(part);
	const resultData =
		typeof result.result === "object" && result.result !== null
			? (result.result as Record<string, unknown>)
			: result;
	const statuses = Array.isArray(resultData.statuses)
		? resultData.statuses.filter(
				(item): item is Record<string, unknown> =>
					typeof item === "object" && item !== null,
			)
		: [];

	return (
		<SupersetToolCall
			part={part}
			toolName="List task statuses"
			icon={ListChecksIcon}
			details={
				<div className="space-y-2">
					<div className="text-muted-foreground">
						Statuses: {statuses.length}
					</div>
					{statuses.length > 0 ? (
						<div className="space-y-1">
							{statuses.map((status, index) => {
								const name =
									typeof status.name === "string"
										? status.name
										: `Status ${index + 1}`;
								const statusId =
									typeof status.id === "string" ? status.id : null;
								const type =
									typeof status.type === "string" ? status.type : null;
								const color =
									typeof status.color === "string" ? status.color : null;
								const position =
									typeof status.position === "number"
										? String(status.position)
										: null;
								const statusType = normalizeStatusType(type);
								const statusColor = color ?? "#9ca3af";

								return (
									<div
										key={statusId ?? `${name}-${type ?? "unknown"}`}
										className="rounded border bg-background/70 px-2 py-1"
									>
										<TaskItem className="space-y-1 text-xs">
											<div className="flex items-center gap-1.5">
												{statusType ? (
													<StatusIcon type={statusType} color={statusColor} />
												) : (
													<div
														className="h-3.5 w-3.5 rounded-full"
														style={{ backgroundColor: statusColor }}
													/>
												)}
												<div className="font-medium text-foreground">
													{name}
												</div>
											</div>
											<div className="flex flex-wrap gap-1">
												{type ? (
													<TaskItemFile>Type: {type}</TaskItemFile>
												) : null}
												{color ? (
													<TaskItemFile>Color: {color}</TaskItemFile>
												) : null}
												{position ? (
													<TaskItemFile>Position: {position}</TaskItemFile>
												) : null}
											</div>
										</TaskItem>
									</div>
								);
							})}
						</div>
					) : (
						<div className="text-muted-foreground">No statuses in result.</div>
					)}
				</div>
			}
		/>
	);
}
