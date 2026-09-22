import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { credentialFetch } from "../manifest";

const UPSTREAM_TIMEOUT_MS = 120_000;

export interface UpstreamTarget {
	url: string;
	headers: Record<string, string>;
}

export interface UpstreamSession {
	client: Client;
	close(): Promise<void>;
}

export async function upstreamClient(
	target: UpstreamTarget,
): Promise<UpstreamSession> {
	const client = new Client({ name: "superset", version: "1.0.0" });
	const transport = new StreamableHTTPClientTransport(new URL(target.url), {
		requestInit: { headers: target.headers },
		fetch: (url, init) =>
			credentialFetch(String(url), init ?? {}, "mcp", UPSTREAM_TIMEOUT_MS),
	});
	await client.connect(transport);

	return {
		client,
		async close() {
			// close() only aborts our end, so the vendor holds the session open
			// until it expires on its own. The DELETE is what releases it, and a
			// server that refuses one is not a reason to fail the call that just
			// succeeded.
			try {
				await transport.terminateSession();
			} catch {}
			await client.close();
		},
	};
}
