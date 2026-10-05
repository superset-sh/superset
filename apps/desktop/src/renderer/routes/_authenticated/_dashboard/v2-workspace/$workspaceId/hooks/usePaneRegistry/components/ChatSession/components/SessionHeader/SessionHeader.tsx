import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { StreamStatus } from "@superset/chat/client";
import type { SessionState, SessionStatus } from "@superset/chat/protocol";
import { i18n } from "@superset/i18n";
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
		// Plain text rather than chips: this sits directly under the pane's own
		// header, and two rows of badges read louder than the transcript.
		<div className="flex items-center gap-2 border-b border-border/60 px-6 py-1.5 text-xs text-muted-foreground">
			{left}
			{session?.harness && <span className="font-mono">{session.harness}</span>}
			{status && (
				<>
					<span aria-hidden="true" className="text-border">
						·
					</span>
					<span
						className={cn(
							status === "awaiting_input" &&
								"font-medium text-amber-600 dark:text-amber-400",
							status === "dead" && "text-destructive",
						)}
					>
						{STATUS_LABELS[status] ? i18n._(STATUS_LABELS[status]) : status}
					</span>
				</>
			)}
			<span
				className={cn(
					"ml-auto flex items-center gap-1.5",
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
