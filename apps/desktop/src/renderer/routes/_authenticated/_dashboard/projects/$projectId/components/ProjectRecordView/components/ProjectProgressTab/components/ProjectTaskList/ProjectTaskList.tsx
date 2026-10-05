import type { ProjectRecord } from "../../../../../../types";
import { ProjectTaskListRow } from "./components/ProjectTaskListRow";

interface ProjectTaskListProps {
	tasks: ProjectRecord["tasks"];
	onOpenTask: (taskId: string) => void;
}

export function ProjectTaskList({ tasks, onOpenTask }: ProjectTaskListProps) {
	return (
		<table className="w-full border-separate border-spacing-0">
			<tbody>
				{tasks.map((task) => (
					<ProjectTaskListRow
						key={task.id}
						task={task}
						onOpen={() => onOpenTask(task.id)}
					/>
				))}
			</tbody>
		</table>
	);
}
