import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { CloudTaskIcon } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskIcon";
import type { CloudTask } from "./types";

interface CloudTaskRowProps {
	task: CloudTask;
	onOpen: () => void;
	/** Shown over the row's end on hover; the title fades under it so the row keeps its width. */
	trailing?: ReactNode;
}

export function CloudTaskRow({ task, onOpen, trailing }: CloudTaskRowProps) {
	return (
		<div className="group/task-row relative flex h-7 w-fit max-w-full items-center rounded-sm text-xs hover:bg-fill-hover has-[:focus-visible]:bg-fill-hover">
			<button
				type="button"
				onClick={onOpen}
				className="flex h-full min-w-0 items-center gap-2 px-2 text-left focus-visible:outline-none"
			>
				<CloudTaskIcon task={task} />
				<span className="shrink-0 font-mono text-muted-foreground">
					{task.slug}
				</span>
				<span
					className={cn(
						"min-w-0 truncate",
						trailing &&
							"group-hover/task-row:[mask-image:linear-gradient(to_right,black_calc(100%-30px),transparent_calc(100%-22px))] group-has-[:focus-visible]/task-row:[mask-image:linear-gradient(to_right,black_calc(100%-30px),transparent_calc(100%-22px))]",
					)}
				>
					{task.title}
				</span>
			</button>
			{trailing && (
				<span className="absolute top-1/2 right-1 hidden -translate-y-1/2 group-hover/task-row:flex group-has-[:focus-visible]/task-row:flex">
					{trailing}
				</span>
			)}
		</div>
	);
}
