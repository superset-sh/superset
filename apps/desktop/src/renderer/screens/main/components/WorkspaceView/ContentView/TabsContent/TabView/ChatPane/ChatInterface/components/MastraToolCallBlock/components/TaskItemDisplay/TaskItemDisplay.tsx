import { TaskItem, TaskItemFile } from "@superset/ui/ai-elements/task";
import { cn } from "@superset/ui/lib/utils";

interface TaskItemDisplayDetail {
	label: string;
	value: string;
}

interface TaskItemDisplayProps {
	title: string;
	taskId?: string | null;
	slug?: string | null;
	status?: string | null;
	priority?: string | null;
	assignee?: string | null;
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
	priority,
	assignee,
	dueDate,
	estimate,
}: Pick<
	TaskItemDisplayProps,
	"status" | "priority" | "assignee" | "dueDate" | "estimate"
>): TaskItemDisplayDetail[] {
	const details: TaskItemDisplayDetail[] = [];
	if (hasText(status)) details.push({ label: "Status", value: status });
	if (hasText(priority)) details.push({ label: "Priority", value: priority });
	if (hasText(assignee)) details.push({ label: "Assignee", value: assignee });
	if (hasText(dueDate)) details.push({ label: "Due", value: dueDate });
	if (hasText(estimate)) details.push({ label: "Estimate", value: estimate });
	return details;
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

	return (
		<TaskItem className="space-y-1 text-xs">
			<div className="font-medium text-foreground">{props.title}</div>
			{hasIdLine ? (
				<div className="text-muted-foreground">
					{[hasText(props.slug) ? `#${props.slug}` : null, props.taskId]
						.filter((value): value is string => hasText(value))
						.join(" • ")}
				</div>
			) : null}
			{details.length > 0 ? (
				<div className="flex flex-wrap gap-1">
					{details.map((detail) => (
						<TaskItemFile key={`${detail.label}-${detail.value}`}>
							{detail.label}: {detail.value}
						</TaskItemFile>
					))}
				</div>
			) : null}
			{labels.length > 0 ? (
				<div className="flex flex-wrap gap-1">
					{labels.map((label) => (
						<TaskItemFile key={label}>{label}</TaskItemFile>
					))}
				</div>
			) : null}
			{hasText(props.description) ? (
				<div className="line-clamp-2 text-muted-foreground">
					{props.description}
				</div>
			) : null}
		</TaskItem>
	);
}

export function TaskItemDisplay(props: TaskItemDisplayProps) {
	const className = cn(
		"w-full rounded border bg-background/70 px-2 py-1 text-left",
		props.onClick ? "transition-colors hover:bg-muted/20" : undefined,
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
