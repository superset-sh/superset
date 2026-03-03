import { ClipboardListIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getArgs, getResult } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface ListTasksToolCallProps {
	part: ToolPart;
}

export function ListTasksToolCall({ part }: ListTasksToolCallProps) {
	const args = getArgs(part);
	const result = getResult(part);
	const resultData =
		typeof result.result === "object" && result.result !== null
			? (result.result as Record<string, unknown>)
			: result;
	const tasks = Array.isArray(resultData.tasks)
		? resultData.tasks.filter(
				(item): item is Record<string, unknown> =>
					typeof item === "object" && item !== null,
			)
		: [];
	const count =
		typeof resultData.count === "number"
			? resultData.count
			: typeof resultData.total === "number"
				? resultData.total
				: tasks.length;
	const hasMore = resultData.hasMore === true;
	const filterEntries = Object.entries(args).filter(([, value]) => {
		if (value === null || value === undefined) return false;
		if (typeof value === "string") return value.trim().length > 0;
		if (Array.isArray(value)) return value.length > 0;
		return true;
	});

	return (
		<GenericToolCall
			part={part}
			toolName="List tasks"
			icon={ClipboardListIcon}
			expandedContent={
				<div className="space-y-2">
					<div className="text-muted-foreground">
						Found: {count} task{count === 1 ? "" : "s"}
						{hasMore ? " (more available)" : ""}
					</div>
					{filterEntries.length > 0 ? (
						<div className="flex flex-wrap gap-1">
							{filterEntries.map(([key, value]) => (
								<span
									key={key}
									className="rounded border bg-background/70 px-1.5 py-0.5 text-muted-foreground"
								>
									{key}:{" "}
									{Array.isArray(value)
										? value.join(", ")
										: typeof value === "boolean"
											? value
												? "true"
												: "false"
											: String(value)}
								</span>
							))}
						</div>
					) : null}
					{tasks.length > 0 ? (
						<div className="space-y-1">
							{tasks.slice(0, 6).map((task, index) => {
								const title =
									typeof task.title === "string" ? task.title : "Untitled task";
								const status =
									typeof task.statusName === "string" ? task.statusName : null;
								const priority =
									typeof task.priority === "string" ? task.priority : null;
								return (
									<div
										key={`${title}-${index}`}
										className="rounded border bg-background/70 px-2 py-1"
									>
										<div className="font-medium text-foreground">{title}</div>
										<div className="text-muted-foreground">
											{status ? `Status: ${status}` : "Status: unknown"}
											{priority ? ` • Priority: ${priority}` : ""}
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<div className="text-muted-foreground">No tasks in result.</div>
					)}
				</div>
			}
		/>
	);
}
