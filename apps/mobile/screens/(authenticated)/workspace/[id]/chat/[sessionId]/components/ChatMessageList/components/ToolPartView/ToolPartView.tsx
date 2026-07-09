import { CheckCircleIcon, CircleIcon, LoaderIcon } from "lucide-react-native";
import { View } from "react-native";
import { Task, TaskContent, TaskTrigger } from "@/components/ai-elements/task";
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
	ToolOutput,
	type ToolState,
} from "@/components/ai-elements/tool";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * A mastracode `tool_call` content part: `{ type: "tool_call", id, name, args }`.
 * Its result arrives as a SEPARATE `tool_result` part paired by `id` — the caller
 * resolves that pairing and passes it in as `result`.
 */
export interface ToolCallPart {
	name: string;
	args: unknown;
	id?: string;
}

/** The paired `tool_result` part: `{ type: "tool_result", result, isError }`. */
export interface ToolResultPart {
	result: unknown;
	isError?: boolean;
}

/**
 * Renders a single tool call using the shared ai-elements kit. `task_write`
 * becomes a status checklist; every other tool renders as the collapsible Tool
 * card (real name + JSON args + result/error).
 *
 * The snapshot uses mastracode `HarnessMessage` parts, NOT AI-SDK-v5 UIMessage
 * parts — the name is `call.name`, the input is `call.args`, and the output is
 * the paired `tool_result` part's `result` (`isError` distinguishes failures).
 * This mirrors desktop's AssistantMessage renderer.
 */
export function ToolPartView({
	call,
	result,
	isStreaming,
}: {
	call: ToolCallPart;
	result?: ToolResultPart;
	isStreaming?: boolean;
}) {
	const name = call.name || "tool";
	const state: ToolState = result?.isError
		? "output-error"
		: result
			? "output-available"
			: isStreaming
				? "input-streaming"
				: "input-available";

	if (name === "task_write") {
		return <TaskWriteChecklist todos={asTodos(call.args)} />;
	}

	const { output, errorText } = splitResult(result);

	return (
		<Tool className="mt-1 mb-0">
			<ToolHeader state={state} title={name} type={`tool-${name}`} />
			<ToolContent>
				{call.args === undefined ? null : <ToolInput input={call.args} />}
				<ToolOutput errorText={errorText} output={output} />
			</ToolContent>
		</Tool>
	);
}

/** Split a `tool_result` into the ToolOutput props (error text vs. output). */
function splitResult(result?: ToolResultPart): {
	output?: unknown;
	errorText?: string;
} {
	if (!result) return {};
	if (result.isError) {
		const text =
			typeof result.result === "string"
				? result.result
				: JSON.stringify(result.result, null, 2);
		return { errorText: text };
	}
	return { output: result.result };
}

type TodoStatus = "pending" | "in_progress" | "completed";

interface Todo {
	content: string;
	status: TodoStatus;
}

const STATUS_ICON: Record<TodoStatus, React.ReactNode> = {
	pending: <Icon as={CircleIcon} className="size-4 text-muted-foreground/50" />,
	in_progress: <Icon as={LoaderIcon} className="size-4 text-primary" />,
	completed: <Icon as={CheckCircleIcon} className="size-4 text-green-600" />,
};

/** Renders the `task_write` todos as a collapsible status checklist. */
function TaskWriteChecklist({ todos }: { todos: Todo[] }) {
	const completed = todos.filter((t) => t.status === "completed").length;
	const title = todos.length
		? `Tasks · ${completed}/${todos.length}`
		: "Update Tasks";

	return (
		<Task className="mt-1" defaultOpen>
			<TaskTrigger title={title} />
			<TaskContent>
				{todos.map((todo, i) => (
					<View
						className="flex-row items-start gap-2"
						key={`${i}-${todo.content}`}
					>
						<View className="mt-0.5">{STATUS_ICON[todo.status]}</View>
						<Text
							className={cn(
								"shrink grow text-sm",
								todo.status === "completed"
									? "text-muted-foreground/60 line-through"
									: "text-foreground",
							)}
						>
							{todo.content}
						</Text>
					</View>
				))}
			</TaskContent>
		</Task>
	);
}

function asTodos(args: unknown): Todo[] {
	if (!args || typeof args !== "object") return [];
	const todos = (args as { todos?: unknown }).todos;
	if (!Array.isArray(todos)) return [];
	return todos
		.filter(
			(t): t is Record<string, unknown> => Boolean(t) && typeof t === "object",
		)
		.map((t) => ({
			content:
				typeof t.content === "string" ? t.content : String(t.content ?? ""),
			status: normalizeTodoStatus(t.status),
		}));
}

function normalizeTodoStatus(raw: unknown): TodoStatus {
	return raw === "in_progress" || raw === "completed" ? raw : "pending";
}
