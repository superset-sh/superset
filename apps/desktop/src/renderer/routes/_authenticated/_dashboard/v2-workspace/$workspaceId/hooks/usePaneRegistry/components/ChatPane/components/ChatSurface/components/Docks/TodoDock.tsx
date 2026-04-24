/**
 * TodoDock — shows the agent's current todo list above the composer.
 * Dismissible once all items are complete (no actions required).
 */

import type { TodoItem } from "@superset/chat/shared";
import { DockFrame } from "./DockFrame";

export interface TodoDockProps {
	todos: TodoItem[];
}

export function TodoDock({ todos }: TodoDockProps) {
	if (todos.length === 0) return null;
	const completed = todos.filter((t) => t.status === "completed").length;
	return (
		<DockFrame
			tone="muted"
			label="Todo"
			subtitle={`${completed}/${todos.length} complete`}
		>
			<ul className="space-y-1">
				{todos.map((t) => (
					<li key={t.id} className="flex items-start gap-2 text-sm">
						<span
							aria-hidden
							className={
								t.status === "completed"
									? "mt-0.5 text-green-600 dark:text-green-400"
									: t.status === "in_progress"
										? "mt-0.5 text-amber-600 dark:text-amber-400"
										: t.status === "cancelled"
											? "mt-0.5 text-muted-foreground"
											: "mt-0.5 text-muted-foreground"
							}
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
		</DockFrame>
	);
}
