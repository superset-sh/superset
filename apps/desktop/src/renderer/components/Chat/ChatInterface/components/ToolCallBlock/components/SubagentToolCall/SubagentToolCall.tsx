import { MessageResponse } from "@superset/ui/ai-elements/message";
import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import { BotIcon } from "lucide-react";
import { useMemo } from "react";
import { SubagentInnerToolCall } from "renderer/components/Chat/components/SubagentInnerToolCall";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { parseSubagentToolResult } from "./utils/parseSubagentToolResult";

// Scale headings and fix list layout for the compact xs context.
// [&_h*] selectors (specificity 0-1-1) beat Streamdown's direct element
// classes (0-1-0) so no !important needed.
const mdClassName =
	"[&_h1]:text-sm [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-0.5 " +
	"[&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-0.5 " +
	"[&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-0 " +
	"[&_h4]:text-xs [&_h4]:font-semibold " +
	"[&_h5]:text-xs [&_h5]:font-medium " +
	"[&_h6]:text-xs [&_h6]:font-medium " +
	"[&_li>p:first-child]:mt-0";

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
		parsed.tools.length > 0;

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
					<MessageResponse
						animated={false}
						className={`font-medium ${mdClassName}`}
						isAnimating={false}
						mermaid={{ config: { theme: "default" } }}
					>
						{task}
					</MessageResponse>
					{parsed.tools.length > 0 ? (
						<div className="space-y-1">
							{parsed.tools.map((tool, index) => (
								<SubagentInnerToolCall
									key={`${tool.name}-${index}`}
									name={tool.name}
									isError={tool.isError}
									args={tool.args}
									result={tool.result}
								/>
							))}
						</div>
					) : null}
					{parsed.text ? (
						<MessageResponse
							animated={false}
							className={`${mdClassName} [&_[data-streamdown=table-header-cell]]:px-2.5 [&_[data-streamdown=table-header-cell]]:py-1.5 [&_[data-streamdown=table-header-cell]]:text-xs [&_[data-streamdown=table-cell]]:px-2.5 [&_[data-streamdown=table-cell]]:py-1.5 [&_[data-streamdown=table-cell]]:text-xs`}
							isAnimating={false}
							mermaid={{ config: { theme: "default" } }}
						>
							{parsed.text}
						</MessageResponse>
					) : null}
				</div>
			) : undefined}
		</ToolCallRow>
	);
}
