import { TaskItem } from "@superset/ui/ai-elements/task";
import { Badge } from "@superset/ui/badge";
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
	const seenDetails = new Set<string>();
	const dedupedDetails = details.filter((detail) => {
		const key = `${detail.label.toLowerCase()}::${detail.value.toLowerCase()}`;
		if (seenDetails.has(key)) return false;
		seenDetails.add(key);
		return true;
	});
	const labels = Array.from(
		new Set((props.labels ?? []).filter((label) => hasText(label))),
	);
	const hasSlug = hasText(props.slug);
	const hasTaskId = hasText(props.taskId);
	const visibleLabels = labels.slice(0, 3);
	const hiddenLabelCount = labels.length - visibleLabels.length;
	const metadataText = dedupedDetails
		.slice(0, 4)
		.map((detail) => `${detail.label}: ${detail.value}`)
		.join(" • ");
	const showTaskIdLine = hasTaskId && (!hasSlug || props.taskId !== props.slug);

	return (
		<TaskItem className="space-y-1.5 text-xs">
			<div className="flex items-center gap-1.5 min-w-0">
				<div className="truncate text-sm font-medium text-foreground">
					{props.title}
				</div>
				{hasSlug ? (
					<span className="text-[11px] text-muted-foreground shrink-0">
						#{props.slug}
					</span>
				) : null}
			</div>
			{metadataText ? (
				<div className="text-muted-foreground line-clamp-1">{metadataText}</div>
			) : null}
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
			{showTaskIdLine ? (
				<div className="text-[11px] text-muted-foreground/80">
					{props.taskId}
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
