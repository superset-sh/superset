/**
 * Todo tool renderer. Checklist of items with statuses. Defaults open.
 */

import type { ToolPart } from "@superset/chat/shared";
import { ListChecks } from "lucide-react";
import { BasicTool } from "../BasicTool";
import { ToolErrorCard } from "../ToolErrorCard";
import {
	inputAsRecord,
	isToolError,
	statusFromToolState,
} from "../toolHelpers";

interface TodoItem {
	content: string;
	status: "pending" | "in_progress" | "completed" | "cancelled";
}

function extractTodos(value: unknown): TodoItem[] {
	if (!Array.isArray(value)) return [];
	const out: TodoItem[] = [];
	for (const item of value) {
		if (!item || typeof item !== "object") continue;
		const rec = item as Record<string, unknown>;
		const content = rec.content ?? rec.task ?? rec.description;
		const status = rec.status;
		if (typeof content !== "string") continue;
		const normStatus =
			status === "in_progress" || status === "completed" || status === "cancelled"
				? status
				: "pending";
		out.push({ content, status: normStatus });
	}
	return out;
}

export function TodoTool({ part }: { part: ToolPart }) {
	const input = inputAsRecord(part.state);
	const todos =
		extractTodos(input?.todos ?? input?.items) ??
		(part.state.kind === "completed"
			? extractTodos((part.state.output as { todos?: unknown })?.todos)
			: []);

	if (isToolError(part) && part.state.kind === "error") {
		return <ToolErrorCard tool="Todo" error={part.state.error.message} />;
	}

	const completed = todos.filter((t) => t.status === "completed").length;

	return (
		<BasicTool
			icon={ListChecks}
			status={statusFromToolState(part.state)}
			defaultOpen
			trigger={{
				title: "Todo",
				subtitle:
					todos.length > 0
						? `${completed}/${todos.length} complete`
						: "empty",
			}}
		>
			<ul className="space-y-1">
				{todos.map((t) => (
					<li
						key={`${t.status}:${t.content}`}
						className="flex items-start gap-2 text-[12px]"
					>
						<span
							className={
								t.status === "completed"
									? "mt-0.5 text-green-600 dark:text-green-400"
									: t.status === "in_progress"
										? "mt-0.5 text-amber-600 dark:text-amber-400"
										: t.status === "cancelled"
											? "mt-0.5 text-muted-foreground"
											: "mt-0.5 text-muted-foreground"
							}
							aria-hidden
						>
							{t.status === "completed"
								? "☑"
								: t.status === "in_progress"
									? "◐"
									: t.status === "cancelled"
										? "☒"
										: "☐"}
						</span>
						<span
							className={
								t.status === "completed"
									? "text-muted-foreground line-through"
									: t.status === "cancelled"
										? "text-muted-foreground line-through"
										: undefined
							}
						>
							{t.content}
						</span>
					</li>
				))}
			</ul>
		</BasicTool>
	);
}
