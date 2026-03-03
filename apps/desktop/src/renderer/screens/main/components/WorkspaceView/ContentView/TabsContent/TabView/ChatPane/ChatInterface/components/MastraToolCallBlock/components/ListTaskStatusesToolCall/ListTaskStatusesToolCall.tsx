import { ListChecksIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getResult } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface ListTaskStatusesToolCallProps {
	part: ToolPart;
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
								const type =
									typeof status.type === "string" ? status.type : null;
								const color =
									typeof status.color === "string" ? status.color : null;
								return (
									<div
										key={`${name}-${index}`}
										className="rounded border bg-background/70 px-2 py-1"
									>
										<div className="font-medium text-foreground">{name}</div>
										<div className="text-muted-foreground">
											{type ? `Type: ${type}` : "Type: unknown"}
											{color ? ` • ${color}` : ""}
										</div>
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
