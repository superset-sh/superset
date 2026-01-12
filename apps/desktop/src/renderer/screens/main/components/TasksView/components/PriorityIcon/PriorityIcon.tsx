import type { TaskPriority } from "@superset/db/enums";
import colors from "tailwindcss/colors";

interface PriorityIconProps {
	priority: TaskPriority;
	statusType?: string;
	className?: string;
	showHover?: boolean;
	color?: string;
}

export function PriorityIcon({
	priority,
	statusType,
	className = "",
	showHover = false,
	color,
}: PriorityIconProps) {
	const sizeClass = className || "h-4 w-4";
	const hoverClass = showHover ? "group-hover:brightness-150" : "";
	const defaultColor = color || colors.neutral[500];

	if (priority === "none") {
		return (
			<div className={`flex items-center justify-center ${sizeClass}`}>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					fill={defaultColor}
					xmlns="http://www.w3.org/2000/svg"
					className={`${sizeClass} ${hoverClass} transition-all`}
				>
					<rect
						x="1.5"
						y="7.25"
						width="3"
						height="1.5"
						rx="0.5"
						opacity="0.9"
					/>
					<rect
						x="6.5"
						y="7.25"
						width="3"
						height="1.5"
						rx="0.5"
						opacity="0.9"
					/>
					<rect
						x="11.5"
						y="7.25"
						width="3"
						height="1.5"
						rx="0.5"
						opacity="0.9"
					/>
				</svg>
			</div>
		);
	}

	if (priority === "urgent") {
		const isActive =
			statusType === "started" ||
			statusType === "unstarted" ||
			statusType === "backlog";

		// For urgent statuses that are also active, we use orange as a small stylistic touch
		const fillColor = color || (isActive ? "#F97316" : colors.neutral[500]);

		return (
			<div className={`flex items-center justify-center ${sizeClass}`}>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					fill={fillColor}
					xmlns="http://www.w3.org/2000/svg"
					className={`${sizeClass} ${hoverClass} transition-all`}
				>
					<path d="M3 1C1.91067 1 1 1.91067 1 3V13C1 14.0893 1.91067 15 3 15H13C14.0893 15 15 14.0893 15 13V3C15 1.91067 14.0893 1 13 1H3ZM7 4L9 4L8.75391 8.99836H7.25L7 4ZM9 11C9 11.5523 8.55228 12 8 12C7.44772 12 7 11.5523 7 11C7 10.4477 7.44772 10 8 10C8.55228 10 9 10.4477 9 11Z" />
				</svg>
			</div>
		);
	}

	if (priority === "high") {
		return (
			<div className={`flex items-center justify-center ${sizeClass}`}>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					fill={defaultColor}
					xmlns="http://www.w3.org/2000/svg"
					className={`${sizeClass} ${hoverClass} transition-all`}
				>
					<rect x="1.5" y="8" width="3" height="6" rx="1" />
					<rect x="6.5" y="5" width="3" height="9" rx="1" />
					<rect x="11.5" y="2" width="3" height="12" rx="1" />
				</svg>
			</div>
		);
	}

	if (priority === "medium") {
		return (
			<div className={`flex items-center justify-center ${sizeClass}`}>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					fill={defaultColor}
					xmlns="http://www.w3.org/2000/svg"
					className={`${sizeClass} ${hoverClass} transition-all`}
				>
					<rect x="1.5" y="8" width="3" height="6" rx="1" />
					<rect x="6.5" y="5" width="3" height="9" rx="1" />
					<rect x="11.5" y="2" width="3" height="12" rx="1" fillOpacity="0.4" />
				</svg>
			</div>
		);
	}

	if (priority === "low") {
		return (
			<div className={`flex items-center justify-center ${sizeClass}`}>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					fill={defaultColor}
					xmlns="http://www.w3.org/2000/svg"
					className={`${sizeClass} ${hoverClass} transition-all`}
				>
					<rect x="1.5" y="8" width="3" height="6" rx="1" />
					<rect x="6.5" y="5" width="3" height="9" rx="1" fillOpacity="0.4" />
					<rect x="11.5" y="2" width="3" height="12" rx="1" fillOpacity="0.4" />
				</svg>
			</div>
		);
	}

	return null;
}
