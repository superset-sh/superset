import type { TaskPriority } from "@superset/db/enums";
import { TaskItem } from "@superset/ui/ai-elements/task";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/lib/utils";
import { PriorityIcon } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/PriorityIcon";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";

interface TaskItemDisplayDetail {
	label: string;
	value: string;
}

interface TaskItemDisplayProps {
	title: string;
	taskId?: string | null;
	slug?: string | null;
	status?: string | null;
	statusType?: string | null;
	statusColor?: string | null;
	statusProgress?: number | null;
	priority?: string | null;
	assignee?: string | null;
	assigneeImage?: string | null;
	dueDate?: string | null;
	estimate?: string | null;
	labels?: string[];
	description?: string | null;
	extraDetails?: TaskItemDisplayDetail[];
	onClick?: (() => void) | null;
}

function hasText(value: string | null | undefined): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function getBaseDetails({
	status,
	assignee,
	dueDate,
	estimate,
}: Pick<
	TaskItemDisplayProps,
	"status" | "assignee" | "dueDate" | "estimate"
>): TaskItemDisplayDetail[] {
	const details: TaskItemDisplayDetail[] = [];
	if (hasText(status)) details.push({ label: "Status", value: status });
	if (hasText(assignee)) details.push({ label: "Assignee", value: assignee });
	if (hasText(dueDate)) details.push({ label: "Due", value: dueDate });
	if (hasText(estimate)) details.push({ label: "Estimate", value: estimate });
	return details;
}

function normalizePriority(
	value: string | null | undefined,
): TaskPriority | null {
	if (!hasText(value)) return null;
	if (
		value === "none" ||
		value === "urgent" ||
		value === "high" ||
		value === "medium" ||
		value === "low"
	) {
		return value;
	}
	return null;
}

function normalizeStatusType(
	value: string | null | undefined,
): StatusType | null {
	if (!hasText(value)) return null;
	if (
		value === "backlog" ||
		value === "unstarted" ||
		value === "started" ||
		value === "completed" ||
		value === "canceled"
	) {
		return value;
	}
	return null;
}

function renderContent(props: TaskItemDisplayProps) {
	const details = [
		...getBaseDetails(props),
		...(props.extraDetails ?? []).filter(
			(detail) => hasText(detail.label) && hasText(detail.value),
		),
	];
	const labels = Array.from(
		new Set((props.labels ?? []).filter((label) => hasText(label))),
	);
	const hasIdLine = hasText(props.slug) || hasText(props.taskId);

	const statusType = normalizeStatusType(props.statusType);
	const priority = normalizePriority(props.priority);
	const statusColor = hasText(props.statusColor)
		? props.statusColor
		: "#9ca3af";
	const secondaryId = hasText(props.slug)
		? props.slug
		: hasText(props.taskId)
			? props.taskId
			: null;
	const visibleLabels = labels.slice(0, 3);
	const hiddenLabelCount = labels.length - visibleLabels.length;

	return (
		<TaskItem className="space-y-1.5 text-xs">
			<div className="flex items-center gap-1.5 min-w-0">
				{statusType ? (
					<StatusIcon
						type={statusType}
						color={statusColor}
						progress={props.statusProgress ?? undefined}
					/>
				) : null}
				{priority ? (
					<PriorityIcon
						priority={priority}
						statusType={statusType ?? undefined}
						className="h-3.5 w-3.5"
					/>
				) : null}
				<div className="truncate text-sm font-medium text-foreground">
					{props.title}
				</div>
				{secondaryId ? (
					<span className="text-[11px] text-muted-foreground shrink-0">
						{secondaryId}
					</span>
				) : null}
			</div>
			<div className="flex items-center gap-2 text-muted-foreground">
				{hasText(props.assignee) ? (
					<div className="inline-flex items-center gap-1">
						<Avatar
							size="xs"
							fullName={props.assignee}
							image={props.assigneeImage ?? undefined}
						/>
						<span className="line-clamp-1">{props.assignee}</span>
					</div>
				) : null}
				{details
					.filter((detail) => detail.label !== "Assignee")
					.slice(0, 3)
					.map((detail) => (
						<span
							key={`${detail.label}-${detail.value}`}
							className="line-clamp-1"
						>
							{detail.label}: {detail.value}
						</span>
					))}
			</div>
			{labels.length > 0 ? (
				<div className="flex flex-wrap gap-1">
					{visibleLabels.map((label) => (
						<Badge
							key={label}
							variant="outline"
							className="text-[10px] h-5 px-1.5"
						>
							{label}
						</Badge>
					))}
					{hiddenLabelCount > 0 ? (
						<Badge variant="outline" className="text-[10px] h-5 px-1.5">
							+{hiddenLabelCount}
						</Badge>
					) : null}
				</div>
			) : null}
			{hasText(props.description) ? (
				<div className="line-clamp-2 text-muted-foreground">
					{props.description}
				</div>
			) : null}
			{props.extraDetails && props.extraDetails.length > 0 ? (
				<div className="text-muted-foreground line-clamp-1">
					{props.extraDetails
						.filter((detail) => hasText(detail.label) && hasText(detail.value))
						.map((detail) => `${detail.label}: ${detail.value}`)
						.join(" • ")}
				</div>
			) : null}
			{hasIdLine ? (
				<div className="text-[11px] text-muted-foreground/80">
					{[hasText(props.slug) ? `#${props.slug}` : null, props.taskId]
						.filter((value): value is string => hasText(value))
						.join(" • ")}
				</div>
			) : null}
		</TaskItem>
	);
}

export function TaskItemDisplay(props: TaskItemDisplayProps) {
	const className = cn(
		"w-full rounded border border-border/60 bg-background/60 px-2.5 py-2 text-left",
		props.onClick ? "transition-colors hover:bg-accent/30" : undefined,
	);

	if (props.onClick) {
		return (
			<button className={className} onClick={props.onClick} type="button">
				{renderContent(props)}
			</button>
		);
	}

	return <div className={className}>{renderContent(props)}</div>;
}
