export type WorkspaceChatTransport = "local" | "ssh";

const SSH_CHAT_REFETCH_INTERVAL_MS = 250;

export function toRefetchIntervalMs(fps: number): number {
	if (!Number.isFinite(fps) || fps <= 0) return Math.floor(1000 / 60);
	return Math.max(16, Math.floor(1000 / fps));
}

export function resolveChatRefetchIntervalMs({
	fps,
	transport,
}: {
	fps: number;
	transport: WorkspaceChatTransport;
}): number {
	if (transport === "ssh") {
		return SSH_CHAT_REFETCH_INTERVAL_MS;
	}

	return toRefetchIntervalMs(fps);
}
