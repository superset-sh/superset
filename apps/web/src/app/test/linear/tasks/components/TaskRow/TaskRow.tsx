"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/lib/utils";

interface TaskRowProps {
	task: {
		id: string;
		slug: string;
		title: string;
		status: string;
		statusColor: string | null;
		priority: "urgent" | "high" | "medium" | "low" | "none";
		externalKey: string | null;
		labels: string[] | null;
		estimate: number | null;
		createdAt: Date | string;
		assignee?: {
			id: string;
			name: string;
			avatarUrl: string | null;
		} | null;
	};
	onClick?: () => void;
}

function PriorityIcon({
	priority,
}: {
	priority: "urgent" | "high" | "medium" | "low" | "none";
}) {
	const bars = {
		urgent: 4,
		high: 3,
		medium: 2,
		low: 1,
		none: 0,
	}[priority];

	const color = {
		urgent: "bg-red-500",
		high: "bg-orange-500",
		medium: "bg-yellow-500",
		low: "bg-blue-500",
		none: "bg-muted-foreground/30",
	}[priority];

	return (
		<div className="flex h-4 items-end gap-px">
			{[1, 2, 3, 4].map((level) => (
				<div
					key={level}
					className={cn(
						"w-[3px] rounded-sm",
						level <= bars ? color : "bg-muted-foreground/20",
					)}
					style={{ height: `${level * 3 + 2}px` }}
				/>
			))}
		</div>
	);
}

function formatDate(date: Date | string): string {
	const d = typeof date === "string" ? new Date(date) : date;
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function TaskRow({ task, onClick }: TaskRowProps) {
	const initials = task.assignee?.name
		?.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	return (
		<button
			type="button"
			className="hover:bg-muted/50 group flex h-10 w-full cursor-pointer items-center gap-3 border-b px-3 text-left text-sm transition-colors"
			onClick={onClick}
		>
			{/* Priority */}
			<div className="w-5 flex-shrink-0">
				<PriorityIcon priority={task.priority} />
			</div>

			{/* Issue Key */}
			<span className="text-muted-foreground w-24 flex-shrink-0 font-mono text-xs">
				{task.externalKey ?? task.slug}
			</span>

			{/* Status Indicator */}
			<div
				className="size-3 flex-shrink-0 rounded-full"
				style={{ backgroundColor: task.statusColor ?? "#888" }}
			/>

			{/* Title */}
			<span className="min-w-0 flex-1 truncate">{task.title}</span>

			{/* Labels */}
			<div className="flex flex-shrink-0 items-center gap-1">
				{task.labels?.slice(0, 2).map((label) => (
					<Badge
						key={label}
						variant="outline"
						className="h-5 px-1.5 text-[10px] font-normal"
					>
						{label}
					</Badge>
				))}
			</div>

			{/* Estimate */}
			{task.estimate && (
				<div className="text-muted-foreground flex size-5 flex-shrink-0 items-center justify-center rounded-full border text-[10px]">
					{task.estimate}
				</div>
			)}

			{/* Assignee */}
			<div className="w-6 flex-shrink-0">
				{task.assignee ? (
					<Avatar className="size-6">
						<AvatarImage src={task.assignee.avatarUrl ?? undefined} />
						<AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
					</Avatar>
				) : (
					<div className="size-6" />
				)}
			</div>

			{/* Date */}
			<span className="text-muted-foreground w-14 flex-shrink-0 text-right text-xs">
				{formatDate(task.createdAt)}
			</span>
		</button>
	);
}
