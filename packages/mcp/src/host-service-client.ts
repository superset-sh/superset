import { buildHostRoutingKey } from "@superset/shared/host-routing";
import SuperJSON from "superjson";

/**
 * Nothing that speaks host-service answered: the network failed, or the
 * address no longer leads to it (a stopped or moved sandbox). A host-service
 * error response is not this — it means the call reached the host.
 */
export class HostServiceUnreachableError extends Error {}

export type HostServiceCallOptions =
	| {
			relayUrl: string;
			organizationId: string;
			hostId: string;
			jwt: string;
	  }
	/** host-service inside a cloud workspace's sandbox, through the gate. */
	| { gateUrl: string; ticket: string; workspaceId: string };

export async function hostServiceCall<TOutput>(
	options: HostServiceCallOptions,
	procedure: string,
	method: "query" | "mutation",
	input?: unknown,
	request: { signal?: AbortSignal } = {},
): Promise<TOutput> {
	const label =
		"gateUrl" in options
			? `cloud workspace ${options.workspaceId}`
			: `host ${options.hostId}`;
	const baseUrl =
		"gateUrl" in options
			? `${options.gateUrl}/trpc/${procedure}`
			: `${options.relayUrl}/hosts/${buildHostRoutingKey(options.organizationId, options.hostId)}/trpc/${procedure}`;
	const headers: Record<string, string> = {
		authorization: `Bearer ${"gateUrl" in options ? options.ticket : options.jwt}`,
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

	let response: Response;
	try {
		response = await fetch(url, {
			method: method === "query" ? "GET" : "POST",
			headers,
			body,
			signal: request.signal,
		});
	} catch (error) {
		throw new HostServiceUnreachableError(
			`${label} could not be reached for ${procedure}: ${String(error)}`,
		);
	}
	const rawBody = await response.text();
	if (!response.ok) {
		const message = `${label} returned ${response.status} for ${procedure}: ${rawBody.slice(0, 200)}`;
		throw isTrpcErrorBody(rawBody)
			? new Error(message)
			: new HostServiceUnreachableError(message);
	}

	type TrpcEnvelope = { result?: { data?: unknown } };
	let parsed: TrpcEnvelope;
	try {
		parsed = JSON.parse(rawBody) as TrpcEnvelope;
	} catch {
		throw new Error(
			`Invalid JSON from ${label} for ${procedure}: ${rawBody.slice(0, 200)}`,
		);
	}

	const data = parsed.result?.data;
	if (data === undefined || data === null) {
		throw new Error(`Malformed response from ${label} for ${procedure}`);
	}
	return SuperJSON.deserialize(
		data as Parameters<typeof SuperJSON.deserialize>[0],
	) as TOutput;
}

function isTrpcErrorBody(body: string): boolean {
	try {
		const parsed: unknown = JSON.parse(body);
		return typeof parsed === "object" && parsed !== null && "error" in parsed;
	} catch {
		return false;
	}
}
