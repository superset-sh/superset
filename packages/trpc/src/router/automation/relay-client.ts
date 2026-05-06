import SuperJSON from "superjson";

/**
 * Minimal tRPC-over-HTTP client for cloud API → relay → host-service calls.
 *
 * We don't import the host-service's AppRouter type here because it would
 * pull host-only modules (better-sqlite3, node-pty, etc) into the cloud
 * bundle. Instead, each caller inlines the input/output types they need
 * and this helper just handles transport.
 */
export interface RelayClientOptions {
	relayUrl: string;
	hostId: string;
	jwt: string;
	timeoutMs?: number;
}

export class RelayDispatchError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly body: string,
	) {
		super(message);
		this.name = "RelayDispatchError";
	}
}

/**
 * Invoke a single host-service tRPC mutation through the relay proxy.
 *
 * tRPC HTTP protocol (non-batched): POST body is `{ json: <input> }` when
 * using SuperJSON transformer, and the server response is
 * `{ result: { data: { json: <output> } } }`.
 */
export async function relayMutation<TInput, TOutput>(
	options: RelayClientOptions,
	procedure: string,
	input: TInput,
): Promise<TOutput> {
	const url = `${options.relayUrl}/hosts/${options.hostId}/trpc/${procedure}`;
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
		throw new RelayDispatchError(
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
		throw new RelayDispatchError(
			`invalid JSON from relay: ${rawBody.slice(0, 200)}`,
			response.status,
			rawBody,
		);
	}

	if (!parsed.result || parsed.result.data === undefined) {
		throw new RelayDispatchError(
			`missing result.data in relay response: ${rawBody.slice(0, 200)}`,
			response.status,
			rawBody,
		);
	}

	return SuperJSON.deserialize(parsed.result.data as never) as TOutput;
}
