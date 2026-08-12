import { buildHostRoutingKey } from "@superset/shared/host-routing";
import SuperJSON from "superjson";

export interface HostServiceCallOptions {
	relayUrl: string;
	organizationId: string;
	hostId: string;
	jwt: string;
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

	const response = await fetch(url, {
		method: method === "query" ? "GET" : "POST",
		headers,
		body,
	});
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
