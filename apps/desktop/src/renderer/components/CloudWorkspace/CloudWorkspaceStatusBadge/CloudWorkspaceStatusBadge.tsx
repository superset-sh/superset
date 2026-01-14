import type { CloudWorkspaceStatus } from "@superset/db/schema";
import { cn } from "@superset/ui/utils";
import {
	HiOutlineCloud,
	HiOutlinePause,
	HiOutlinePlay,
	HiOutlineXCircle,
} from "react-icons/hi2";
import { ImSpinner8 } from "react-icons/im";

const STATUS_CONFIG = {
	provisioning: {
		icon: ImSpinner8,
		label: "Provisioning",
		bgColor: "bg-blue-500/20",
		textColor: "text-blue-400",
		animate: true,
	},
	running: {
		icon: HiOutlinePlay,
		label: "Running",
		bgColor: "bg-green-500/20",
		textColor: "text-green-400",
		animate: false,
	},
	paused: {
		icon: HiOutlinePause,
		label: "Paused",
		bgColor: "bg-amber-500/20",
		textColor: "text-amber-400",
		animate: false,
	},
	stopped: {
		icon: HiOutlineCloud,
		label: "Stopped",
		bgColor: "bg-muted",
		textColor: "text-muted-foreground",
		animate: false,
	},
	error: {
		icon: HiOutlineXCircle,
		label: "Error",
		bgColor: "bg-red-500/20",
		textColor: "text-red-400",
		animate: false,
	},
} as const satisfies Record<
	CloudWorkspaceStatus,
	{
		icon: React.ComponentType<{ className?: string }>;
		label: string;
		bgColor: string;
		textColor: string;
		animate: boolean;
	}
>;

interface CloudWorkspaceStatusBadgeProps {
	status: CloudWorkspaceStatus;
	showLabel?: boolean;
	size?: "sm" | "md";
}

export function CloudWorkspaceStatusBadge({
	status,
	showLabel = true,
	size = "md",
}: CloudWorkspaceStatusBadgeProps) {
	const config = STATUS_CONFIG[status];
	const Icon = config.icon;

	return (
		<div
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
				config.bgColor,
				config.textColor,
				size === "sm" && "px-1.5 py-0.5 text-xs",
				size === "md" && "px-2 py-0.5 text-sm",
			)}
		>
			<Icon
				className={cn(
					size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5",
					config.animate && "animate-spin",
				)}
			/>
			{showLabel && <span className="font-medium">{config.label}</span>}
		</div>
	);
}
