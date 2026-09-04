import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { StreamStatus } from "@superset/chat/client";
import type { SessionState, SessionStatus } from "@superset/chat/protocol";
import { i18n } from "@superset/i18n";
import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

const STATUS_LABELS: Record<SessionStatus, MessageDescriptor> = {
	starting: msg({ message: "Starting" }),
	running: msg({ message: "Working" }),
	awaiting_input: msg({
		message: "Needs input",
	}),
	idle: msg({ message: "Idle" }),
	not_loaded: msg({
		message: "Not loaded",
	}),
	offline: msg({ message: "Offline" }),
	dead: msg({ message: "Dead" }),
};

const CONNECTION_LABELS: Record<StreamStatus, MessageDescriptor> = {
	connecting: msg({
		message: "Connecting",
	}),
	open: msg({ message: "Live" }),
	closed: msg({ message: "Offline" }),
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
					{STATUS_LABELS[status] ? i18n._(STATUS_LABELS[status]) : status}
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
				{i18n._(CONNECTION_LABELS[connection])}
			</span>
			{right}
		</div>
	);
}
