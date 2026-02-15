import { ExploringGroup } from "@superset/ui/ai-elements/exploring-group";
import { MessageResponse } from "@superset/ui/ai-elements/message";
import {
	FileIcon,
	FileSearchIcon,
	FolderTreeIcon,
	SearchIcon,
} from "lucide-react";
import type React from "react";
import { READ_ONLY_TOOLS } from "../../constants";
import type { MessagePart, ToolCallPart } from "../../types";
import { getArgs } from "../../utils/tool-helpers";
import { AgentCallBlock } from "../AgentCallBlock";
import { MastraToolCallBlock } from "../MastraToolCallBlock";
import { ReadOnlyToolCall } from "../ReadOnlyToolCall";

interface MessagePartsRendererProps {
	parts: MessagePart[];
	isLastAssistant: boolean;
	isStreaming: boolean;
	onAnswer?: (toolCallId: string, answers: Record<string, string>) => void;
}

export function MessagePartsRenderer({
	parts,
	isLastAssistant,
	isStreaming,
	onAnswer,
}: MessagePartsRendererProps): React.ReactNode[] {
	const renderParts = ({
		parts,
		isLastAssistant,
	}: {
		parts: MessagePart[];
		isLastAssistant: boolean;
	}): React.ReactNode[] => {
		const nodes: React.ReactNode[] = [];
		let i = 0;

		while (i < parts.length) {
			const part = parts[i];

			if (part.type === "text") {
				nodes.push(
					<MessageResponse key={i} isAnimating={isLastAssistant && isStreaming}>
						{part.text}
					</MessageResponse>,
				);
				i++;
				continue;
			}

			if (part.type === "agent-call") {
				nodes.push(
					<AgentCallBlock
						key={part.toolCallId}
						part={part}
						isStreaming={isStreaming}
						renderParts={renderParts}
					/>,
				);
				i++;
				continue;
			}

			if (part.type === "tool-call") {
				// Group consecutive read-only tools into ExploringGroup
				if (READ_ONLY_TOOLS.has(part.toolName)) {
					const groupStart = i;
					const groupParts: ToolCallPart[] = [];
					while (
						i < parts.length &&
						parts[i].type === "tool-call" &&
						READ_ONLY_TOOLS.has((parts[i] as ToolCallPart).toolName)
					) {
						groupParts.push(parts[i] as ToolCallPart);
						i++;
					}

					// Single read-only tool: render inline without group wrapper
					if (groupParts.length === 1) {
						nodes.push(
							<ReadOnlyToolCall
								key={groupParts[0].toolCallId}
								part={groupParts[0]}
							/>,
						);
						continue;
					}

					// Multiple consecutive read-only tools: group them
					const anyPending = groupParts.some((p) => p.status !== "done");
					const exploringItems = groupParts.map((p) => {
						const args = getArgs(p);
						let title = "Read";
						let subtitle = "";
						let icon = FileIcon;
						switch (p.toolName) {
							case "mastra_workspace_read_file":
								title = p.status !== "done" ? "Reading" : "Read";
								subtitle = String(args.path ?? args.filePath ?? "");
								icon = FileIcon;
								break;
							case "mastra_workspace_list_files":
								title = p.status !== "done" ? "Listing" : "Listed";
								subtitle = String(args.path ?? args.directory ?? "");
								icon = FolderTreeIcon;
								break;
							case "mastra_workspace_file_stat":
								title = p.status !== "done" ? "Checking" : "Checked";
								subtitle = String(args.path ?? "");
								icon = FileSearchIcon;
								break;
							case "mastra_workspace_search":
								title = p.status !== "done" ? "Searching" : "Searched";
								subtitle = String(args.query ?? args.pattern ?? "");
								icon = SearchIcon;
								break;
							case "mastra_workspace_index":
								title = p.status !== "done" ? "Indexing" : "Indexed";
								icon = SearchIcon;
								break;
							default:
								title = p.toolName.replace("mastra_workspace_", "");
								icon = FileIcon;
								break;
						}
						// Show just filename for long paths
						if (subtitle.includes("/")) {
							subtitle = subtitle.split("/").pop() ?? subtitle;
						}
						return {
							icon,
							title,
							subtitle,
							isPending: p.status !== "done",
							isError: !!p.isError,
						};
					});

					nodes.push(
						<ExploringGroup
							key={`explore-${groupStart}`}
							items={exploringItems}
							isStreaming={anyPending && isLastAssistant && isStreaming}
						/>,
					);
					continue;
				}

				// Non-read-only tool: render as BashTool/FileDiffTool/WebSearch/etc.
				nodes.push(
					<MastraToolCallBlock
						key={part.toolCallId}
						part={part}
						onAnswer={onAnswer}
					/>,
				);
				i++;
				continue;
			}

			// Unknown part type
			i++;
		}

		return nodes;
	};

	return renderParts({ parts, isLastAssistant });
}
