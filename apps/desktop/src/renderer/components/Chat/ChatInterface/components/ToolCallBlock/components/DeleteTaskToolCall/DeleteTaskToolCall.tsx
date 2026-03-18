import { useNavigate } from "@tanstack/react-router";
import { FileXIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getResult } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";
import { TaskItemDisplay } from "../TaskItemDisplay";

interface DeleteTaskToolCallProps {
	part: ToolPart;
}

export function DeleteTaskToolCall({ part }: DeleteTaskToolCallProps) {
	const navigate = useNavigate();
	const result = getResult(part);
	const resultData =
		typeof result.result === "object" && result.result !== null
			? (result.result as Record<string, unknown>)
			: result;
	const deleted = Array.isArray(resultData.deleted)
		? resultData.deleted.map((item) => String(item))
		: [];

	return (
		<SupersetToolCall
			part={part}
			toolName="Delete task"
			icon={FileXIcon}
			details={
				<div className="space-y-2">
					{deleted.length > 0 ? (
						<div className="space-y-1">
							<div className="font-medium text-foreground">
								Deleted ({deleted.length})
							</div>
							<div className="space-y-1">
								{deleted.map((taskId) => (
									<TaskItemDisplay
										key={taskId}
										status="Deleted"
										taskId={taskId}
										title="Deleted task"
										onClick={() =>
											navigate({
												to: "/tasks/$taskId",
												params: { taskId },
											})
										}
									/>
								))}
							</div>
						</div>
					) : (
						<div className="text-muted-foreground">
							No deleted tasks in result.
						</div>
					)}
				</div>
			}
		/>
	);
}
