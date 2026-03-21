"use client";

import type { WorkspaceStatus } from "../../types";

interface StatusIndicatorProps {
	status: WorkspaceStatus;
}

const STATUS_STYLES: Record<
	WorkspaceStatus,
	{ dot: string; ping: string; pulse: boolean }
> = {
	permission: { ping: "bg-red-400/45", dot: "bg-red-400/80", pulse: true },
	working: {
		ping: "bg-orange-500/35",
		dot: "bg-orange-500/80",
		pulse: true,
	},
	review: { ping: "", dot: "bg-emerald-400/75", pulse: false },
};

export function StatusIndicator({ status }: StatusIndicatorProps) {
	const config = STATUS_STYLES[status];

	return (
		<span className="relative flex size-1.5 shrink-0">
			{config.pulse && (
				<span
					className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${config.ping}`}
				/>
			)}
			<span
				className={`relative inline-flex size-1.5 rounded-full ${config.dot}`}
			/>
		</span>
	);
}
