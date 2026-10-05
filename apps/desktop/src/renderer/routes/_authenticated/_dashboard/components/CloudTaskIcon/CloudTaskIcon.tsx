import type { CloudTask } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskRow";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";

interface CloudTaskIconProps {
	task: CloudTask;
}

export function CloudTaskIcon({ task }: CloudTaskIconProps) {
	if (!task.status) {
		return (
			<span className="size-3.5 shrink-0 rounded-full border border-muted-foreground/40" />
		);
	}
	return (
		<StatusIcon
			type={task.status.type as StatusType}
			color={task.status.color}
			progress={task.status.progressPercent ?? undefined}
		/>
	);
}
