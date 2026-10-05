import type { TaskProjectState } from "@superset/db/schema";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";

const PAUSED_COLOR = "#8c8c8f";

const APPEARANCE: Record<
	Exclude<TaskProjectState, "paused">,
	{ type: StatusType; color: string; progress?: number }
> = {
	planned: { type: "unstarted", color: "#8c8c8f" },
	started: { type: "started", color: "#f2c94c", progress: 50 },
	completed: { type: "completed", color: "#5e6ad2" },
	canceled: { type: "canceled", color: "#95a2b3" },
};

interface ProjectStateIconProps {
	state: TaskProjectState;
}

export function ProjectStateIcon({ state }: ProjectStateIconProps) {
	if (state === "paused") {
		return (
			<svg
				aria-hidden="true"
				viewBox="0 0 14 14"
				className="size-3.5 shrink-0"
				fill="none"
			>
				<circle cx="7" cy="7" r="6" stroke={PAUSED_COLOR} strokeWidth="1.5" />
				<rect
					x="4.75"
					y="4.25"
					width="1.5"
					height="5.5"
					rx="0.5"
					fill={PAUSED_COLOR}
				/>
				<rect
					x="7.75"
					y="4.25"
					width="1.5"
					height="5.5"
					rx="0.5"
					fill={PAUSED_COLOR}
				/>
			</svg>
		);
	}
	const { type, color, progress } = APPEARANCE[state];
	return <StatusIcon type={type} color={color} progress={progress} />;
}
