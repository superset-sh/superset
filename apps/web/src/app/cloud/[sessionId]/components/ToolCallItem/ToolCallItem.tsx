"use client";

import { LuChevronRight } from "react-icons/lu";

import type { CloudEvent } from "../../hooks";
import { formatToolCall } from "../../lib/tool-formatters";
import { ToolIcon } from "../ToolIcon";

interface ToolCallItemProps {
	event: CloudEvent;
	isExpanded: boolean;
	onToggle: () => void;
	showTime?: boolean;
}

export function ToolCallItem({
	event,
	isExpanded,
	onToggle,
	showTime = true,
}: ToolCallItemProps) {
	const formatted = formatToolCall(event);
	const time = new Date(event.timestamp).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});

	const { args, output } = formatted.getDetails();

	return (
		<div className="py-0.5">
			<button
				onClick={onToggle}
				className="w-full flex items-center gap-1.5 text-sm text-left text-muted-foreground hover:text-foreground transition-colors"
			>
				<LuChevronRight
					className={`size-3.5 transition-transform duration-200 ${
						isExpanded ? "rotate-90" : ""
					}`}
				/>
				<ToolIcon name={formatted.icon} />
				<span className="truncate">
					{formatted.toolName}{" "}
					<span className="text-muted-foreground/70">{formatted.summary}</span>
				</span>
				{showTime && (
					<span className="text-xs text-muted-foreground/50 flex-shrink-0 ml-auto">
						{time}
					</span>
				)}
			</button>

			{isExpanded && (
				<div className="mt-2 ml-5 p-3 bg-muted/50 border rounded text-xs overflow-hidden">
					{args && Object.keys(args).length > 0 && (
						<div className="mb-2">
							<div className="text-muted-foreground mb-1 font-medium">
								Arguments:
							</div>
							<pre className="overflow-x-auto text-foreground whitespace-pre-wrap text-xs">
								{JSON.stringify(args, null, 2)}
							</pre>
						</div>
					)}
					{output && (
						<div>
							<div className="text-muted-foreground mb-1 font-medium">
								Output:
							</div>
							<pre className="overflow-x-auto max-h-48 text-foreground whitespace-pre-wrap text-xs overflow-y-auto">
								{output}
							</pre>
						</div>
					)}
					{!args && !output && (
						<span className="text-muted-foreground">No details available</span>
					)}
				</div>
			)}
		</div>
	);
}
