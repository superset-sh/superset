import { cn } from "@superset/ui/utils";
import { HiMiniPause, HiMiniPlay, HiMiniXMark } from "react-icons/hi2";
import type { WorkspaceRunState } from "shared/tabs-types";

interface WorkspaceRunIndicatorProps {
	className?: string;
	state: WorkspaceRunState;
	variant?: "circle" | "inline" | "toolbar";
}

export function WorkspaceRunIndicator({
	className,
	state,
	variant = "circle",
}: WorkspaceRunIndicatorProps) {
	const icon =
		state === "running" ? (
			<HiMiniPlay className="size-[0.45rem] translate-x-[0.5px]" />
		) : state === "stopped-by-user" ? (
			<HiMiniPause className="size-2" />
		) : (
			<HiMiniXMark className="size-[0.6rem]" />
		);

	const colorClasses =
		state === "running"
			? "bg-success"
			: state === "stopped-by-user"
				? "bg-muted-foreground/40"
				: "bg-destructive/50";

	const inlineColorClasses =
		state === "running"
			? "bg-success/15 text-success"
			: state === "stopped-by-user"
				? "bg-muted-foreground/10 text-muted-foreground/50"
				: "bg-destructive/15 text-destructive/70";

	const toolbarColorClasses =
		state === "running"
			? "text-success"
			: state === "stopped-by-user"
				? "text-warning"
				: "text-destructive/70";

	if (variant === "circle") {
		return (
			<span
				className={cn(
					"flex size-3 items-center justify-center rounded-full text-white ring-1 ring-background",
					colorClasses,
					className,
				)}
			>
				{icon}
			</span>
		);
	}

	if (variant === "toolbar") {
		const toolbarIcon =
			state === "running" ? (
				<HiMiniPlay className="size-3" />
			) : state === "stopped-by-user" ? (
				<HiMiniPause className="size-3" />
			) : (
				<HiMiniXMark className="size-3" />
			);
		return (
			<span
				className={cn(
					"flex items-center justify-center",
					toolbarColorClasses,
					className,
				)}
			>
				{toolbarIcon}
			</span>
		);
	}

	// inline variant - tinted background with colored icon
	return (
		<span
			className={cn(
				"flex h-2.5 w-5 items-center justify-center rounded-[2px]",
				inlineColorClasses,
				className,
			)}
		>
			{icon}
		</span>
	);
}
