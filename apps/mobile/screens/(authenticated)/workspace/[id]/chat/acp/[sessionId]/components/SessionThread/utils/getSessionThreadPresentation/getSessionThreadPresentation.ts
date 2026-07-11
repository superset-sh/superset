import type { SessionStatus } from "@superset/session-protocol";
import type { StreamStatus } from "@superset/session-protocol/client";

export interface SessionThreadPresentation {
	bannerError: string | null;
	canCompose: boolean;
	composerStatus: "ready" | "streaming";
	emptyDescription: string | undefined;
	emptyTitle: string;
	isDead: boolean;
	reconnecting: boolean;
}

export function getSessionThreadPresentation({
	status,
	streamStatus,
	isLoading,
	errorText,
}: {
	status: SessionStatus | undefined;
	streamStatus: StreamStatus;
	isLoading: boolean;
	errorText: string | null;
}): SessionThreadPresentation {
	const isDead = status === "dead";
	const canCompose =
		status === "idle" ||
		status === "running" ||
		status === "awaiting_permission";
	const composerStatus =
		status === "running" || status === "awaiting_permission"
			? ("streaming" as const)
			: ("ready" as const);

	return {
		bannerError: errorText,
		canCompose,
		composerStatus,
		isDead,
		reconnecting: streamStatus === "reconnecting" && !isDead,
		emptyTitle: isLoading
			? "Connecting…"
			: errorText
				? "Session could not be resumed"
				: "No messages yet",
		emptyDescription: isLoading
			? undefined
			: errorText
				? "The host kept the session pointer, but its native transcript could not be loaded."
				: "Send a prompt to start the agent.",
	};
}
