import { FilePenIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getArgs, getResult } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface UpdateTaskToolCallProps {
	part: ToolPart;
}

export function UpdateTaskToolCall({ part }: UpdateTaskToolCallProps) {
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
									const title =
										typeof task.title === "string" ? task.title : "Updated task";
									const slug = typeof task.slug === "string" ? task.slug : null;
									return (
										<div
											key={`${title}-${slug ?? index}`}
											className="rounded border bg-background/70 px-2 py-1"
										>
											<div className="font-medium text-foreground">{title}</div>
											{slug ? (
												<div className="text-muted-foreground">{slug}</div>
											) : null}
										</div>
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
