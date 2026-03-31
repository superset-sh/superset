import { BashTool } from "@superset/ui/ai-elements/bash-tool";
import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import {
	CodeIcon,
	FileIcon,
	FileTextIcon,
	FolderIcon,
	GlobeIcon,
	SearchIcon,
	TerminalIcon,
	WrenchIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { getExecuteCommandViewModel } from "renderer/components/Chat/ChatInterface/components/ToolCallBlock/utils/getExecuteCommandViewModel";
import { normalizeToolName } from "renderer/components/Chat/ChatInterface/utils/tool-helpers";

interface SubagentInnerToolCallProps {
	name: string;
	isError: boolean;
	isPending?: boolean;
	args: Record<string, unknown> | null;
	result: string | null;
}

interface ToolMeta {
	label: string;
	icon: ComponentType<{ className?: string }>;
}

const TOOL_META: Record<string, ToolMeta> = {
	mastra_workspace_execute_command: {
		label: "Bash",
		icon: TerminalIcon,
	},
	mastra_workspace_write_file: { label: "Write", icon: FileIcon },
	mastra_workspace_edit_file: { label: "Edit", icon: FileTextIcon },
	mastra_workspace_read_file: { label: "Read", icon: FileTextIcon },
	mastra_workspace_list_files: { label: "List Files", icon: FolderIcon },
	mastra_workspace_search: { label: "Search", icon: SearchIcon },
	mastra_workspace_mkdir: { label: "Create Directory", icon: FolderIcon },
	mastra_workspace_delete: { label: "Delete", icon: FileIcon },
	ast_smart_edit: { label: "Smart Edit", icon: CodeIcon },
	web_fetch: { label: "Web Fetch", icon: GlobeIcon },
	web_search: { label: "Web Search", icon: GlobeIcon },
};

function getToolMeta(toolName: string): ToolMeta {
	return (
		TOOL_META[toolName] ?? {
			label: toolName.replaceAll("_", " "),
			icon: WrenchIcon,
		}
	);
}

export function SubagentInnerToolCall({
	name,
	isError,
	isPending = false,
	args,
	result,
}: SubagentInnerToolCallProps) {
	const normalized = normalizeToolName(name);
	const state = isPending
		? ("input-available" as const)
		: isError
			? ("output-error" as const)
			: ("output-available" as const);

	if (normalized === "mastra_workspace_execute_command") {
		const argsRecord = args ?? {};
		const resultRecord = result !== null ? { content: result } : {};
		const { command, stdout, stderr, exitCode } = getExecuteCommandViewModel({
			args: argsRecord,
			result: resultRecord,
		});
		return (
			<BashTool
				command={command}
				stdout={stdout}
				stderr={stderr}
				exitCode={exitCode}
				state={state}
			/>
		);
	}

	const { label, icon } = getToolMeta(normalized);
	return (
		<ToolCallRow
			icon={icon}
			isError={isError}
			isPending={isPending}
			title={label}
		/>
	);
}
