import { buildHostRoutingKey } from "@superset/shared/host-routing";
import SuperJSON from "superjson";

export interface HostServiceCallOptions {
	relayUrl: string;
	organizationId: string;
	hostId: string;
	jwt: string;
	timeoutMs?: number;
}

export class HostServiceCallError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly body: string,
	) {
		super(message);
		this.name = "HostServiceCallError";
	}
}

export async function hostServiceMutation<TInput, TOutput>(
	options: HostServiceCallOptions,
	procedure: string,
	input: TInput,
): Promise<TOutput> {
	const routingKey = buildHostRoutingKey(
		options.organizationId,
		options.hostId,
	);
	const url = `${options.relayUrl}/hosts/${routingKey}/trpc/${procedure}`;
	const encoded = SuperJSON.serialize(input);

	const controller = new AbortController();
	const timer = setTimeout(
		() => controller.abort(),
		options.timeoutMs ?? 25_000,
	);

	let response: Response;
	try {
		response = await fetch(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${options.jwt}`,
			},
			body: JSON.stringify(encoded),
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timer);
	}

	const rawBody = await response.text();
	if (!response.ok) {
		throw new HostServiceCallError(
			`relay ${response.status}: ${rawBody.slice(0, 500)}`,
			response.status,
			rawBody,
		);
	}

	type TrpcEnvelope = { result?: { data?: unknown } };
	let parsed: TrpcEnvelope;
	try {
		parsed = JSON.parse(rawBody) as TrpcEnvelope;
	} catch {
		throw new HostServiceCallError(
			`invalid JSON from relay: ${rawBody.slice(0, 200)}`,
			response.status,
			rawBody,
		);
	}

	const data = parsed.result?.data;
	return SuperJSON.deserialize(
		data as Parameters<typeof SuperJSON.deserialize>[0],
	) as TOutput;
}
