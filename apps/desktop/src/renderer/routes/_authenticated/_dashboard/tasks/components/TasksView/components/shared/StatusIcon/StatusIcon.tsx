import { cn } from "@superset/ui/utils";

export type StatusType =
	| "backlog"
	| "unstarted"
	| "started"
	| "completed"
	| "canceled";

interface StatusIconProps {
	type: StatusType;
	color: string;
	showHover?: boolean;
	className?: string;
	progress?: number;
}

export function StatusIcon({
	type,
	color,
	showHover = false,
	className,
	progress,
}: StatusIconProps) {
	const sizeClass = "w-3.5 h-3.5";

	const containerClasses = cn(
		"flex items-center justify-center rounded-full flex-shrink-0",
		sizeClass,
		showHover && "transition-all hover:brightness-120 duration-100",
		className,
	);

	if (type === "backlog") {
		return (
			<div className={containerClasses}>
				<svg
					aria-hidden="true"
					viewBox="0 0 14 14"
					className={sizeClass}
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<circle
						cx="7"
						cy="7"
						r="6"
						stroke={color}
						strokeWidth="1.5"
						strokeDasharray="1.4 1.74"
						strokeDashoffset="0.65"
					/>
				</svg>
			</div>
		);
	}

	if (type === "unstarted") {
		return (
			<div className={containerClasses}>
				<svg
					aria-hidden="true"
					viewBox="0 0 14 14"
					className={sizeClass}
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<circle cx="7" cy="7" r="6" stroke={color} strokeWidth="1.5" />
				</svg>
			</div>
		);
	}

	if (type === "started") {
		// Progress fills clockwise starting from 12 o'clock
		const centerRadius = 2;
		const centerCircumference = 2 * Math.PI * centerRadius;
		const progressPercent = progress ?? 100;

		// Dash length is the visible portion (progress%)
		const dashLength = (progressPercent / 100) * centerCircumference;
		const gapLength = centerCircumference - dashLength;

		return (
			<div className={containerClasses}>
				<svg
					aria-hidden="true"
					viewBox="0 0 14 14"
					className={sizeClass}
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<circle
						cx="7"
						cy="7"
						r="6"
						stroke={color}
						strokeWidth="1.5"
						strokeDasharray="3.14 0"
						strokeDashoffset="-0.7"
					/>
					<circle
						cx="7"
						cy="7"
						r={centerRadius}
						stroke={color}
						strokeWidth="4"
						strokeDasharray={`${dashLength} ${gapLength}`}
						transform="rotate(-90 7 7)"
					/>
				</svg>
			</div>
		);
	}

	if (type === "completed") {
		return (
			<div className={containerClasses}>
				<svg
					aria-hidden="true"
					viewBox="0 0 14 14"
					className={sizeClass}
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<circle
						cx="7"
						cy="7"
						r="6"
						stroke={color}
						strokeWidth="1.5"
						strokeDasharray="3.14 0"
						strokeDashoffset="-0.7"
					/>
					<circle cx="7" cy="7" r="3" stroke={color} strokeWidth="6" />
					<path
						className="fill-background"
						stroke="none"
						d="M10.951 4.24896C11.283 4.58091 11.283 5.11909 10.951 5.45104L5.95104 10.451C5.61909 10.783 5.0809 10.783 4.74896 10.451L2.74896 8.45104C2.41701 8.11909 2.41701 7.5809 2.74896 7.24896C3.0809 6.91701 3.61909 6.91701 3.95104 7.24896L5.35 8.64792L9.74896 4.24896C10.0809 3.91701 10.6191 3.91701 10.951 4.24896Z"
					/>
				</svg>
			</div>
		);
	}

	if (type === "canceled") {
		return (
			<div className={containerClasses}>
				<svg
					aria-hidden="true"
					viewBox="0 0 14 14"
					className={sizeClass}
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<circle
						cx="7"
						cy="7"
						r="6"
						stroke={color}
						strokeWidth="1.5"
						strokeDasharray="3.14 0"
						strokeDashoffset="-0.7"
					/>

					<path
						className="fill-background"
						stroke="none"
						d="M3.73657 3.73657C4.05199 3.42114 4.56339 3.42114 4.87881 3.73657L5.93941 4.79716L7 5.85775L9.12117 3.73657C9.4366 3.42114 9.94801 3.42114 10.2634 3.73657C10.5789 4.05199 10.5789 4.56339 10.2634 4.87881L8.14225 7L10.2634 9.12118C10.5789 9.4366 10.5789 9.94801 10.2634 10.2634C9.94801 10.5789 9.4366 10.5789 9.12117 10.2634L7 8.14225L4.87881 10.2634C4.56339 10.5789 4.05199 10.5789 3.73657 10.2634C3.42114 9.94801 3.42114 9.4366 3.73657 9.12118L4.79716 8.06059L5.85775 7L3.73657 4.87881C3.42114 4.56339 3.42114 4.05199 3.73657 3.73657Z"
					/>
				</svg>
			</div>
		);
	}

	return (
		<div className={containerClasses}>
			<svg
				aria-hidden="true"
				viewBox="0 0 14 14"
				className={sizeClass}
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<circle cx="7" cy="7" r="6" stroke={color} strokeWidth="1.5" />
			</svg>
		</div>
	);
}
