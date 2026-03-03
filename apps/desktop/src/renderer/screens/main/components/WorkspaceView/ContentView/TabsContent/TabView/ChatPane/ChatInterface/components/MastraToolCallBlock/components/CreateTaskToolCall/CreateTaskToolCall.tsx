import { FilePlusIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getArgs, getResult } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface CreateTaskToolCallProps {
	part: ToolPart;
}

export function CreateTaskToolCall({ part }: CreateTaskToolCallProps) {
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
	const requestedCount = Array.isArray(args.tasks)
		? args.tasks.length
		: typeof args.title === "string"
			? 1
			: 0;

	return (
		<GenericToolCall
			part={part}
			toolName="Create task"
			icon={FilePlusIcon}
			expandedContent={
				<div className="space-y-2">
					<div className="text-muted-foreground">
						Requested: {requestedCount} task{requestedCount === 1 ? "" : "s"}
					</div>
					{created.length > 0 ? (
						<div className="space-y-1">
							<div className="font-medium text-foreground">
								Created ({created.length})
							</div>
							<div className="space-y-1">
								{created.map((task, index) => {
									const title =
										typeof task.title === "string" ? task.title : "Untitled task";
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
						<div className="text-muted-foreground">No created tasks in result.</div>
					)}
				</div>
			}
			showRawJson={false}
		/>
	);
}
