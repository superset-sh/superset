import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { cn } from "@superset/ui/lib/utils";
import { useState } from "react";
import { MarkdownToggleContent } from "../../../../../../components/MarkdownToggleContent";
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
	const [markdownBySubagent, setMarkdownBySubagent] = useState<
		Record<string, boolean>
	>({});
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
						<div className="text-xs text-muted-foreground">
							{subagent.agentType}
							{subagent.modelId ? ` • ${subagent.modelId}` : ""}
							{subagent.durationMs !== undefined
								? ` • ${Math.round(subagent.durationMs)} ms`
								: ""}
						</div>
						{subagent.text ? (
							<MarkdownToggleContent
								toggleId={`subagent-markdown-${subagent.toolCallId}`}
								checked={markdownBySubagent[subagent.toolCallId] ?? true}
								onCheckedChange={(checked) =>
									setMarkdownBySubagent((previous) => ({
										...previous,
										[subagent.toolCallId]: checked,
									}))
								}
								content={subagent.text}
								labelClassName="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
								markdownContainerClassName="max-h-[32rem] overflow-auto rounded border bg-background/80 p-2"
								plainContainerClassName="max-h-[32rem] overflow-auto rounded border bg-background/80 p-2 text-xs whitespace-pre-wrap break-words"
							/>
						) : null}
						{subagent.toolCalls.length > 0 ? (
							<div className="flex flex-wrap items-center gap-1.5">
								{subagent.toolCalls.map((tool, index) => (
									<span
										key={`${subagent.toolCallId}-${tool.name}-${index}`}
										className={cn(
											"rounded-full border px-2 py-0.5 text-xs",
											tool.isError
												? "border-destructive/40 bg-destructive/10 text-destructive"
												: "border-muted-foreground/30 bg-background/80 text-muted-foreground",
										)}
									>
										{tool.name}
									</span>
								))}
							</div>
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
