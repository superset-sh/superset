import {
	EyeIcon,
	FileCode2Icon,
	FilePlusIcon,
	FolderSearchIcon,
	GlobeIcon,
	ListIcon,
	PencilIcon,
	PlusIcon,
	RefreshCwIcon,
	SearchIcon,
	ServerIcon,
	SparklesIcon,
	TerminalIcon,
	WrenchIcon,
	XCircleIcon,
} from "lucide-react";
import type { ComponentType } from "react";

type ToolArgs = Record<string, unknown>;

export type ToolMeta = {
	icon: ComponentType<{ className?: string }>;
	title: (args: ToolArgs, output: ToolArgs, state: string) => string;
	subtitle?: (
		args: ToolArgs,
		output: ToolArgs,
		state: string,
	) => string | undefined;
	variant: "simple" | "collapsible";
};

/** Extract filename from a path, stripping common prefixes. */
export function getDisplayPath(filePath: string): string {
	const parts = filePath.split("/");
	return parts.at(-1) ?? filePath;
}

/** Derive isPending / isError from tool state. */
export function getToolStatus(
	state: string,
	hasResult: boolean,
	hasError: boolean,
): { isPending: boolean; isError: boolean } {
	const isPending =
		!hasResult &&
		(state === "input-streaming" ||
			state === "input-available" ||
			state === "awaiting-input" ||
			state === "input-complete" ||
			state === "approval-requested" ||
			state === "approval-responded");
	return { isPending, isError: hasError };
}

function isPending(state: string): boolean {
	return (
		state === "input-streaming" ||
		state === "input-available" ||
		state === "awaiting-input"
	);
}

function taskSubject(args: ToolArgs, output: ToolArgs): string | undefined {
	if (typeof output.subject === "string") return output.subject;
	if (typeof args.subject === "string") return args.subject;
	if (typeof args.taskId === "string") return `#${args.taskId}`;
	return undefined;
}

