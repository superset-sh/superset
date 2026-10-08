import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { cn } from "@superset/ui/utils";
import {
	type LinearIssue,
	statusIconType,
} from "../../../../../../../../utils/linearIssueTypes";
import { PriorityIcon } from "../../../../../shared/PriorityIcon";

interface LinearBoardCardProps {
	issue: LinearIssue;
	onOpen: (issue: LinearIssue) => void;
	overlay?: boolean;
}

export function LinearBoardCard({
	issue,
	onOpen,
	overlay,
}: LinearBoardCardProps) {
	const { attributes, listeners, setNodeRef, transform, isDragging } =
		useDraggable({ id: issue.id, disabled: overlay });

	return (
		// biome-ignore lint/a11y/useSemanticElements: draggable card needs a div for dnd-kit attributes
		<div
			ref={setNodeRef}
			style={{ transform: CSS.Translate.toString(transform) }}
			{...attributes}
			{...listeners}
			role="button"
			tabIndex={0}
			className={cn(
				"group cursor-grab rounded-md border border-border/60 bg-card px-3 py-2.5 transition-colors hover:bg-accent/30 active:cursor-grabbing",
				isDragging && "opacity-40",
				overlay && "cursor-grabbing border-border shadow-xl",
			)}
			onClick={() => onOpen(issue)}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onOpen(issue);
				}
			}}
		>
			<div className="mb-1 flex items-center justify-between gap-2">
				<span className="text-xs font-medium text-muted-foreground">
					{issue.identifier}
				</span>
				{issue.assignee && (
					<Avatar
						size="xs"
						fullName={issue.assignee.name}
						image={issue.assignee.avatarUrl ?? undefined}
						className="rounded-full"
					/>
				)}
			</div>
			<p className="mb-2 line-clamp-2 text-sm leading-snug">{issue.title}</p>
			<div className="flex flex-wrap items-center gap-1.5">
				<PriorityIcon
					priority={issue.priority}
					statusType={statusIconType(issue.state.type)}
					className="h-3.5 w-3.5"
				/>
				{issue.labels.slice(0, 2).map((label) => (
					<span
						key={label.id}
						className="inline-flex h-4 items-center gap-1 rounded-full border border-border/70 px-1.5 text-[10px] leading-none text-muted-foreground"
					>
						<span
							className="size-1.5 rounded-full"
							style={{ backgroundColor: label.color }}
						/>
						{label.name}
					</span>
				))}
			</div>
		</div>
	);
}
