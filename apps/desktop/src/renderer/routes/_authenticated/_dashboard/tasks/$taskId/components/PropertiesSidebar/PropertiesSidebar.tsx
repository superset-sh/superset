import { Badge } from "@superset/ui/badge";
import { ScrollArea } from "@superset/ui/scroll-area";
import type { TaskWithStatus } from "../../../components/TasksView/hooks/useTasksTable";
import { AssigneeProperty } from "./components/AssigneeProperty";
import { PriorityProperty } from "./components/PriorityProperty";
import { StatusProperty } from "./components/StatusProperty";

interface PropertiesSidebarProps {
	task: TaskWithStatus;
}

export function PropertiesSidebar({ task }: PropertiesSidebarProps) {
	const labels = task.labels ?? [];

	return (
		<div className="w-64 border-l border-border shrink-0">
			<ScrollArea className="h-full">
				<div className="p-4 space-y-6">
					<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
						Properties
					</h3>

					<div className="space-y-3">
						<StatusProperty task={task} />
						<PriorityProperty task={task} />
						<AssigneeProperty task={task} />
					</div>

					{/* Labels */}
					<div className="flex flex-col gap-2">
						<span className="text-xs text-muted-foreground">Labels</span>
						{labels.length > 0 ? (
							<div className="flex flex-wrap gap-1">
								{labels.map((label) => (
									<Badge key={label} variant="outline" className="text-xs">
										{label}
									</Badge>
								))}
							</div>
						) : (
							<span className="text-sm text-muted-foreground">No labels</span>
						)}
					</div>
				</div>
			</ScrollArea>
		</div>
	);
}
