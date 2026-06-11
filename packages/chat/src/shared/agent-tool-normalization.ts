export type AgentToolKind =
	| "shell"
	| "read"
	| "edit"
	| "write"
	| "search"
	| "fetch"
	| "subagent"
	| "skill"
	| "unknown";

export interface AgentToolClassification {
	rawName: string;
	canonicalName: string;
	kind: AgentToolKind;
	displayName: string;
	isKnownDisplayTool: boolean;
}

const DISPLAY_TOOL_DEFINITIONS = {
	mastra_workspace_execute_command: {
		kind: "shell",
		displayName: "Shell",
	},
	mastra_workspace_read_file: {
		kind: "read",
		displayName: "Read",
	},
	mastra_workspace_write_file: {
		kind: "write",
		displayName: "Write",
	},
	mastra_workspace_edit_file: {
		kind: "edit",
		displayName: "Edit",
	},
	mastra_workspace_search: {
		kind: "search",
		displayName: "Search",
	},
	mastra_workspace_list_files: {
		kind: "search",
		displayName: "Search Files",
	},
	web_fetch: {
		kind: "fetch",
		displayName: "Fetch",
	},
	web_search: {
		kind: "fetch",
		displayName: "Web Search",
	},
	subagent: {
		kind: "subagent",
		displayName: "Subagent",
	},
	skill: {
		kind: "skill",
		displayName: "Skill",
	},
	ast_smart_edit: {
		kind: "edit",
		displayName: "Edit",
	},
} as const satisfies Record<
	string,
	{ kind: Exclude<AgentToolKind, "unknown">; displayName: string }
>;

const TOOL_NAME_ALIASES: Record<string, string> = {
	Bash: "mastra_workspace_execute_command",
	bash: "mastra_workspace_execute_command",
	Read: "mastra_workspace_read_file",
	read: "mastra_workspace_read_file",
	Write: "mastra_workspace_write_file",
	write: "mastra_workspace_write_file",
	Edit: "mastra_workspace_edit_file",
	edit: "mastra_workspace_edit_file",
	MultiEdit: "mastra_workspace_edit_file",
	Grep: "mastra_workspace_search",
	grep: "mastra_workspace_search",
	Glob: "mastra_workspace_list_files",
	glob: "mastra_workspace_list_files",
	LS: "mastra_workspace_list_files",
	WebFetch: "web_fetch",
	WebSearch: "web_search",
	Task: "subagent",
	Skill: "skill",

	execute_command: "mastra_workspace_execute_command",
	run_command: "mastra_workspace_execute_command",
	run_terminal_cmd: "mastra_workspace_execute_command",
	local_bash: "mastra_workspace_execute_command",
	local_shell: "mastra_workspace_execute_command",
	local_command: "mastra_workspace_execute_command",
	write_file: "mastra_workspace_write_file",
	string_replace_lsp: "mastra_workspace_edit_file",
	edit_file: "mastra_workspace_edit_file",
	read_file: "mastra_workspace_read_file",
	view: "mastra_workspace_read_file",
	list_files: "mastra_workspace_list_files",
	find_files: "mastra_workspace_list_files",
	file_stat: "mastra_workspace_file_stat",
	search: "mastra_workspace_search",
	search_content: "mastra_workspace_search",
	index: "mastra_workspace_index",
	mkdir: "mastra_workspace_mkdir",
	delete: "mastra_workspace_delete",
	web_extract: "web_fetch",
	ask_user: "ask_user_question",

	ast_smart_edit: "ast_smart_edit",
	request_access: "request_access",
	request_sandbox_access: "request_access",
	task_write: "task_write",
	task_check: "task_check",
	submit_plan: "submit_plan",
	lsp_inspect: "lsp_inspect",
	mastra_workspace_lsp_inspect: "lsp_inspect",
	create_worktree: "create_workspace",
	start_claude_session: "start_agent_session",
};

function humanizeToolName(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return name;
	return trimmed
		.replace(/^mastra_workspace_/, "")
		.replaceAll("_", " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normalizeAgentToolName(toolName: string): string {
	const directAlias = TOOL_NAME_ALIASES[toolName];
	if (directAlias) return directAlias;

	const unnamespacedToolName = toolName.startsWith("superset_")
		? toolName.slice("superset_".length)
		: toolName;
	return TOOL_NAME_ALIASES[unnamespacedToolName] ?? unnamespacedToolName;
}

export function classifyAgentToolName(
	toolName: string,
): AgentToolClassification {
	const canonicalName = normalizeAgentToolName(toolName);
	const definition =
		DISPLAY_TOOL_DEFINITIONS[
			canonicalName as keyof typeof DISPLAY_TOOL_DEFINITIONS
		];
	if (definition) {
		return {
			rawName: toolName,
			canonicalName,
			kind: definition.kind,
			displayName: definition.displayName,
			isKnownDisplayTool: true,
		};
	}
	return {
		rawName: toolName,
		canonicalName,
		kind: "unknown",
		displayName: humanizeToolName(canonicalName || toolName || "tool"),
		isKnownDisplayTool: false,
	};
}

export function isKnownAgentDisplayToolName(toolName: string): boolean {
	return classifyAgentToolName(toolName).isKnownDisplayTool;
}
