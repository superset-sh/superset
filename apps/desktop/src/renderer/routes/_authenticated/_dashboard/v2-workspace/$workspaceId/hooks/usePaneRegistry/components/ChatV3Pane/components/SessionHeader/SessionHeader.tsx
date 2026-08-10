import type { StreamStatus } from "@superset/chat/client";
import type { SessionState, SessionStatus } from "@superset/chat/protocol";
import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

const STATUS_LABELS: Record<SessionStatus, string> = {
	starting: "Starting",
	running: "Working",
	awaiting_input: "Needs input",
	idle: "Idle",
	not_loaded: "Not loaded",
	offline: "Offline",
	dead: "Dead",
};

const CONNECTION_LABELS: Record<StreamStatus, string> = {
	connecting: "Connecting",
	open: "Live",
	closed: "Offline",
};

export function SessionHeader({
	connection,
	left,
	right,
	session,
}: {
	session: SessionState | null;
	connection: StreamStatus;
	left?: ReactNode;
	right?: ReactNode;
}) {
	const status = session?.status ?? null;
	return (
		<div className="flex items-center gap-2 border-b border-border px-3 py-2">
			{left}
			{session?.harness && (
				<Badge className="font-mono" variant="outline">
					{session.harness}
				</Badge>
			)}
			{status && (
				<Badge
					variant={status === "awaiting_input" ? "default" : "secondary"}
					className={cn(
						status === "awaiting_input" &&
							"bg-amber-500/15 text-amber-600 dark:text-amber-400",
					)}
				>
					{STATUS_LABELS[status] ?? status}
				</Badge>
			)}
			<span
				className={cn(
					"ml-auto flex items-center gap-1.5 text-xs",
					connection === "open" && "text-emerald-600 dark:text-emerald-400",
					connection === "connecting" && "text-muted-foreground",
					connection === "closed" && "text-destructive",
				)}
			>
				<span
					className={cn(
						"size-1.5 rounded-full",
						connection === "open" && "bg-emerald-500",
						connection === "connecting" && "animate-pulse bg-muted-foreground",
						connection === "closed" && "bg-destructive",
					)}
				/>
				{CONNECTION_LABELS[connection]}
			</span>
			{right}
		</div>
	);
}
