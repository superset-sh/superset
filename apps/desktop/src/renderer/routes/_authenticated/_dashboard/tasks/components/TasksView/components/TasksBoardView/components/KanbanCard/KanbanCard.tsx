import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import { format } from "date-fns";
import { PriorityIcon } from "../../../../components/shared/PriorityIcon";
import type { TaskWithStatus } from "../../../../hooks/useTasksData";

interface KanbanCardProps {
	task: TaskWithStatus;
	onClick: () => void;
	overlay?: boolean;
}

export function KanbanCard({ task, onClick, overlay }: KanbanCardProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: task.id,
		data: { type: "task", task },
		disabled: overlay,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const assigneeName = task.assignee?.name ?? task.assigneeDisplayName ?? null;
	const assigneeImage = task.assignee?.image ?? task.assigneeAvatarUrl ?? null;
	const labels = task.labels ?? [];
	const createdDate = task.createdAt
		? format(new Date(task.createdAt), "MMM d")
		: null;

	return (
		// biome-ignore lint/a11y/useSemanticElements: Draggable card requires div for dnd-kit, button cannot receive drag attributes
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			role="button"
			tabIndex={0}
			className={cn(
				"bg-card border border-border/60 rounded-md px-3 py-2.5 cursor-grab active:cursor-grabbing hover:bg-accent/30 transition-colors group",
				isDragging && "opacity-40",
				overlay && "shadow-xl border-border cursor-grabbing",
			)}
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick();
				}
			}}
		>
			{/* Row 1: Slug + Assignee avatar */}
			<div className="flex items-center justify-between gap-2 mb-1">
				<span className="text-xs text-muted-foreground font-medium">
					{task.slug}
				</span>
				{assigneeName && (
					<Avatar
						size="xs"
						fullName={assigneeName}
						image={assigneeImage ?? undefined}
						className="rounded-full"
					/>
				)}
			</div>

			{/* Row 2: Title */}
			<p className="text-sm leading-snug line-clamp-2 mb-2">{task.title}</p>

			{/* Row 3: Priority + Labels + Created date */}
			<div className="flex items-center gap-1.5 flex-wrap">
				<PriorityIcon
					priority={task.priority}
					statusType={task.status.type}
					className="h-3.5 w-3.5"
				/>

				{labels.length > 0 && (
					<>
						{labels.slice(0, 2).map((label) => (
							<Badge
								key={label}
								variant="outline"
								className="text-[10px] px-1.5 py-0 h-4 leading-none"
							>
								{label}
							</Badge>
						))}
						{labels.length > 2 && (
							<Badge
								variant="outline"
								className="text-[10px] px-1.5 py-0 h-4 leading-none"
							>
								+{labels.length - 2}
							</Badge>
						)}
					</>
				)}

				{createdDate && (
					<span className="text-[10px] text-muted-foreground ml-auto">
						Created {createdDate}
					</span>
				)}
			</div>
		</div>
	);
}
