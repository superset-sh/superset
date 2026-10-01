import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
import { CloudTaskIcon } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskIcon";
import type { ProjectRecord } from "../../../../../../../../types";

interface ProjectTaskListRowProps {
	task: ProjectRecord["tasks"][number];
	onOpen: () => void;
}

export function ProjectTaskListRow({ task, onOpen }: ProjectTaskListRowProps) {
	return (
		<tr
			onClick={onOpen}
			className="h-11 cursor-pointer [&:hover>td]:bg-fill-hover [&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg"
		>
			<td className="w-0 pr-2 pl-4">
				<span className="flex">
					<CloudTaskIcon task={task} />
				</span>
			</td>
			<td className="w-0 pr-4 whitespace-nowrap">
				<span className="block max-w-56 truncate text-xs text-muted-foreground tabular-nums">
					{task.slug}
				</span>
			</td>
			<td className="w-full max-w-0 pr-3">
				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						onOpen();
					}}
					className="block max-w-full truncate text-left text-sm focus-visible:underline focus-visible:outline-none"
				>
					{task.title}
				</button>
			</td>
			<td className="w-0 pr-4">
				{task.assignee && <AvatarStack people={[task.assignee]} size={20} />}
			</td>
		</tr>
	);
}
