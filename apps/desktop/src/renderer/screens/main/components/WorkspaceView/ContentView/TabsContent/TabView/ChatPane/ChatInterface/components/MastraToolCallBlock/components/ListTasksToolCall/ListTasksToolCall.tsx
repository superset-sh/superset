import { useNavigate } from "@tanstack/react-router";
import { ClipboardListIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getArgs, getResult } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface ListTasksToolCallProps {
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

export function ListTasksToolCall({ part }: ListTasksToolCallProps) {
	const navigate = useNavigate();
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
		<SupersetToolCall
			part={part}
			toolName="List tasks"
			icon={ClipboardListIcon}
			details={
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
								const taskId =
									typeof task.id === "string" ? task.id : null;
								const slug =
									typeof task.slug === "string" ? task.slug : null;
								const openTaskId = taskId ?? slug;
								const title =
									typeof task.title === "string" ? task.title : "Untitled task";
								const status =
									typeof task.statusName === "string" ? task.statusName : null;
								const priority =
									typeof task.priority === "string" ? task.priority : null;
								const assignee =
									typeof task.assigneeName === "string" ? task.assigneeName : null;
								const dueDate = formatDate(task.dueDate);
								const estimate =
									typeof task.estimate === "number" ? String(task.estimate) : null;
								const labels = toStringArray(task.labels);
								const description =
									typeof task.description === "string" ? task.description : null;
								return (
									<button
										key={`${taskId ?? slug ?? title}-${index}`}
										className="w-full rounded border bg-background/70 px-2 py-1 text-left transition-colors hover:bg-muted/20"
										type="button"
										onClick={() =>
											openTaskId
												? navigate({
														to: "/tasks/$taskId",
														params: { taskId: openTaskId },
													})
												: undefined
										}
									>
										<div className="font-medium text-foreground">{title}</div>
										<div className="text-muted-foreground">
											{slug ? `#${slug}` : null}
											{taskId ? ` • ${taskId}` : null}
										</div>
										<div className="text-muted-foreground">
											{status ? `Status: ${status}` : "Status: unknown"}
											{priority ? ` • Priority: ${priority}` : ""}
											{assignee ? ` • Assignee: ${assignee}` : ""}
											{dueDate ? ` • Due: ${dueDate}` : ""}
											{estimate ? ` • Estimate: ${estimate}` : ""}
										</div>
										{labels.length > 0 ? (
											<div className="mt-1 flex flex-wrap gap-1">
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
											<div className="mt-1 line-clamp-2 text-muted-foreground">
												{description}
											</div>
										) : null}
									</button>
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
