import type { HostServiceClient } from "renderer/lib/host-service-client";

/**
 * What each source terminal was in the middle of, as text a new agent can be
 * seeded with. `terminal.transcript` is the existing handoff path: it prefers
 * the harness's own transcript and falls back to the sanitized PTY stream, so
 * it works for any agent and for plain shells too. Gathered before anything
 * is captured, while the source is still exactly as the user left it.
 */
export async function collectHandoffContext(
	source: HostServiceClient,
	workspaceId: string,
	terminalIds: readonly string[],
): Promise<Map<string, string>> {
	const transcripts = await Promise.all(
		terminalIds.map(async (terminalId) => {
			const transcript = await source.terminal.transcript
				.query({ workspaceId, terminalId })
				.catch(() => null);
			return [terminalId, transcript?.text?.trim() ?? ""] as const;
		}),
	);
	return new Map(transcripts.filter(([, text]) => text.length > 0));
}

/** Resolve after `ms`, for the polling loops below and in the adapters. */
export const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));
