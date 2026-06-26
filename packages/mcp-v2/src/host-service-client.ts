import { buildHostRoutingKey } from "@superset/shared/host-routing";
import SuperJSON from "superjson";

/** Default request timeout for host-service relay calls (30 s). */
const HOST_SERVICE_TIMEOUT_MS = 30_000;

export interface HostServiceCallOptions {
	relayUrl: string;
	organizationId: string;
	hostId: string;
	jwt: string;
	/** Override the fetch timeout in milliseconds. Defaults to 30 000 ms. */
	timeoutMs?: number;
}

export async function hostServiceCall<TOutput>(
	options: HostServiceCallOptions,
	procedure: string,
	method: "query" | "mutation",
	input?: unknown,
): Promise<TOutput> {
	const routingKey = buildHostRoutingKey(
		options.organizationId,
		options.hostId,
	);
	const baseUrl = `${options.relayUrl}/hosts/${routingKey}/trpc/${procedure}`;
	const headers: Record<string, string> = {
		authorization: `Bearer ${options.jwt}`,
	};

	let url = baseUrl;
	let body: string | undefined;
	if (method === "query") {
		if (input !== undefined) {
			const encoded = encodeURIComponent(
				JSON.stringify(SuperJSON.serialize(input)),
			);
			url = `${baseUrl}?input=${encoded}`;
		}
	} else {
		headers["content-type"] = "application/json";
		body = JSON.stringify(SuperJSON.serialize(input));
	}

	const timeoutMs = options.timeoutMs ?? HOST_SERVICE_TIMEOUT_MS;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	let response: Response;
	try {
		response = await fetch(url, {
			method: method === "query" ? "GET" : "POST",
			headers,
			body,
			signal: controller.signal,
		});
	} catch (error) {
		if (controller.signal.aborted) {
			throw new Error(
				`Host ${options.hostId} timed out after ${timeoutMs}ms for ${procedure}`,
			);
		}
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
	const rawBody = await response.text();
	if (!response.ok) {
		throw new Error(
			`Host ${options.hostId} returned ${response.status} for ${procedure}: ${rawBody.slice(0, 200)}`,
		);
	}

	type TrpcEnvelope = { result?: { data?: unknown } };
	let parsed: TrpcEnvelope;
	try {
		parsed = JSON.parse(rawBody) as TrpcEnvelope;
	} catch {
		throw new Error(
			`Invalid JSON from host ${options.hostId} for ${procedure}: ${rawBody.slice(0, 200)}`,
		);
	}

	const data = parsed.result?.data;
	if (data === undefined || data === null) {
		throw new Error(
			`Malformed response from host ${options.hostId} for ${procedure}`,
		);
	}
	return SuperJSON.deserialize(
		data as Parameters<typeof SuperJSON.deserialize>[0],
	) as TOutput;
}
