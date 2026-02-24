import { DurableStream, IdempotentProducer } from "@durable-streams/client";

export interface ChatMastraStreamsConfig {
	apiBaseUrl: string;
	routePrefix?: string;
	getHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
	fetchImpl?: typeof fetch;
}

export interface EnsureSessionStreamInput {
	sessionId: string;
	organizationId: string;
	workspaceId?: string;
}

export type SessionStreamProducer = IdempotentProducer;

function trimTrailingSlash(value: string): string {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeRoutePrefix(routePrefix: string | undefined): string {
	const value = routePrefix?.trim() || "/api/chat";
	return value.startsWith("/") ? value : `/${value}`;
}

function resolveSessionBaseUrl(
	config: ChatMastraStreamsConfig,
	sessionId: string,
): string {
	const base = trimTrailingSlash(config.apiBaseUrl);
	const prefix = normalizeRoutePrefix(config.routePrefix);
	return `${base}${prefix}/${sessionId}`;
}

async function resolveHeaders(
	config: ChatMastraStreamsConfig,
): Promise<Record<string, string>> {
	return (await config.getHeaders?.()) ?? {};
}

export async function ensureSessionStream(
	config: ChatMastraStreamsConfig,
	input: EnsureSessionStreamInput,
): Promise<void> {
	const fetchImpl = config.fetchImpl ?? fetch;
	const headers = await resolveHeaders(config);
	const response = await fetchImpl(
		resolveSessionBaseUrl(config, input.sessionId),
		{
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				...headers,
			},
			body: JSON.stringify({
				organizationId: input.organizationId,
				...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
			}),
		},
	);

	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(
			`Failed to ensure stream for session ${input.sessionId}: ${response.status} ${text}`,
		);
	}
}

function getSessionStreamReadUrl(
	config: ChatMastraStreamsConfig,
	sessionId: string,
): string {
	return `${resolveSessionBaseUrl(config, sessionId)}/stream`;
}

export function createSessionStreamProducer(
	config: ChatMastraStreamsConfig,
	sessionId: string,
): SessionStreamProducer {
	const fetchImpl = config.fetchImpl ?? fetch;
	const fetchWithAuth = async (
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> => {
		const headers = new Headers(init?.headers);
		const authHeaders = await resolveHeaders(config);
		for (const [key, value] of Object.entries(authHeaders)) {
			headers.set(key, value);
		}
		return fetchImpl(input, {
			...init,
			headers,
		});
	};

	const durableStream = new DurableStream({
		url: getSessionStreamReadUrl(config, sessionId),
		contentType: "application/json",
		fetch: fetchWithAuth as typeof fetch,
	});

	return new IdempotentProducer(durableStream, sessionId, {
		autoClaim: true,
		lingerMs: 100,
		maxInFlight: 50,
		fetch: fetchWithAuth as typeof fetch,
	});
}