const registry: Record<string, ToolMeta> = {
	Bash: {
		icon: TerminalIcon,
		title: (_a, _o, state) =>
			isPending(state) ? "Running command" : "Ran command",
		subtitle: (args) =>
			typeof args.command === "string"
				? args.command.length > 60
					? `${args.command.slice(0, 57)}...`
					: args.command
				: undefined,
		variant: "collapsible",
	},
	FileEdit: {
		icon: PencilIcon,
		title: (args, _o, state) => {
			const path = typeof args.file_path === "string" ? args.file_path : "";
			return isPending(state)
				? `Editing ${getDisplayPath(path) || "file"}`
				: `Edited ${getDisplayPath(path) || "file"}`;
		},
		subtitle: (args) => {
			const old = typeof args.old_string === "string" ? args.old_string : "";
			const next = typeof args.new_string === "string" ? args.new_string : "";
			const added = next.split("\n").length;
			const removed = old.split("\n").length;
			if (added === 0 && removed === 0) return undefined;
			return `+${added} -${removed}`;
		},
		variant: "collapsible",
	},
	FileWrite: {
		icon: FilePlusIcon,
		title: (args, _o, state) => {
			const path = typeof args.file_path === "string" ? args.file_path : "";
			return isPending(state)
				? `Creating ${getDisplayPath(path) || "file"}`
				: `Created ${getDisplayPath(path) || "file"}`;
		},
		variant: "collapsible",
	},
	Read: {
		icon: EyeIcon,
		title: (_a, _o, state) => (isPending(state) ? "Reading" : "Read"),
		subtitle: (args) =>
			typeof args.file_path === "string"
				? getDisplayPath(args.file_path)
				: undefined,
		variant: "simple",
	},
	Grep: {
		icon: SearchIcon,
		title: (_args, output, state) => {
			if (isPending(state)) return "Grepping";
			const count = typeof output.count === "number" ? output.count : undefined;
			return count !== undefined ? `Found ${count} matches` : "Grepped";
		},
		subtitle: (args) =>
			typeof args.pattern === "string" ? args.pattern : undefined,
		variant: "simple",
	},
	Glob: {
		icon: FolderSearchIcon,
		title: (_args, output, state) => {
			if (isPending(state)) return "Exploring files";
			const count = typeof output.count === "number" ? output.count : undefined;
			return count !== undefined ? `Found ${count} files` : "Explored files";
		},
		subtitle: (args) =>
			typeof args.pattern === "string" ? args.pattern : undefined,
		variant: "simple",
	},
	WebSearch: {
		icon: SearchIcon,
		title: (_a, _o, state) =>
			isPending(state) ? "Searching web" : "Searched web",
		subtitle: (args) =>
			typeof args.query === "string" ? args.query : undefined,
		variant: "collapsible",
	},
	WebFetch: {
		icon: GlobeIcon,
		title: (args, _o, state) => {
			if (isPending(state)) return "Fetching";
			const url = typeof args.url === "string" ? args.url : "";
			try {
				return `Fetched ${new URL(url).hostname}`;
			} catch {
				return "Fetched";
			}
		},
		subtitle: (args) => {
			if (typeof args.url !== "string") return undefined;
			try {
				return new URL(args.url).hostname;
			} catch {
				return args.url;
			}
		},
		variant: "collapsible",
	},
	TaskCreate: {
		icon: PlusIcon,
		title: (_a, _o, state) =>
			isPending(state) ? "Creating task" : "Created task",
		subtitle: (args) =>
			typeof args.subject === "string" ? args.subject : undefined,
		variant: "simple",
	},
	TaskUpdate: {
		icon: RefreshCwIcon,
		title: (args, _o, state) => {
			if (isPending(state)) {
				const status = args.status;
				if (status === "in_progress") return "Starting task";
				if (status === "completed") return "Completing task";
				return "Updating task";
			}
			const status = args.status;
			if (status === "in_progress") return "Started task";
			if (status === "completed") return "Completed task";
			return "Updated task";
		},
		subtitle: (args, output) => taskSubject(args, output),
		variant: "simple",
	},
	TaskGet: {
		icon: EyeIcon,
		title: (_a, _o, state) => (isPending(state) ? "Getting task" : "Got task"),
		subtitle: (args, output) => taskSubject(args, output),
		variant: "simple",
	},
	TaskList: {
		icon: ListIcon,
		title: (_a, output, state) => {
			if (isPending(state)) return "Listing tasks";
			const count = typeof output.count === "number" ? output.count : undefined;
			return count !== undefined ? `Listed ${count} tasks` : "Listed tasks";
		},
		variant: "simple",
	},
	NotebookEdit: {
		icon: FileCode2Icon,
		title: (args, _o, state) => {
			const path =
				typeof args.notebook_path === "string" ? args.notebook_path : "";
			return isPending(state)
				? `Editing notebook${path ? ` ${getDisplayPath(path)}` : ""}`
				: `Edited notebook${path ? ` ${getDisplayPath(path)}` : ""}`;
		},
		subtitle: (args) =>
			typeof args.notebook_path === "string"
				? getDisplayPath(args.notebook_path)
				: undefined,
		variant: "simple",
	},
	Agent: {
		icon: SparklesIcon,
		title: (_a, _o, state) =>
			isPending(state) ? "Running subagent" : "Completed subagent",
		subtitle: (args) =>
			typeof args.description === "string" ? args.description : undefined,
		variant: "simple",
	},
	Task: {
		icon: SparklesIcon,
		title: (_a, _o, state) =>
			isPending(state) ? "Running subagent" : "Completed subagent",
		subtitle: (args) =>
			typeof args.description === "string" ? args.description : undefined,
		variant: "simple",
	},
	TaskOutput: {
		icon: TerminalIcon,
		title: (_a, _o, state) =>
			isPending(state) ? "Getting output" : "Got output",
		subtitle: (args) =>
			typeof args.task_id === "string" ? args.task_id : undefined,
		variant: "simple",
	},
	TaskStop: {
		icon: XCircleIcon,
		title: (_a, _o, state) =>
			isPending(state) ? "Stopping task" : "Stopped task",
		subtitle: (args) =>
			typeof args.task_id === "string" ? args.task_id : undefined,
		variant: "simple",
	},
	ListMcpResources: {
		icon: ServerIcon,
		title: (_a, _o, state) =>
			isPending(state) ? "Listing resources" : "Listed resources",
		variant: "simple",
	},
	Mcp: {
		icon: ServerIcon,
		title: (_a, _o, state) =>
			isPending(state) ? "Running MCP tool" : "Ran MCP tool",
		subtitle: (args) =>
			typeof args.tool_name === "string" ? args.tool_name : undefined,
		variant: "simple",
	},
};

const fallbackMeta: ToolMeta = {
	icon: WrenchIcon,
	title: (_a, _o, state) => (isPending(state) ? "Running tool" : "Ran tool"),
	variant: "simple",
};

export function getToolMeta(toolName: string): ToolMeta {
	return (
		registry[toolName] ?? {
			...fallbackMeta,
			title: (_a, _o, state) =>
				isPending(state) ? `Running ${toolName}` : `Ran ${toolName}`,
		}
	);
}
