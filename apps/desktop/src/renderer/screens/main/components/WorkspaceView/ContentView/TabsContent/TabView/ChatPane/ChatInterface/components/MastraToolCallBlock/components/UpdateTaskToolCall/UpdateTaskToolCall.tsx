import { useNavigate } from "@tanstack/react-router";
import { FilePenIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getArgs, getResult } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

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
	const requestedCount = Array.isArray(args.updates) ? args.updates.length : 0;

	return (
		<SupersetToolCall
			part={part}
			toolName="Update task"
			icon={FilePenIcon}
			details={
				<div className="space-y-2">
					<div className="text-muted-foreground">
						Requested: {requestedCount} update{requestedCount === 1 ? "" : "s"}
					</div>
					{updated.length > 0 ? (
						<div className="space-y-1">
							<div className="font-medium text-foreground">
								Updated ({updated.length})
							</div>
							<div className="space-y-1">
								{updated.map((task, index) => {
									const update = updates[index] ?? null;
									const title =
										typeof task.title === "string" ? task.title : "Updated task";
									const slug = typeof task.slug === "string" ? task.slug : null;
									const taskId =
										typeof task.id === "string"
											? task.id
											: typeof update?.taskId === "string"
												? update.taskId
												: null;
									const openTaskId = taskId ?? slug;
									const changedFields = update
										? Object.entries(update).filter(
												([key, value]) =>
													key !== "taskId" && value !== undefined && value !== null,
											)
										: [];
									const labels = toStringArray(update?.labels);
									return (
										<button
											key={`${title}-${slug ?? index}`}
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
											{changedFields.length > 0 ? (
												<div className="mt-1 flex flex-wrap gap-1">
													{changedFields.map(([key, value]) => (
														<span
															key={key}
															className="rounded border bg-muted/30 px-1.5 py-0.5 text-muted-foreground"
														>
															{key}:{" "}
															{Array.isArray(value)
																? value.map((item) => String(item)).join(", ")
																: String(value)}
														</span>
													))}
												</div>
											) : null}
											{labels.length > 0 ? (
												<div className="mt-1 text-muted-foreground">
													labels: {labels.join(", ")}
												</div>
											) : null}
										</button>
									);
								})}
							</div>
						</div>
					) : (
						<div className="text-muted-foreground">No updated tasks in result.</div>
					)}
				</div>
			}
		/>
	);
}
