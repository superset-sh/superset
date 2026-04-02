import {
	MessageResponse,
	TOOL_CALL_MD_CLASSNAME,
} from "@superset/ui/ai-elements/message";
import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import { BotIcon } from "lucide-react";
import { useMemo } from "react";
import { SubagentInnerToolCall } from "renderer/components/Chat/components/SubagentInnerToolCall";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { parseSubagentToolResult } from "./utils/parseSubagentToolResult";

interface SubagentToolCallProps {
	part: ToolPart;
	args: Record<string, unknown>;
	result: Record<string, unknown>;
	workspaceId?: string;
	workspaceCwd?: string;
	onOpenFileInPane?: (filePath: string) => void;
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
	workspaceId,
	workspaceCwd,
	onOpenFileInPane,
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
		task.length > 0 || parsed.text.length > 0 || parsed.tools.length > 0;

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
						className={`font-medium ${TOOL_CALL_MD_CLASSNAME}`}
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
									workspaceId={workspaceId}
									workspaceCwd={workspaceCwd}
									onOpenFileInPane={onOpenFileInPane}
								/>
							))}
						</div>
					) : null}
					{parsed.text ? (
						<MessageResponse
							animated={false}
							className={`${TOOL_CALL_MD_CLASSNAME} [&_[data-streamdown=table-header-cell]]:px-2.5 [&_[data-streamdown=table-header-cell]]:py-1.5 [&_[data-streamdown=table-header-cell]]:text-xs [&_[data-streamdown=table-cell]]:px-2.5 [&_[data-streamdown=table-cell]]:py-1.5 [&_[data-streamdown=table-cell]]:text-xs`}
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
