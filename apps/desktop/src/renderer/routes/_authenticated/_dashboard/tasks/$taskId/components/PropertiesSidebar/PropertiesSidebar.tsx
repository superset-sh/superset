import { Badge } from "@superset/ui/badge";
import { ScrollArea } from "@superset/ui/scroll-area";
import type { TaskWithStatus } from "../../../components/TasksView/hooks/useTasksTable";
import { AssigneeProperty } from "./components/AssigneeProperty";
import { OpenInWorkspaceV2 } from "./components/OpenInWorkspaceV2";
import { PriorityProperty } from "./components/PriorityProperty";
import { ProjectProperty } from "./components/ProjectProperty";
import { StatusProperty } from "./components/StatusProperty";

interface PropertiesSidebarProps {
	task: TaskWithStatus;
}

export function PropertiesSidebar({ task }: PropertiesSidebarProps) {
	const labels = task.labels ?? [];

	return (
		<div className="w-64 min-w-0 shrink-0 overflow-hidden border-l border-border">
			<ScrollArea className="h-full">
				<div className="min-w-0 space-y-6 p-4">
					<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
						Properties
					</h3>

					<div className="min-w-0 space-y-3">
						<StatusProperty task={task} />
						<PriorityProperty task={task} />
						<AssigneeProperty task={task} />
						<ProjectProperty task={task} />
					</div>

					{/* Labels */}
					<div className="flex min-w-0 flex-col gap-2">
						<span className="text-xs text-muted-foreground">Labels</span>
						{labels.length > 0 ? (
							<div className="flex min-w-0 flex-wrap gap-1">
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

					<OpenInWorkspaceV2 task={task} />
				</div>
			</ScrollArea>
		</div>
	);
}
