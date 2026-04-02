import { ListTodoIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getArgs } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface TodoItem {
	id: string;
	content: string;
	status: "pending" | "in_progress" | "completed";
	priority?: string;
}

function toTodoItems(value: unknown): TodoItem[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(item): item is TodoItem =>
			typeof item === "object" &&
			item !== null &&
			typeof (item as TodoItem).content === "string",
	);
}

function buildDescription(todos: TodoItem[]): string | undefined {
	if (todos.length === 0) return undefined;

	const inProgress = todos.filter((t) => t.status === "in_progress").length;
	const completed = todos.filter((t) => t.status === "completed").length;
	const pending = todos.filter((t) => t.status === "pending").length;

	const parts: string[] = [
		`${todos.length} task${todos.length === 1 ? "" : "s"}`,
	];
	const statusParts: string[] = [];
	if (inProgress > 0) statusParts.push(`${inProgress} in progress`);
	if (completed > 0) statusParts.push(`${completed} completed`);
	if (pending > 0) statusParts.push(`${pending} pending`);
	if (statusParts.length > 0) parts.push(statusParts.join(" · "));

	return parts.join(" · ");
}

interface TaskWriteToolCallProps {
	part: ToolPart;
}

export function TaskWriteToolCall({ part }: TaskWriteToolCallProps) {
	const args = getArgs(part);
	const todos = toTodoItems(args.todos);
	const description = buildDescription(todos);

	return (
		<SupersetToolCall
			part={part}
			toolName="Update Tasks"
			icon={ListTodoIcon}
			subtitle={description}
		/>
	);
}
