import SuperJSON from "superjson";
import { getAuthToken } from "./auth-token";
import { getRelayUrl } from "./relay-url";

// Direct browser → relay → host-service tRPC calls, the same path the
// desktop uses. Inputs/outputs are typed at the boundary rather than via
// the host AppRouter: importing `@superset/host-service` drags host-only
// modules into the web's type-check, which is the reason the cloud's
// `relay-client.ts` also hand-types its host calls.

export interface HostTerminalSession {
	terminalId: string;
	workspaceId: string;
	exited: boolean;
	title: string | null;
}

async function hostCall<TOutput>(
	routingKey: string,
	procedure: string,
	input: unknown,
	method: "GET" | "POST",
): Promise<TOutput> {
	const token = await getAuthToken();
	const encoded = SuperJSON.serialize(input);
	const base = `${getRelayUrl()}/hosts/${routingKey}/trpc/${procedure}`;
	const url =
		method === "GET"
			? `${base}?input=${encodeURIComponent(JSON.stringify(encoded))}`
			: base;

	const response = await fetch(url, {
		method,
		headers: {
			authorization: `Bearer ${token}`,
			...(method === "POST" ? { "content-type": "application/json" } : {}),
		},
		body: method === "POST" ? JSON.stringify(encoded) : undefined,
	});
	if (!response.ok) {
		throw new Error(`host ${procedure} failed (${response.status})`);
	}

	const parsed = (await response.json()) as { result?: { data?: unknown } };
	if (!parsed.result || parsed.result.data === undefined) {
		throw new Error(`host ${procedure}: malformed relay response`);
	}
	return SuperJSON.deserialize(parsed.result.data as never) as TOutput;
}

export function listHostTerminals(routingKey: string, workspaceId: string) {
	return hostCall<{ sessions: HostTerminalSession[] }>(
		routingKey,
		"terminal.listSessions",
		{ workspaceId },
		"GET",
	);
}

export function createHostTerminal(routingKey: string, workspaceId: string) {
	return hostCall<{ terminalId: string; status: string }>(
		routingKey,
		"terminal.createSession",
		{ workspaceId },
		"POST",
	);
}
