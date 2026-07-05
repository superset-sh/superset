import {
	Message,
	MessageContent,
	MessageResponse,
} from "@superset/ui/ai-elements/message";
import { cn } from "@superset/ui/lib/utils";
import { SubagentInnerToolCall } from "renderer/components/Chat/components/SubagentInnerToolCall";
import {
	type SubagentEntries,
	toSubagentViewModels,
} from "./utils/toSubagentViewModels";

interface SubagentExecutionMessageProps {
	subagents: SubagentEntries;
	inline?: boolean;
}

function getStatusLabel(status: "running" | "completed" | "error"): string {
	if (status === "running") return "Running";
	if (status === "completed") return "Completed";
	return "Failed";
}

function getStatusClassName(status: "running" | "completed" | "error"): string {
	if (status === "running") {
		return "border-primary/40 bg-primary/10 text-primary";
	}
	if (status === "completed") {
		return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
	}
	return "border-destructive/40 bg-destructive/10 text-destructive";
}

export function SubagentExecutionMessage({
	subagents,
	inline = false,
}: SubagentExecutionMessageProps) {
	if (subagents.length === 0) return null;
	const viewModels = toSubagentViewModels(subagents);

	const content = (
		<div className="w-full max-w-none space-y-3 rounded-xl border bg-card/95 p-3">
			<div className="text-sm font-medium text-foreground">
				Subagent activity
			</div>
			<div className="space-y-3">
				{viewModels.map((subagent) => (
					<div
						key={subagent.toolCallId}
						className="space-y-2 rounded-md border bg-muted/20 p-3"
					>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="text-sm font-medium text-foreground">
								{subagent.task}
							</div>
							<span
								className={cn(
									"rounded-full border px-2 py-0.5 text-xs font-medium",
									getStatusClassName(subagent.status),
								)}
							>
								{getStatusLabel(subagent.status)}
							</span>
						</div>
						{subagent.toolCalls.length > 0 ? (
							<div className="space-y-1">
								{subagent.toolCalls.map((tool, index) => (
									<SubagentInnerToolCall
										key={`${subagent.toolCallId}-${tool.name}-${index}`}
										name={tool.name}
										isError={tool.isError}
										isPending={
											subagent.status === "running" &&
											index === subagent.toolCalls.length - 1
										}
										args={tool.args}
										result={tool.result}
									/>
								))}
							</div>
						) : null}
						{subagent.text ? (
							<MessageResponse
								animated={false}
								isAnimating={false}
								mermaid={{ config: { theme: "default" } }}
							>
								{subagent.text}
							</MessageResponse>
						) : null}
					</div>
				))}
			</div>
		</div>
	);

	if (inline) return content;

	return (
		<Message from="assistant">
			<MessageContent>{content}</MessageContent>
		</Message>
	);
}
