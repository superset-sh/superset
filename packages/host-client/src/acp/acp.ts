import type {
	AcpSessionsApi,
	SessionScopedState,
	SessionsPage,
} from "@superset/session-protocol";
import type { HostTransport } from "../transport";

/**
 * ACP-sessions surface of a host, bound to a transport. Inputs/outputs are
 * typed via @superset/session-protocol — the same contracts the host router
 * implements — so clients never import the host's own modules.
 */
export interface AcpHostClient {
	listSessions(routingKey: string, workspaceId: string): Promise<SessionsPage>;
	createSession(
		routingKey: string,
		input: { sessionId: string; workspaceId: string },
	): Promise<SessionScopedState>;
	/** Command/read API for one host, shaped for useAcpSession. */
	sessionsApi(routingKey: string): AcpSessionsApi;
	/** WS URL factory for a session's live update stream. */
	streamUrl(options: {
		routingKey: string;
		sessionId: string;
	}): () => Promise<string>;
}

export function createAcpHostClient(transport: HostTransport): AcpHostClient {
	const call = <TOutput>(
		routingKey: string,
		procedure: string,
		input: unknown,
		method: "GET" | "POST",
	) => transport.call<TOutput>({ routingKey, procedure, input, method });

	return {
		listSessions: (routingKey, workspaceId) =>
			call(routingKey, "acpSessions.list", { workspaceId }, "GET"),
		createSession: (routingKey, input) =>
			call(routingKey, "acpSessions.create", input, "POST"),
		sessionsApi: (routingKey) => ({
			get: (input) => call(routingKey, "acpSessions.get", input, "GET"),
			getMessages: (input) =>
				call(routingKey, "acpSessions.getMessages", input, "GET"),
			prompt: (input) => call(routingKey, "acpSessions.prompt", input, "POST"),
			respondToPermission: (input) =>
				call(routingKey, "acpSessions.respondToPermission", input, "POST"),
			cancel: (input) => call(routingKey, "acpSessions.cancel", input, "POST"),
			setMode: (input) =>
				call(routingKey, "acpSessions.setMode", input, "POST"),
			setConfigOption: (input) =>
				call(routingKey, "acpSessions.setConfigOption", input, "POST"),
		}),
		streamUrl: ({ routingKey, sessionId }) =>
			transport.streamUrl({
				routingKey,
				path: `acp-sessions/${encodeURIComponent(sessionId)}/stream`,
			}),
	};
}
