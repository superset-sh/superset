import type React from "react";

export type TaskStatus = "planning" | "working" | "needs-feedback" | "ready-to-merge";

interface StatusIndicatorProps {
	status: TaskStatus;
	showLabel?: boolean;
	size?: "xs" | "sm" | "md";
}

const STATUS_CONFIG: Record<
	TaskStatus,
	{ label: string; color: string; type: "dashed" | "filled" | "pulsing" }
> = {
	planning: {
		label: "Planning",
		color: "rgb(59, 130, 246)", // blue-500
		type: "dashed",
	},
	working: {
		label: "Working",
		color: "rgb(234, 179, 8)", // yellow-500
		type: "pulsing",
	},
	"needs-feedback": {
		label: "Needs Feedback",
		color: "rgb(239, 68, 68)", // red-500
		type: "filled",
	},
	"ready-to-merge": {
		label: "Ready to Merge",
		color: "rgb(34, 197, 94)", // green-500
		type: "filled",
	},
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
	status,
	showLabel = true,
	size = "sm",
}) => {
	const config = STATUS_CONFIG[status];
	const circleSize = size === "xs" ? 8 : size === "sm" ? 10 : 14;
	const strokeWidth = 1.5;

	return (
		<div className="flex items-center gap-1.5">
			<div
				className="relative"
				style={{ width: circleSize, height: circleSize }}
			>
				{/* Main circle */}
				<svg
					width={circleSize}
					height={circleSize}
					viewBox={`0 0 ${circleSize} ${circleSize}`}
				>
					{config.type === "dashed" ? (
						<circle
							cx={circleSize / 2}
							cy={circleSize / 2}
							r={circleSize / 2 - strokeWidth / 2}
							fill="none"
							stroke={config.color}
							strokeWidth={strokeWidth}
							strokeDasharray="2 1.5"
						/>
					) : (
						<circle
							cx={circleSize / 2}
							cy={circleSize / 2}
							r={circleSize / 2}
							fill={config.color}
						/>
					)}
				</svg>

				{/* Pulsing ring animation for working status */}
				{config.type === "pulsing" && (
					<>
						<span
							className="absolute inset-0 rounded-full animate-ping opacity-75"
							style={{ backgroundColor: config.color }}
						/>
						<span
							className="absolute inset-0 rounded-full"
							style={{ backgroundColor: config.color }}
						/>
					</>
				)}
			</div>
			{showLabel && (
				<span className="text-xs text-neutral-400">{config.label}</span>
			)}
		</div>
	);
};
