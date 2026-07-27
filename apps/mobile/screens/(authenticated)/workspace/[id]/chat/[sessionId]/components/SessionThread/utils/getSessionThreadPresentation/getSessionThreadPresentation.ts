import type { SessionStreamStatus } from "@superset/host-service-sync/client";
import type { SessionRunState } from "@superset/host-service-sync/protocol";

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
	runState,
	streamStatus,
	isLoading,
	errorText,
}: {
	runState: SessionRunState | undefined;
	streamStatus: SessionStreamStatus | undefined;
	isLoading: boolean;
	errorText: string | null;
}): SessionThreadPresentation {
	const isDead = runState === "closed" || runState === "failed";
	// A blocking permission ask keeps runState "running" — the canonical run
	// state has no separate awaiting_permission arm.
	const canCompose =
		runState === "idle" || runState === "running" || runState === "cancelling";
	const composerStatus =
		runState === "running" || runState === "cancelling"
			? ("streaming" as const)
			: ("ready" as const);

	return {
		bannerError: errorText,
		canCompose,
		composerStatus,
		isDead,
		reconnecting: streamStatus === "reset" && !isDead,
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
