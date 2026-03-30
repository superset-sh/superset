import { MessageResponse } from "@superset/ui/ai-elements/message";
import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import { cn } from "@superset/ui/lib/utils";
import { BotIcon } from "lucide-react";
import { useMemo } from "react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { parseSubagentToolResult } from "./utils/parseSubagentToolResult";

interface SubagentToolCallProps {
	part: ToolPart;
	args: Record<string, unknown>;
	result: Record<string, unknown>;
}

function asString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function SubagentToolCall({
	part,
	args,
	result,
}: SubagentToolCallProps) {
	const isPending =
		part.state !== "output-available" && part.state !== "output-error";
	const isError =
		part.state === "output-error" ||
		result.isError === true ||
		(asString(result.error) ?? "").length > 0;
	const task = asString(args.task) ?? "Running subagent task...";
	const agentType = asString(args.agentType) ?? "subagent";
	const parsed = useMemo(() => parseSubagentToolResult(result), [result]);

	const hasDetails =
		task.length > 0 ||
		parsed.text.length > 0 ||
		parsed.tools.length > 0 ||
		Boolean(parsed.modelId) ||
		parsed.durationMs !== undefined;

	// Title: "Agent" (foreground) — agentType goes in description (muted)
	const titleNode = (
		<span className="shrink-0 font-medium text-xs">
			<span className="text-foreground">Agent</span>{" "}
			<span className="text-muted-foreground">{agentType}</span>
		</span>
	);

	return (
		<ToolCallRow
			icon={BotIcon}
			isError={isError}
			isPending={isPending}
			title={titleNode}
		>
			{hasDetails ? (
				<div className="space-y-2 pl-2 text-xs">
					<div className="font-medium text-foreground">{task}</div>
					<div className="text-muted-foreground">
						{agentType}
						{parsed.modelId ? ` • ${parsed.modelId}` : ""}
						{parsed.durationMs !== undefined
							? ` • ${Math.round(parsed.durationMs)} ms`
							: ""}
					</div>
					{parsed.tools.length > 0 ? (
						<div className="flex flex-wrap gap-1.5">
							{parsed.tools.map((tool, index) => (
								<span
									key={`${tool.name}-${index}`}
									className={cn(
										"rounded-full border px-2 py-0.5",
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
					{parsed.text ? (
						<div className="max-h-[32rem] overflow-auto rounded border bg-background/80 p-2">
							<MessageResponse
								animated={false}
								isAnimating={false}
								mermaid={{ config: { theme: "default" } }}
							>
								{parsed.text}
							</MessageResponse>
						</div>
					) : null}
				</div>
			) : undefined}
		</ToolCallRow>
	);
}
